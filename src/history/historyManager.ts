import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentResults, Execution, TaskPlan } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.resolve(__dirname, "../../data/history");

function ensureHistoryDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function parseExecution(raw: string): Execution | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== "object" || data === null) return null;
    return data as Execution;
  } catch {
    return null;
  }
}

export function salvarExecucao(
  projetoId: string,
  projetoNome: string,
  tarefa: string,
  plano: TaskPlan,
  resultadosPorAgente: AgentResults,
  respostaFinal: string,
  duracaoMs: number | null = null
): Execution {
  ensureHistoryDir();
  const id = Date.now().toString();
  const execucao: Execution = {
    id,
    projetoId,
    projetoNome,
    tarefa,
    executadoEm: new Date().toISOString(),
    duracaoMs,
    plano,
    agentesUsados: plano.agentes_necessarios,
    resultadosPorAgente,
    respostaFinal,
  };

  const fileName = `${projetoId}_${id}.json`;
  const filePath = path.join(HISTORY_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(execucao, null, 2), "utf8");
  return execucao;
}

function parseExecucoesFromDir(filterPrefix: string | null): Execution[] {
  ensureHistoryDir();
  const files = fs
    .readdirSync(HISTORY_DIR)
    .filter((f: string) => f.endsWith(".json"));
  const list: Execution[] = [];
  for (const f of files) {
    if (filterPrefix !== null && !f.startsWith(filterPrefix)) continue;
    try {
      const raw = fs.readFileSync(path.join(HISTORY_DIR, f), "utf8");
      const ex = parseExecution(raw);
      if (ex) list.push(ex);
    } catch {
      continue;
    }
  }
  list.sort((a, b) => {
    const ta = new Date(a.executadoEm || 0).getTime();
    const tb = new Date(b.executadoEm || 0).getTime();
    return tb - ta;
  });
  return list;
}

export function carregarHistoricoProjeto(projetoId: string): Execution[] {
  const prefix = `${projetoId}_`;
  return parseExecucoesFromDir(prefix);
}

export function carregarTodoHistorico(): Execution[] {
  return parseExecucoesFromDir(null);
}

export function carregarUltimaExecucao(projetoId: string): Execution | null {
  const all = carregarHistoricoProjeto(projetoId);
  return all.length > 0 ? (all[0] ?? null) : null;
}

export function carregarExecucaoPorId(execucaoId: string): Execution | null {
  ensureHistoryDir();
  const needle = String(execucaoId).trim();
  if (!needle) return null;
  const files = fs
    .readdirSync(HISTORY_DIR)
    .filter((f: string) => f.endsWith(".json"));
  const suffix = `_${needle}.json`;
  const match = files.find((name: string) => name.endsWith(suffix));
  if (!match) return null;
  try {
    const raw = fs.readFileSync(path.join(HISTORY_DIR, match), "utf8");
    return parseExecution(raw);
  } catch {
    return null;
  }
}

/** @deprecated usar carregarExecucaoPorId */
export function buscarExecucaoPorId(execId: string): Execution | null {
  return carregarExecucaoPorId(execId);
}
