import "./loadEnv.js";
import { mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import Orchestrator from "./orchestrator/orchestrator.js";
import managerAgent from "./manager/managerAgent.js";
import frontendAgent from "./agents/frontendAgent.js";
import backendAgent from "./agents/backendAgent.js";
import qaAgent from "./agents/qaAgent.js";
import devopsAgent from "./agents/devopsAgent.js";
import uxuiAgent from "./agents/uxuiAgent.js";
import mobileAgent from "./agents/mobileAgent.js";
import securityAgent from "./agents/securityAgent.js";
import dataAnalystAgent from "./agents/dataAnalystAgent.js";
import architectAgent from "./agents/architectAgent.js";
import {
  listarProjetos,
  registrarProjeto,
  buscarProjeto,
  carregarProjetos,
} from "./project/projectRegistry.js";
import {
  carregarHistoricoProjeto,
  carregarTodoHistorico,
} from "./history/historyManager.js";
import {
  gerarRelatorioProjetoCompleto,
  gerarNomeRelatorio,
  salvarRelatorio,
} from "./history/reportGenerator.js";
import { taskUploadAvatar } from "./tasks/examples.js";
import { gerarContextoProjeto } from "./project/projectReader.js";
import type { AgentName } from "./types/index.js";

const AGENTES: Record<AgentName, (tarefa: string, ctx?: string) => Promise<string>> = {
  frontend: frontendAgent,
  backend: backendAgent,
  qa: qaAgent,
  devops: devopsAgent,
  uxui: uxuiAgent,
  mobile: mobileAgent,
  security: securityAgent,
  data: dataAnalystAgent,
  architect: architectAgent,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

mkdirSync(path.join(ROOT, "data", "history"), { recursive: true });
mkdirSync(path.join(ROOT, "reports"), { recursive: true });

if (!process.env["ANTHROPIC_API_KEY"]) {
  console.error(
    "Erro: ANTHROPIC_API_KEY não está definida.\n" +
      "Copie .env.example para .env e defina ANTHROPIC_API_KEY com a sua chave da API Anthropic."
  );
  process.exit(1);
}

function mergeQuotedTokens(tokens: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const s = tokens[i];
    if (s === undefined) break;
    if (s.startsWith('"') && !s.endsWith('"')) {
      let chunk = s.slice(1);
      i++;
      while (i < tokens.length) {
        const part = tokens[i];
        if (part === undefined) break;
        if (!part.endsWith('"')) {
          chunk += " " + part;
          i++;
        } else {
          chunk += " " + part.slice(0, -1);
          i++;
          break;
        }
      }
      out.push(chunk);
    } else if (s.startsWith('"') && s.endsWith('"') && s.length > 1) {
      out.push(s.slice(1, -1));
      i++;
    } else if (s.startsWith("'") && !s.endsWith("'")) {
      let chunk = s.slice(1);
      i++;
      while (i < tokens.length) {
        const part = tokens[i];
        if (part === undefined) break;
        if (!part.endsWith("'")) {
          chunk += " " + part;
          i++;
        } else {
          chunk += " " + part.slice(0, -1);
          i++;
          break;
        }
      }
      out.push(chunk);
    } else if (s.startsWith("'") && s.endsWith("'") && s.length > 1) {
      out.push(s.slice(1, -1));
      i++;
    } else {
      out.push(s);
      i++;
    }
  }
  return out;
}

function parseRunArgs(argv: readonly string[]): {
  tarefa: string;
  idOuNome: string | null;
} | null {
  const i = argv.indexOf("--run");
  if (i === -1) return null;
  const rest = argv.slice(i + 1);
  if (rest.length === 0) {
    throw new Error(
      'Uso: node dist/index.js --run "<tarefa>" [idOuNomeProjeto]'
    );
  }
  const merged = mergeQuotedTokens(rest);
  const tarefa = merged[0];
  if (tarefa === undefined) {
    throw new Error("Tarefa em falta após --run");
  }
  const idOuNome =
    merged.length > 1 ? merged.slice(1).join(" ").trim() || null : null;
  return { tarefa, idOuNome };
}

function parseAddArgs(argv: readonly string[]): {
  caminho: string;
  nome: string;
  descricao: string;
} | null {
  const i = argv.indexOf("--add");
  if (i === -1) return null;
  const rest = argv.slice(i + 1);
  if (rest.length < 1) {
    throw new Error(
      'Uso: node dist/index.js --add <caminho> "<nome>" "<descricao>"'
    );
  }
  const caminho = rest[0];
  if (caminho === undefined) {
    throw new Error("Caminho em falta após --add");
  }
  const tail = mergeQuotedTokens(rest.slice(1));
  const nome = tail[0] ?? "Sem nome";
  const descricao = tail.slice(1).join(" ").trim();
  return { caminho, nome, descricao };
}

async function cmdList(): Promise<void> {
  console.log(listarProjetos());
}

async function cmdAdd(argv: readonly string[]): Promise<void> {
  const parsed = parseAddArgs(argv);
  if (!parsed) throw new Error("--add inválido");
  const { caminho, nome, descricao } = parsed;
  const p = registrarProjeto(nome, caminho, descricao);
  console.log("Projeto registado com sucesso.");
  console.log(`ID: ${p.id}`);
  console.log(`Nome: ${p.nome}`);
  console.log(`Caminho: ${p.caminho}`);
}

async function cmdReport(idOuNome: string): Promise<void> {
  const projeto = buscarProjeto(idOuNome);
  if (!projeto) {
    console.error(`Projeto não encontrado: ${idOuNome}`);
    process.exit(1);
    return;
  }
  const pid = projeto.id;
  const pnome = projeto.nome;
  const execucoes = carregarHistoricoProjeto(pid);
  const texto = gerarRelatorioProjetoCompleto(pid, pnome, execucoes);
  const nome = gerarNomeRelatorio(pnome, "completo");
  const caminho = salvarRelatorio(texto, nome);
  console.log(texto);
  console.log(`\nRelatório guardado em: ${caminho}`);
}

async function cmdReportAll(): Promise<void> {
  const projetos = carregarProjetos();
  const todasExec = carregarTodoHistorico();
  const linhas: string[] = [];
  linhas.push("=".repeat(72));
  linhas.push("RELATÓRIO GERAL — TODOS OS PROJETOS E EXECUÇÕES");
  linhas.push("=".repeat(72));
  linhas.push(`Total de execuções no histórico: ${todasExec.length}`);
  linhas.push(`Projetos registados: ${projetos.length}`);
  linhas.push("");

  for (const p of projetos) {
    const ex = carregarHistoricoProjeto(p.id);
    linhas.push("-".repeat(72));
    linhas.push(gerarRelatorioProjetoCompleto(p.id, p.nome, ex));
    linhas.push("");
  }

  if (projetos.length === 0 && todasExec.length > 0) {
    linhas.push("Execuções sem projeto associado (ficheiros órfãos):");
    for (const ex of todasExec) {
      linhas.push(`- [${ex.executadoEm}] ${(ex.tarefa || "").slice(0, 80)}`);
    }
  }

  linhas.push("=".repeat(72));
  const texto = linhas.join("\n");
  const nome = gerarNomeRelatorio("todos-projetos", "geral");
  const caminho = salvarRelatorio(texto, nome);
  console.log(texto);
  console.log(`\nRelatório guardado em: ${caminho}`);
}

/* ─────────────────────────────────────────────────────────────
   Comando --status: testa cada agente + gerente um por um
   ───────────────────────────────────────────────────────────── */

async function cmdStatus(): Promise<void> {
  const PING_TASK = "Responda APENAS com a palavra 'OK' para confirmar que você está operacional.";
  const agentNames = Object.keys(AGENTES) as AgentName[];
  const total = agentNames.length + 1; // +1 para o gerente
  let aprovados = 0;
  let reprovados = 0;

  console.log("\n" + "=".repeat(60));
  console.log("  VERIFICAÇÃO DE STATUS — Agentes IA");
  console.log("=".repeat(60));
  console.log(`  Testando ${total} componentes (${agentNames.length} agentes + gerente)`);
  console.log("  Cada agente recebe um ping e deve responder...\n");

  // 1. Testar o Gerente IA primeiro
  console.log(`  [1/${total}] 🧠 Gerente IA (manager)...`);
  const t0mgr = Date.now();
  try {
    const plano = await managerAgent(
      "Responda com status pronto. Agentes necessarios: qa. Subtarefa qa: teste de ping.",
      "",
      undefined,
      1
    );
    const dur = ((Date.now() - t0mgr) / 1000).toFixed(1);
    if (plano && plano.agentes_necessarios) {
      console.log(`       ✅ PRONTO (${dur}s) — Planejamento funcional, ${plano.agentes_necessarios.length} agente(s) no plano`);
      aprovados++;
    } else {
      console.log(`       ❌ FALHA (${dur}s) — Resposta sem plano válido`);
      reprovados++;
    }
  } catch (e: unknown) {
    const dur = ((Date.now() - t0mgr) / 1000).toFixed(1);
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`       ❌ FALHA (${dur}s) — ${msg.slice(0, 120)}`);
    reprovados++;
  }

  // 2. Testar cada agente sequencialmente
  for (let i = 0; i < agentNames.length; i++) {
    const nome = agentNames[i]!;
    const fn = AGENTES[nome];
    const idx = i + 2; // gerente é 1
    console.log(`  [${idx}/${total}] 🤖 ${nome}...`);
    const t0 = Date.now();
    try {
      const resposta = await fn(PING_TASK, "");
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      if (resposta && resposta.trim().length > 0) {
        const preview = resposta.trim().slice(0, 50).replace(/\n/g, " ");
        console.log(`       ✅ PRONTO (${dur}s) — "${preview}"`);
        aprovados++;
      } else {
        console.log(`       ❌ FALHA (${dur}s) — Resposta vazia`);
        reprovados++;
      }
    } catch (e: unknown) {
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") || msg.includes("rate")) {
        console.log(`       ⏳ RATE LIMIT (${dur}s) — Aguardando... (o agente funciona, limite da API)`);
        aprovados++; // agente funciona, so rate limit
      } else {
        console.log(`       ❌ FALHA (${dur}s) — ${msg.slice(0, 120)}`);
        reprovados++;
      }
    }
  }

  // 3. Resumo final
  console.log("\n" + "=".repeat(60));
  console.log("  RESULTADO");
  console.log("=".repeat(60));
  console.log(`  ✅ Prontos:    ${aprovados}/${total}`);
  if (reprovados > 0) {
    console.log(`  ❌ Com falha:  ${reprovados}/${total}`);
  }
  if (aprovados === total) {
    console.log("\n  🟢 Todos os agentes estão operacionais!");
  } else if (reprovados === total) {
    console.log("\n  🔴 Nenhum agente respondeu. Verifique a ANTHROPIC_API_KEY.");
  } else {
    console.log("\n  🟡 Sistema parcialmente operacional. Verifique os agentes com falha.");
  }
  console.log("=".repeat(60) + "\n");
}

