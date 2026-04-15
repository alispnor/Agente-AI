import "./loadEnv.js";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import Orchestrator from "./orchestrator/orchestrator.js";
import {
  carregarProjetos,
  registrarProjeto,
  buscarProjeto,
  removerProjeto,
} from "./project/projectRegistry.js";
import {
  carregarHistoricoProjeto,
  carregarTodoHistorico,
  carregarExecucaoPorId,
} from "./history/historyManager.js";
import { listarRelatorios } from "./history/reportGenerator.js";
import type { ApiProjectBody, ApiRunBody } from "./types/index.js";
import { IGNORED_DIRS } from "./project/projectReader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC_INDEX = path.join(ROOT, "public", "index.html");
const REPORTS_DIR = path.join(ROOT, "reports");

const PORT = Number(process.env["PORT"]) || 3000;
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BODY = 2 * 1024 * 1024;

function ensureDirs(): void {
  fs.mkdirSync(path.join(ROOT, "data", "history"), { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse<T>(res: ServerResponse, status: number, data: T): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(JSON.stringify(data));
}

function readBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Body demasiado grande"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(buf.toString("utf8")) as T);
      } catch {
        reject(new Error("JSON inválido no body"));
      }
    });
    req.on("error", reject);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout após 5 minutos")), ms)
    ),
  ]);
}

interface ValidatePathResponse {
  exists: boolean;
  absolute: string;
  readable: boolean;
  isDirectory: boolean;
  files: number;
  stack: string | null;
  frameworks: string[];
  suggestion: string | null;
}

interface BrowseResponse {
  current: string;
  parent: string | null;
  dirs: Array<{ nome: string; caminho: string }>;
}

function detectStack(caminho: string): { stack: string; frameworks: string[] } {
  let entries: string[];
  try {
    entries = fs.readdirSync(caminho).map((f) => f.toLowerCase());
  } catch {
    return { stack: "mixed", frameworks: [] };
  }
  const raiz = entries;
  let pkg: Record<string, unknown> | null = null;
  if (raiz.includes("package.json")) {
    try {
      pkg = JSON.parse(
        fs.readFileSync(path.join(caminho, "package.json"), "utf8")
      ) as Record<string, unknown>;
    } catch {
      pkg = null;
    }
  }

  const deps: Record<string, unknown> = {
    ...(typeof pkg?.["dependencies"] === "object" && pkg?.["dependencies"] !== null
      ? (pkg["dependencies"] as Record<string, unknown>)
      : {}),
    ...(typeof pkg?.["devDependencies"] === "object" && pkg?.["devDependencies"] !== null
      ? (pkg["devDependencies"] as Record<string, unknown>)
      : {}),
  };

  const frameworks: string[] = [];

  if (deps["react"]) frameworks.push("React");
  if (deps["react-native"]) frameworks.push("React Native");
  if (deps["@angular/core"]) frameworks.push("Angular");
  if (deps["vue"]) frameworks.push("Vue");
  if (deps["next"]) frameworks.push("Next.js");
  if (deps["nuxt"]) frameworks.push("Nuxt");
  if (deps["express"]) frameworks.push("Express");
  if (raiz.includes("pubspec.yaml")) frameworks.push("Flutter");
  if (raiz.includes("requirements.txt") || raiz.includes("pyproject.toml"))
    frameworks.push("Python");
  if (raiz.includes("artisan")) frameworks.push("Laravel");
  if (raiz.includes("go.mod")) frameworks.push("Go");
  if (raiz.includes("pom.xml")) frameworks.push("Java/Spring");

  let stack: string;
  if (raiz.includes("pubspec.yaml")) stack = "flutter";
  else if (raiz.includes("requirements.txt") || raiz.includes("pyproject.toml"))
    stack = "python";
  else if (raiz.includes("artisan")) stack = "php";
  else if (pkg && deps["react-native"]) stack = "react-native";
  else if (pkg) stack = "node";
  else stack = "mixed";

  return { stack, frameworks };
}

function countFilesLevel1(dir: string): number {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile())
      .length;
  } catch {
    return 0;
  }
}

function suggestNearbyPath(caminhoInput: string): string | null {
  const resolved = path.resolve(caminhoInput);
  const parent = path.dirname(resolved);
  const base = path.basename(resolved);
  try {
    if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
      return null;
    }
    const names = fs.readdirSync(parent);
    const lower = base.toLowerCase();
    const prefix = lower.slice(0, Math.min(3, lower.length));
    const match =
      names.find(
        (d) =>
          d.toLowerCase().includes(prefix) ||
          prefix.length > 0 && d.toLowerCase().startsWith(prefix)
      ) ?? names[0];
    if (match && match !== base) {
      return path.join(parent, match);
    }
  } catch {
    return null;
  }
  return null;
}

