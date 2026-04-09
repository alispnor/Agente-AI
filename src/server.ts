import "./loadEnv.js";
import http from "node:http";
import fs from "node:fs";
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

    if (pathname === "/api/projects" && method === "POST") {
      const body = await readBody<ApiProjectBody>(req);
      const caminho = body.caminho;
      const nome = body.nome;
      const descricao = body.descricao ?? "";
      if (!caminho || !nome) {
        jsonResponse(res, 400, { error: "caminho e nome são obrigatórios" });
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