function listarAgentes(): void {
  console.log("\n🤖 Agentes disponíveis:\n");
  console.log("  frontend  — Engenheiro Frontend Sênior (React, Angular, Vue)");
  console.log("  backend   — Engenheiro Backend Sênior (Node, Laravel, Python, DBs)");
  console.log("  qa        — Engenheiro QA Sênior (testes, E2E, cobertura)");
  console.log("  devops    — Engenheiro DevOps/SRE (CI/CD, Docker, K8s, cloud)");
  console.log("  uxui      — Designer UX/UI Sênior (design system, acessibilidade)");
  console.log("  mobile    — Desenvolvedor Mobile Sênior (React Native, Flutter, iOS, Android)");
  console.log("  security  — Engenheiro de Segurança Sênior (OWASP, AppSec, auditoria, compliance)");
  console.log("  data      — Analista de Dados / Gerente de Dados (SQL, NoSQL, tuning, modelagem)");
  console.log("  architect — Arquiteto de Software (análise de projeto, escalabilidade, design patterns)");
  console.log('\nUso: npm run cli -- --agent <nome> "<tarefa>" [--path /caminho/do/projeto]');
  console.log('Exemplo: npm run cli -- --agent backend "Criar API REST com JWT" --path /home/user/meu-projeto');
}

