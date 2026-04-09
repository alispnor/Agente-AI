import fs from "node:fs";
import path from "node:path";
import type { AgentName, ProjectContext } from "../types/index.js";

export const AGENT_EXTENSIONS: Record<AgentName, readonly string[]> = {
  frontend: [".tsx", ".ts", ".jsx", ".js", ".css", ".scss", ".html", ".json"],
  backend: [".ts", ".js", ".py", ".go", ".java", ".sql", ".prisma", ".json"],
  qa: [".test.ts", ".test.js", ".spec.ts", ".spec.js", ".cy.js", ".cy.ts"],
  devops: [
    "Dockerfile",
    ".yml",
    ".yaml",
    ".tf",
    ".toml",
    "Makefile",
    ".sh",
  ],
  uxui: [".css", ".scss", ".figma", ".svg", ".tsx", ".jsx", ".html"],
  mobile: [
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".dart",
    ".kt",
    ".swift",
    ".gradle",
    ".kts",
    ".xml",
    ".plist",
    ".podspec",
    ".json",
  ],
  security: [
    ".ts",
    ".js",
    ".py",
    ".go",
    ".java",
    ".env",
    ".env.example",
    ".yml",
    ".yaml",
    ".json",
    ".toml",
    ".cfg",
    ".conf",
    ".ini",
    "Dockerfile",
    ".sh",
    ".sql",
    ".prisma",
    ".tf",
  ],
  architect: [
    ".ts",
    ".js",
    ".py",
    ".go",
    ".java",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".sql",
    ".prisma",
    ".tf",
    "Dockerfile",
    ".graphql",
    ".gql",
    ".sh",
  ],
  data: [
    ".sql",
    ".prisma",
    ".ts",
    ".js",
    ".py",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".csv",
    ".graphql",
    ".gql",
  ],
};

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".cache",
  "__pycache__",
  "venv",
  ".env",
  ".turbo",
  ".vercel",
  ".nx",
  "__tests__",
  ".idea",
  ".vscode",
]);

function shouldIgnoreDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

function arquivoCorrespondeAgente(filePath: string, agente: AgentName): boolean {
  const patterns = AGENT_EXTENSIONS[agente];
  const base = path.basename(filePath);
  const lower = filePath.toLowerCase();

  for (const p of patterns) {
    if (p.startsWith(".")) {
      if (lower.endsWith(p.toLowerCase())) return true;
    } else if (base === p || base.toLowerCase() === p.toLowerCase()) {
      return true;
    }
  }
  return false;
}

export function lerEstruturaProjeto(
  caminhoRaiz: string,
  maxProfundidade = 4
): string {
  const resolved = path.resolve(caminhoRaiz);
  if (!fs.existsSync(resolved)) {
    return "";
  }

  const lines: string[] = [path.basename(resolved) + "/"];

  function walk(dir: string, depth: number, prefix: string): void {
    if (depth >= maxProfundidade) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const dirs: fs.Dirent[] = [];
    const files: fs.Dirent[] = [];
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (!shouldIgnoreDir(ent.name)) dirs.push(ent);
      } else {
        files.push(ent);
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    const all = [...dirs, ...files];

    all.forEach((ent, index) => {
      const isLast = index === all.length - 1;
      const branch = isLast ? "└── " : "├── ";
      const fullPath = path.join(dir, ent.name);
      const nextPrefix = prefix + (isLast ? "    " : "│   ");

      if (ent.isDirectory()) {
        lines.push(prefix + branch + ent.name + "/");
        walk(fullPath, depth + 1, nextPrefix);
      } else {
        lines.push(prefix + branch + ent.name);
      }
    });
  }

  walk(resolved, 0, "");
  return lines.join("\n");
}

function coletarArquivosRelevantes(
  caminhoRaiz: string,
  agente: AgentName,
  maxArquivos: number,
  acumulador: string[],
  _depth = 0
): void {
  if (acumulador.length >= maxArquivos) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(caminhoRaiz, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (acumulador.length >= maxArquivos) return;
    const full = path.join(caminhoRaiz, ent.name);
    if (ent.isDirectory()) {
      if (shouldIgnoreDir(ent.name)) continue;
      coletarArquivosRelevantes(full, agente, maxArquivos, acumulador, _depth + 1);
    } else if (arquivoCorrespondeAgente(full, agente)) {
      acumulador.push(full);
    }
  }
}

export function lerArquivosRelevantes(
  caminhoRaiz: string,
  agente: AgentName,
  maxArquivos = 20,
  maxLinhasPorArquivo = 150
): string {
  const resolved = path.resolve(caminhoRaiz);
  const paths: string[] = [];
  coletarArquivosRelevantes(resolved, agente, maxArquivos, paths);

  const partes: string[] = [];
  const root = resolved;
  for (const filePath of paths) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const lineArr = content.split("\n");
    const truncated =
      lineArr.length > maxLinhasPorArquivo
        ? lineArr.slice(0, maxLinhasPorArquivo).join("\n") +
          `\n... [truncado após ${maxLinhasPorArquivo} linhas]`
        : content;
    const rel = path.relative(root, filePath) || filePath;
    partes.push(`=== ARQUIVO: ${rel} ===\n${truncated}`);
  }
  return partes.join("\n\n");
}

export function lerPackageJson(caminhoRaiz: string): string {
  const root = path.resolve(caminhoRaiz);
  const candidates = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
  ] as const;
  for (const name of candidates) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, "utf8");
      } catch {
        return "Não encontrado";
      }
    }
  }
  return "Não encontrado";
}

export function gerarContextoProjeto(
  caminhoRaiz: string,
  agente: AgentName
): ProjectContext {
  const resolved = path.resolve(caminhoRaiz);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Caminho do projeto não existe no sistema de ficheiros: ${resolved}`
    );
  }
  return {
    caminho: resolved,
    estrutura: lerEstruturaProjeto(resolved),
    dependencias: lerPackageJson(resolved),
    arquivosRelevantes: lerArquivosRelevantes(resolved, agente),
  };
}