function safeReportBasename(name: string | null): string | null {
  if (!name || typeof name !== "string") return null;
  const base = path.basename(name.trim());
  if (!base || base.includes("..") || base.includes("/") || base.includes("\\")) {
    return null;
  }
  if (!base.endsWith(".txt")) return null;
  return base;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const u = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const pathname = u.pathname;
  const method = req.method ?? "GET";

  try {
    if (method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (pathname === "/api/health" && method === "GET") {
      jsonResponse(res, 200, {
        status: "ok",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (pathname === "/api/projects" && method === "GET") {
      const projects = carregarProjetos();
      jsonResponse(res, 200, projects);
      return;
    }

    if (pathname === "/api/projects/validate" && method === "POST") {
      const body = await readBody<{ caminho?: string }>(req);
      const raw = body.caminho;
      if (raw === undefined || String(raw).trim() === "") {
        jsonResponse(res, 400, { error: "caminho é obrigatório" });
        return;
      }
      const absolute = path.resolve(String(raw).trim());
      const out: ValidatePathResponse = {
        exists: false,
        absolute,
        readable: false,
        isDirectory: false,
        files: 0,
        stack: null,
        frameworks: [],
        suggestion: null,
      };
      if (!fs.existsSync(absolute)) {
        out.suggestion = suggestNearbyPath(String(raw));
        jsonResponse(res, 200, out);
        return;
      }
      try {
        fs.accessSync(absolute, fs.constants.R_OK);
        out.readable = true;
      } catch {
        out.readable = false;
      }
      let st: fs.Stats;
      try {
        st = fs.statSync(absolute);
      } catch {
        jsonResponse(res, 200, out);
        return;
      }
      out.exists = true;
      out.isDirectory = st.isDirectory();
      if (out.isDirectory) {
        out.files = countFilesLevel1(absolute);
        const det = detectStack(absolute);
        out.stack = det.stack;
        out.frameworks = det.frameworks;
      }
      jsonResponse(res, 200, out);
      return;
    }

    if (pathname === "/api/projects/browse" && method === "GET") {
      const raw = u.searchParams.get("path") ?? "";
      const current = path.resolve(
        raw.trim() === "" ? os.homedir() : raw.trim()
      );
      if (!fs.existsSync(current)) {
        jsonResponse(res, 404, { error: "Caminho não encontrado" });
        return;
      }
      let st: fs.Stats;
      try {
        st = fs.statSync(current);
      } catch {
        jsonResponse(res, 404, { error: "Não foi possível ler o caminho" });
        return;
      }
      if (!st.isDirectory()) {
        jsonResponse(res, 400, { error: "O caminho não é um diretório" });
        return;
      }
      const parentDir = path.dirname(current);
      const parent =
        parentDir === current ? null : parentDir;
      const dirs: BrowseResponse["dirs"] = [];
      try {
        const ents = fs.readdirSync(current, { withFileTypes: true });
        for (const ent of ents) {
          if (!ent.isDirectory()) continue;
          if (IGNORED_DIRS.has(ent.name)) continue;
          const caminho = path.join(current, ent.name);
          dirs.push({ nome: ent.name, caminho });
        }
      } catch {
        jsonResponse(res, 403, { error: "Sem permissão para listar este diretório" });
        return;
      }
      dirs.sort((a, b) => a.nome.localeCompare(b.nome));
      const payload: BrowseResponse = { current, parent, dirs };
      jsonResponse(res, 200, payload);
      return;
    }

    if (pathname === "/api/projects" && method === "POST") {
      const body = await readBody<ApiProjectBody>(req);
      const caminho = body.caminho;
      const nome = body.nome;
      const descricao = body.descricao ?? "";
      if (!caminho || !nome) {
        jsonResponse(res, 400, { error: "caminho e nome são obrigatórios" });
        return;
      }
      const resolved = path.resolve(String(caminho).trim());
      if (!fs.existsSync(resolved)) {
        jsonResponse(res, 422, {
          error: `Caminho não encontrado no servidor: ${caminho}. Use o botão Validar antes de cadastrar.`,
        });
        return;
      }
      const p = registrarProjeto(String(nome).trim(), String(caminho), String(descricao));
      jsonResponse(res, 201, p);
      return;
    }

    const delMatch = /^\/api\/projects\/([^/]+)$/.exec(pathname);
    if (delMatch && method === "DELETE") {
      const id = decodeURIComponent(delMatch[1] ?? "");
      const ok = removerProjeto(id);
      if (!ok) {
        jsonResponse(res, 404, { error: "Projeto não encontrado" });
        return;
      }
      jsonResponse(res, 200, { success: true });
      return;
    }

    if (pathname === "/api/run/stream" && method === "GET") {
      const tarefa = u.searchParams.get("tarefa");
      const projetoId = u.searchParams.get("projetoId");
      const modoParam = u.searchParams.get("modo");
      const modo = modoParam === "sequencial" ? "sequencial" : "paralelo";

      if (!tarefa || tarefa.trim() === "") {
        jsonResponse(res, 400, { error: "tarefa é obrigatória" });
        return;
      }

      let projeto: ReturnType<typeof buscarProjeto> = null;
      if (projetoId !== null && projetoId !== "") {
        projeto = buscarProjeto(projetoId);
        if (!projeto) {
          jsonResponse(res, 404, { error: "Projeto não encontrado" });
          return;
        }
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const onAgentStart = (nome: string, modelo: string) =>
        send("agent_start", { nome, modelo, ts: Date.now() });
      const onAgentDone = (nome: string, durationMs: number) =>
        send("agent_done", { nome, durationMs, ts: Date.now() });
      const onAgentError = (nome: string, error: string) =>
        send("agent_error", { nome, error, ts: Date.now() });

      try {
        const orch = new Orchestrator();
        const result = await orch.processarTarefa(tarefa, {
          projeto,
          modo,
          salvarHistorico: projeto !== null,
          verbose: false,
          onAgentStart,
          onAgentDone,
          onAgentError,
        });
        const baseRel = path.basename(result.caminhoRelatorio || "");
        send("done", {
          respostaFinal: result.respostaFinal,
          caminhoRelatorio: result.caminhoRelatorio,
          relatorioNome: baseRel,
          duracaoMs: result.duracaoMs,
          plano: result.plano,
          resultados: result.resultados,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        send("stream_error", { error: msg });
      }
      res.end();
      return;
    }

    if (pathname === "/api/run" && method === "POST") {
      const body = await readBody<ApiRunBody>(req);
      const tarefa = body.tarefa;
      const projetoId = body.projetoId;
      const modo = body.modo === "sequencial" ? "sequencial" : "paralelo";
      if (!tarefa || String(tarefa).trim() === "") {
        jsonResponse(res, 400, { error: "tarefa é obrigatória" });
        return;
      }
      let projeto = null;
      if (projetoId !== undefined && projetoId !== "") {
        projeto = buscarProjeto(projetoId);
        if (!projeto) {
          jsonResponse(res, 404, { error: "Projeto não encontrado" });
          return;
        }
      }

      // Em modo API, o manager não faz perguntas interativas.
      // Se respostas_esclarecimento vier no body, incluí-las na tarefa.
      let tarefaFinal = String(tarefa);
      if (body.respostas_esclarecimento && String(body.respostas_esclarecimento).trim() !== "") {
        tarefaFinal += `\n\nESCLARECIMENTOS ADICIONAIS DO USUÁRIO:\n${body.respostas_esclarecimento}`;
      }

      const orch = new Orchestrator();
      const out = await withTimeout(
        orch.processarTarefa(tarefaFinal, {
          projeto,
          modo,
          salvarHistorico: projeto !== null,
          verbose: false,
        }),
        RUN_TIMEOUT_MS
      );
      const baseRel = path.basename(out.caminhoRelatorio || "");
      jsonResponse(res, 200, {
        plano: out.plano,
        respostaFinal: out.respostaFinal,
        resultados: out.resultados,
        caminhoRelatorio: out.caminhoRelatorio,
        relatorioNome: baseRel,
        duracaoMs: out.duracaoMs,
      });
      return;
    }

    if (pathname === "/api/history" && method === "GET") {
      const pid = u.searchParams.get("projetoId");
      let list;
      if (pid) {
        list = carregarHistoricoProjeto(pid);
      } else {
        list = carregarTodoHistorico();
      }
      jsonResponse(res, 200, list.slice(0, 50));
      return;
    }

    const histIdMatch = /^\/api\/history\/([^/]+)$/.exec(pathname);
    if (histIdMatch && method === "GET") {
      const id = decodeURIComponent(histIdMatch[1] ?? "");
      const ex = carregarExecucaoPorId(id);
      if (!ex) {
        jsonResponse(res, 404, { error: "Execução não encontrada" });
        return;
      }
      jsonResponse(res, 200, ex);
      return;
    }

    if (pathname === "/api/reports" && method === "GET") {
      const list = listarRelatorios();
      jsonResponse(res, 200, list);
      return;
    }

    if (pathname === "/api/reports/file" && method === "GET") {
      const name = u.searchParams.get("name");
      const safe = safeReportBasename(name);
      if (!safe) {
        jsonResponse(res, 400, { error: "nome de ficheiro inválido" });
        return;
      }
      const full = path.join(REPORTS_DIR, safe);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        jsonResponse(res, 404, { error: "Ficheiro não encontrado" });
        return;
      }
      const content = fs.readFileSync(full, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        ...corsHeaders(),
      });
      res.end(content);
      return;
    }

    if (method === "GET" && !pathname.startsWith("/api/")) {
      if (!fs.existsSync(PUBLIC_INDEX)) {
        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8",
          ...corsHeaders(),
        });
        res.end("public/index.html não encontrado");
        return;
      }
      const html = fs.readFileSync(PUBLIC_INDEX, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        ...corsHeaders(),
      });
      res.end(html);
      return;
    }

    jsonResponse(res, 404, { error: "Não encontrado" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!res.headersSent) {
      jsonResponse(res, 500, { error: msg });
    }
  }
}

function main(): void {
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.error(
      "Erro: ANTHROPIC_API_KEY não está definida. Configure o ficheiro .env."
    );
    process.exit(1);
  }
  ensureDirs();

  const server = http.createServer((req, res) => {
    const started = Date.now();
    res.on("finish", () => {
      console.log(
        `[HTTP] ${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started} ms)`
      );
    });
    void handle(req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { error: msg });
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Agents-AI servidor em http://localhost:${PORT}`);
  });
}

main();