async function cmdAgent(nomeAgente: string, tarefa: string, caminhoProjeto?: string): Promise<void> {
  const nome = nomeAgente.toLowerCase() as AgentName;
  const fn = AGENTES[nome];
  if (!fn) {
    console.error(`❌ Agente "${nomeAgente}" não encontrado.`);
    listarAgentes();
    process.exit(1);
  }

  let contexto = "";
  if (caminhoProjeto) {
    const resolvedPath = path.resolve(caminhoProjeto);
    console.log(`\n📂 Lendo projeto em: ${resolvedPath}`);
    try {
      const ctx = gerarContextoProjeto(resolvedPath, nome);
      contexto =
        `ESTRUTURA DO PROJETO:\n${ctx.estrutura}\n\n` +
        `DEPENDÊNCIAS:\n${ctx.dependencias}\n\n` +
        `ARQUIVOS RELEVANTES:\n${ctx.arquivosRelevantes}`;
      console.log(`✅ Contexto carregado (estrutura + código do projeto)`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`⚠️ Erro ao ler projeto: ${msg}`);
    }
  }

  console.log(`\n🤖 Chamando agente: ${nome}`);
  console.log(`📋 Tarefa: ${tarefa}`);
  if (caminhoProjeto) console.log(`📂 Projeto: ${path.resolve(caminhoProjeto)}`);
  console.log("\n" + "=".repeat(72));
  const t0 = Date.now();
  const resposta = await fn(tarefa, contexto);
  const duracao = Date.now() - t0;
  console.log("=".repeat(72));
  console.log(`\n--- RESPOSTA DO AGENTE [${nome}] (${(duracao / 1000).toFixed(1)}s) ---\n`);
  console.log(resposta);
}

