import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Project, ProjectsFile } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function parseProjectsFile(raw: string): Project[] {
  const data = JSON.parse(raw) as unknown;
  if (typeof data !== "object" || data === null || !("projects" in data)) {
    return [];
  }
  const pf = data as ProjectsFile;
  return Array.isArray(pf.projects) ? pf.projects : [];
}

export function carregarProjetos(): Project[] {
  ensureDataDir();
  if (!fs.existsSync(PROJECTS_FILE)) {
    fs.writeFileSync(
      PROJECTS_FILE,
      JSON.stringify({ projects: [] } satisfies ProjectsFile, null, 2),
      "utf8"
    );
  }
  const raw = fs.readFileSync(PROJECTS_FILE, "utf8");
  return parseProjectsFile(raw);
}

export function salvarProjetos(projects: Project[]): void {
  ensureDataDir();
  const data: ProjectsFile = { projects };
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export function listarProjetosJson(): Project[] {
  return carregarProjetos();
}

export function removerProjeto(idOuNome: string): boolean {
  const p = buscarProjeto(idOuNome);
  if (!p) return false;
  const projects = carregarProjetos();
  const next = projects.filter((x) => x.id !== p.id);
  if (next.length === projects.length) return false;
  salvarProjetos(next);
  return true;
}

export function registrarProjeto(
  nome: string,
  caminho: string,
  descricao = ""
): Project {
  const resolved = path.resolve(caminho);
  if (!fs.existsSync(resolved)) {
    throw new Error(`O caminho não existe: ${resolved}`);
  }

  const projects = carregarProjetos();
  const idx = projects.findIndex((p) => p.caminho === resolved);

  if (idx >= 0) {
    const existing = projects[idx];
    if (existing === undefined) {
      throw new Error("Estado inconsistente do registo de projetos");
    }
    existing.nome = nome;
    existing.descricao = descricao;
    salvarProjetos(projects);
    return existing;
  }

  const novo: Project = {
    id: Date.now().toString(),
    nome,
    caminho: resolved,
    descricao,
    registradoEm: new Date().toISOString(),
    totalTarefas: 0,
  };
  projects.push(novo);
  salvarProjetos(projects);
  return novo;
}

export function listarProjetos(): string {
  const projects = carregarProjetos();
  if (projects.length === 0) {
    return "Nenhum projeto cadastrado.";
  }
  const idW = 14;
  const nomeW = 20;
  const tarefasW = 8;
  const header = `${"ID".padEnd(idW)} ${"NOME".padEnd(nomeW)} ${"CAMINHO".padEnd(40)} ${"TAREFAS".padStart(tarefasW)}`;
  const sep = "-".repeat(Math.min(120, header.length + 20));
  const rows = projects.map((p) => {
    const caminhoStr =
      p.caminho.length > 40 ? p.caminho.slice(0, 37) + "..." : p.caminho;
    return `${String(p.id).padEnd(idW)} ${String(p.nome).padEnd(nomeW)} ${caminhoStr.padEnd(40)} ${String(p.totalTarefas ?? 0).padStart(tarefasW)}`;
  });
  return [header, sep, ...rows].join("\n");
}

export function buscarProjeto(idOuNome: string): Project | null {
  if (idOuNome === "") return null;
  const projects = carregarProjetos();
  const needle = String(idOuNome).trim();
  const byId = projects.find((p) => p.id === needle);
  if (byId) return byId;
  const lower = needle.toLowerCase();
  return projects.find((p) => p.nome.toLowerCase().includes(lower)) ?? null;
}

export function incrementarTarefas(projetoId: string): void {
  const projects = carregarProjetos();
  const p = projects.find((x) => x.id === projetoId);
  if (!p) return;
  p.totalTarefas = (p.totalTarefas ?? 0) + 1;
  salvarProjetos(projects);
}
