import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentName, Execution, ReportFile } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, "../../reports");

function fmtDuracao(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function truncar(texto: string | undefined, max = 500): string {
  if (texto == null) return "";
  const s = String(texto);
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

export function gerarRelatorioExecucao(execucao: Execution): string {
  const linhas: string[] = [];
  linhas.push("=".repeat(72));
  linhas.push("RELATÓRIO DE EXECUÇÃO");
  linhas.push("=".repeat(72));
  linhas.push(`ID: ${execucao.id}`);
  linhas.push(`Projeto: ${execucao.projetoNome} (ID: ${execucao.projetoId})`);
  linhas.push(`Data/hora: ${execucao.executadoEm}`);
  linhas.push(`Duração: ${fmtDuracao(execucao.duracaoMs)}`);
  linhas.push("");
  linhas.push("TAREFA SOLICITADA");
  linhas.push("-".repeat(40));
  linhas.push(execucao.tarefa || "");
  linhas.push("");
  linhas.push("AGENTES UTILIZADOS");
  linhas.push("-".repeat(40));
  const agentes =
    execucao.agentesUsados.length > 0
      ? execucao.agentesUsados
      : execucao.plano.agentes_necessarios;
  linhas.push(Array.isArray(agentes) ? agentes.join(", ") : String(agentes));
  linhas.push("");
  linhas.push("RESPOSTAS POR AGENTE (resumo)");
  linhas.push("-".repeat(40));
  const res = execucao.resultadosPorAgente || {};
  for (const [nome, texto] of Object.entries(res)) {
    linhas.push(`[${nome}]`);
    linhas.push(truncar(texto, 500));
    linhas.push("");
  }
  linhas.push("RESPOSTA FINAL CONSOLIDADA");
  linhas.push("-".repeat(40));
  linhas.push(execucao.respostaFinal || "");
  linhas.push("");
  linhas.push("=".repeat(72));
  return linhas.join("\n");
}

export function gerarRelatorioProjetoCompleto(
  projetoId: string,
  projetoNome: string,
  execucoes: Execution[]
): string {
  const linhas: string[] = [];
  linhas.push("=".repeat(72));
  linhas.push("RELATÓRIO COMPLETO DO PROJETO");
  linhas.push("=".repeat(72));
  linhas.push(`Nome: ${projetoNome}`);
  linhas.push(`ID: ${projetoId}`);
  linhas.push(`Total de execuções: ${execucoes.length}`);
  linhas.push("");

  const contagemAgentes: Partial<Record<AgentName, number>> = {};
  for (const ex of execucoes) {
    const usados =
      ex.agentesUsados.length > 0
        ? ex.agentesUsados
        : ex.plano.agentes_necessarios;
    if (Array.isArray(usados)) {
      for (const a of usados) {
        contagemAgentes[a] = (contagemAgentes[a] ?? 0) + 1;
      }
    }
  }

  linhas.push("LISTA DE TAREFAS EXECUTADAS");
  linhas.push("-".repeat(40));
  for (const ex of execucoes) {
    const data = ex.executadoEm || "—";
    const t = (ex.tarefa || "").replace(/\s+/g, " ").trim();
    const resumo = t.length > 80 ? t.slice(0, 77) + "..." : t;
    linhas.push(`[${data}] ${resumo}`);
  }
  linhas.push("");

  linhas.push("AGENTES MAIS UTILIZADOS (contagem)");
  linhas.push("-".repeat(40));
  const sorted = Object.entries(contagemAgentes).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    linhas.push("—");
  } else {
    for (const [nome, n] of sorted) {
      linhas.push(`${nome}: ${n}`);
    }
  }
  linhas.push("");

  const ultima = execucoes[0];
  linhas.push("ÚLTIMA ATIVIDADE");
  linhas.push("-".repeat(40));
  if (ultima) {
    linhas.push(`Data: ${ultima.executadoEm}`);
    linhas.push(`Tarefa: ${(ultima.tarefa || "").replace(/\s+/g, " ").trim()}`);
  } else {
    linhas.push("Nenhuma execução registrada.");
  }
  linhas.push("");
  linhas.push("=".repeat(72));
  return linhas.join("\n");
}

export function salvarRelatorio(conteudo: string, nomeArquivo: string): string {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  const base = nomeArquivo.endsWith(".txt")
    ? nomeArquivo
    : `${nomeArquivo}.txt`;
  const filePath = path.join(REPORTS_DIR, base);
  fs.writeFileSync(filePath, conteudo, "utf8");
  return path.resolve(filePath);
}

export function listarRelatorios(): ReportFile[] {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  const names = fs
    .readdirSync(REPORTS_DIR)
    .filter((f: string) => f.endsWith(".txt"));
  return names.map((nome: string) => {
    const full = path.join(REPORTS_DIR, nome);
    const st = fs.statSync(full);
    const birth = st.birthtime;
    const criado =
      birth && birth.getTime() > 0 ? birth.toISOString() : st.mtime.toISOString();
    return {
      nome,
      caminho: path.resolve(full),
      tamanhoKb: Math.round((st.size / 1024) * 100) / 100,
      criadoEm: criado,
    };
  });
}

/** @deprecated usar listarRelatorios */
export function listarRelatoriosArquivos(): ReportFile[] {
  return listarRelatorios();
}

export function gerarNomeRelatorio(
  projetoNome: string,
  tipo = "execucao"
): string {
  const safe =
    String(projetoNome || "projeto")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "projeto";
  const iso = new Date().toISOString().replace(/:/g, "-");
  return `projeto-${safe}_${tipo}_${iso}.txt`;
}