function criarPerguntarUsuarioCLI(): (perguntas: string[]) => Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return async (perguntas: string[]): Promise<string> => {
    console.log("\n" + "─".repeat(60));
    console.log("💬 O gestor precisa de esclarecimento antes de continuar:");
    console.log("─".repeat(60));
    for (let i = 0; i < perguntas.length; i++) {
      console.log(`  ${i + 1}. ${perguntas[i]}`);
    }
    console.log("─".repeat(60));
    console.log("Responda abaixo (pode responder tudo de uma vez):");
    console.log("(pressione Enter duas vezes para enviar)\n");

    const lines: string[] = [];
    let emptyCount = 0;

    return new Promise<string>((resolve) => {
      const onLine = (line: string): void => {
        if (line.trim() === "") {
          emptyCount++;
          if (emptyCount >= 2 && lines.length > 0) {
            rl.removeListener("line", onLine);
            resolve(lines.join("\n"));
            return;
          }
        } else {
          emptyCount = 0;
        }
        lines.push(line);
      };
      rl.on("line", onLine);
    });
  };
}

async function cmdRun(
  tarefa: string,
  idOuNome: string | null | undefined
): Promise<void> {
  let projeto = null;
  if (idOuNome !== undefined && idOuNome !== null && String(idOuNome).trim() !== "") {
    projeto = buscarProjeto(idOuNome);
    if (!projeto) {
      console.warn(
        `⚠️ Projeto não encontrado: "${idOuNome}". Executando sem projeto vinculado.`
      );
    }
  }

  const perguntarUsuario = criarPerguntarUsuarioCLI();
  const orch = new Orchestrator();
  const out = await orch.processarTarefa(tarefa, {
    projeto: projeto ?? null,
    salvarHistorico: projeto !== null,
    perguntarUsuario,
  });
  console.log("\n--- RESPOSTA FINAL ---\n");
  console.log(out.respostaFinal);
}

async function main(): Promise<void> {
  const args: string[] = process.argv.slice(2);

  if (args.includes("--status")) {
    await cmdStatus();
    return;
  }

  if (args.includes("--agents")) {
    listarAgentes();
    return;
  }

  const agentIdx = args.indexOf("--agent");
  if (agentIdx !== -1) {
    const nomeAgente = args[agentIdx + 1];
    if (!nomeAgente) {
      console.error('Uso: npm run cli -- --agent <nome> "<tarefa>" [--path /caminho/projeto]');
      listarAgentes();
      process.exit(1);
    }

    // Extrair --path se existir
    const pathIdx = args.indexOf("--path");
    let caminhoProjeto: string | undefined;
    if (pathIdx !== -1) {
      caminhoProjeto = args[pathIdx + 1];
      if (!caminhoProjeto) {
        console.error("❌ Caminho do projeto não informado após --path");
        process.exit(1);
      }
    }

    // Pegar a tarefa (tudo entre nome do agente e --path, ou até o final)
    const fimTarefa = pathIdx !== -1 ? pathIdx : args.length;
    const restArgs = mergeQuotedTokens(args.slice(agentIdx + 2, fimTarefa));
    const tarefa = restArgs.join(" ").trim();
    if (!tarefa) {
      console.error('❌ Tarefa não informada.');
      console.error('Uso: npm run cli -- --agent <nome> "<tarefa>" [--path /caminho/projeto]');
      process.exit(1);
    }
    await cmdAgent(nomeAgente, tarefa, caminhoProjeto);
    return;
  }

  if (args.includes("--list")) {
    await cmdList();
    return;
  }

  if (args.includes("--add")) {
    await cmdAdd(process.argv);
    return;
  }

  if (args.includes("--report-all")) {
    await cmdReportAll();
    return;
  }

  const reportIdx = args.indexOf("--report");
  if (reportIdx !== -1) {
    const idOuNome = args[reportIdx + 1];
    if (idOuNome === undefined) {
      console.error("Uso: node dist/index.js --report <idOuNome>");
      process.exit(1);
    }
    await cmdReport(idOuNome);
    return;
  }

  if (args.includes("--run")) {
    const parsed = parseRunArgs(process.argv);
    if (parsed === null) {
      process.exit(1);
      return;
    }
    await cmdRun(parsed.tarefa, parsed.idOuNome);
    return;
  }

  if (args.length === 0) {
    console.log(
      "Nenhum argumento: a executar tarefa de exemplo (upload de avatar).\n"
    );
    await cmdRun(taskUploadAvatar, null);
    return;
  }

  console.error("Argumentos não reconhecidos:", args.join(" "));
  console.error(
    "Comandos: --status | --agents | --agent <nome> | --list | --add | --report | --report-all | --run | (sem args = exemplo)"
  );
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
