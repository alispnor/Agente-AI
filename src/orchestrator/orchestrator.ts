import fs from "node:fs";
import path from "node:path";
import managerAgent, {
  consolidarResultados,
} from "../manager/managerAgent.js";
import frontendAgent from "../agents/frontendAgent.js";
import backendAgent from "../agents/backendAgent.js";
import qaAgent from "../agents/qaAgent.js";
import devopsAgent from "../agents/devopsAgent.js";
import uxuiAgent from "../agents/uxuiAgent.js";
import mobileAgent from '../agents/mobileAgent.js';
import securityAgent from '../agents/securityAgent.js';
import dataAnalystAgent from '../agents/dataAnalystAgent.js';
import architectAgent from '../agents/architectAgent.js';
import { gerarContextoProjeto } from "../project/projectReader.js";
import { salvarExecucao } from "../history/historyManager.js";
import { incrementarTarefas } from "../project/projectRegistry.js";
import {
  gerarRelatorioExecucao,
  gerarNomeRelatorio,
  salvarRelatorio,
} from "../history/reportGenerator.js";
import { getModelConfig } from "../config/models.js";
import type {
  AgentName,
  AgentResults,
  AskUserFn,
  Execution,
  OrchestratorOptions,
  OrchestratorResult,
  TaskPlan,
} from "../types/index.js";

type AgenteFn = (tarefa: string, ctx?: string) => Promise<string>;

class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private limit: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

const semaphore = new Semaphore(3);

type RunOutcome = {
  name: string;
  result: string | null;
  error: string | null;
  durationMs: number;
};

async function runAgentSafe(
  name: string,
  fn: () => Promise<string>,
  progress: {
    onAgentStart?: (nome: string, modelo: string) => void;
    onAgentDone?: (nome: string, durationMs: number) => void;
    onAgentError?: (nome: string, error: string) => void;
  },
  timeout = 120_000
): Promise<RunOutcome> {
  await semaphore.acquire();
  const t0 = Date.now();
  const modelo = getModelConfig(name).model;
  try {
    progress.onAgentStart?.(name, modelo);
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Agente ${name} timeout após ${timeout}ms`)),
          timeout
        )
      ),
    ]);
    const durationMs = Date.now() - t0;
    progress.onAgentDone?.(name, durationMs);
    return { name, result, error: null, durationMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ [${name.toUpperCase()}] erro: ${msg}`);
    progress.onAgentError?.(name, msg);
    return { name, result: null, error: msg, durationMs: Date.now() - t0 };
  } finally {
    semaphore.release();
  }
}

export default class Orchestrator {
  private readonly agentes: Record<AgentName, AgenteFn>;

  constructor() {
    this.agentes = {
      frontend: frontendAgent,
      backend: backendAgent,
      qa: qaAgent,
      devops: devopsAgent,
      uxui: uxuiAgent,
      mobile: (tarefa, ctx) => mobileAgent(tarefa, ctx),
      security: securityAgent,
      data: dataAnalystAgent,
      architect: architectAgent,
    };
  }

  private async analisarTarefa(
    tarefa: string,
    contextoGeral = "",
    perguntarUsuario?: AskUserFn,
    maxEsclarecimentos = 3
  ): Promise<TaskPlan> {
    return managerAgent(tarefa, contextoGeral, perguntarUsuario, maxEsclarecimentos);
  }

  /**
   * Executa agentes respeitando a ordem_execucao do plano.
   * Em paralelo: até 3 agentes simultâneos (semáforo); grupos em ordem_execucao rodam em sequência.
   */
  private async executarAgentes(
    plano: TaskPlan,
    contextosPorAgente: Partial<Record<AgentName, string>> = {},
    modo: "paralelo" | "sequencial" = "paralelo",
    logAgentes = true,
    progress: {
      onAgentStart?: (nome: string, modelo: string) => void;
      onAgentDone?: (nome: string, durationMs: number) => void;
      onAgentError?: (nome: string, error: string) => void;
    } = {}
  ): Promise<AgentResults> {
    const subtarefas = plano.subtarefas ?? {};
    const resultados: AgentResults = {};

    const tarefaPara = (nome: AgentName): string => {
      const st = subtarefas[nome];
      return st !== undefined && String(st).trim() !== ""
        ? st
        : JSON.stringify(plano);
    };

    const runOne = (nome: AgentName) => {
      const fn = this.agentes[nome];
      if (!fn) {
        console.warn(`⚠️ Agente desconhecido ou não registado: ${nome}`);
        return runAgentSafe(
          nome,
          async () => `[agente ${nome} não disponível]`,
          progress
        );
      }
      const ctx = contextosPorAgente[nome] ?? "";
      const tarefaAgente = tarefaPara(nome);
      return runAgentSafe(
        nome,
        () => {
          if (logAgentes) {
            console.log(
              `  🔄 [${nome.toUpperCase()}] iniciando (modelo: ${getModelConfig(nome).model})`
            );
          }
          return fn(tarefaAgente, ctx);
        },
        progress
      );
    };

    const mergeOutcomes = (outcomes: RunOutcome[]): void => {
      for (const { name, result, error } of outcomes) {
        if (result !== null) {
          resultados[name as AgentName] = result;
        } else {
          resultados[name as AgentName] = `[ERRO: ${error}]`;
        }
      }
    };

    let agentesOrdenados: AgentName[] = [];
    if (plano.ordem_execucao && plano.ordem_execucao.length > 0) {
      agentesOrdenados = plano.ordem_execucao.flat();
      if (logAgentes) {
        const etapas = plano.ordem_execucao
          .map((g, i) => `  Etapa ${i + 1}: [${g.join(", ")}]`)
          .join("\n");
        console.log(
          `📋 Ordem definida pelo gestor:\n${etapas}\n`
        );
      }
    } else {
      agentesOrdenados = Array.isArray(plano.agentes_necessarios)
        ? plano.agentes_necessarios
        : [];
    }

    if (modo === "paralelo") {
      const n = agentesOrdenados.length;
      console.log(
        `\n⚡ ${n} agentes em paralelo (máx 3 simultâneos)\n`
      );

      if (plano.ordem_execucao && plano.ordem_execucao.length > 0) {
        for (const grupo of plano.ordem_execucao) {
          const tarefas = grupo.map((nome) => {
            if (logAgentes) {
              console.log(`  🤖 [${nome.toUpperCase()}] enfileirado...`);
            }
            return runOne(nome);
          });
          const outcomes = await Promise.all(tarefas);
          for (const { name, durationMs, result, error } of outcomes) {
            if (logAgentes) {
              if (result !== null) {
                console.log(
                  `  ✅ [${name.toUpperCase()}] concluído em ${(durationMs / 1000).toFixed(1)}s`
                );
              }
            }
          }
          mergeOutcomes(outcomes);
        }
      } else {
        const tarefas = agentesOrdenados.map((nome) => {
          if (logAgentes) {
            console.log(`  🤖 [${nome.toUpperCase()}] enfileirado...`);
          }
          return runOne(nome);
        });
        const outcomes = await Promise.all(tarefas);
        for (const { name, durationMs, result } of outcomes) {
          if (logAgentes && result !== null) {
            console.log(
              `  ✅ [${name.toUpperCase()}] concluído em ${(durationMs / 1000).toFixed(1)}s`
            );
          }
        }
        mergeOutcomes(outcomes);
      }
    } else {
      for (const nome of agentesOrdenados) {
        if (logAgentes) {
          console.log(`  🤖 [${nome.toUpperCase()}] iniciando...`);
        }
        const { result, error, durationMs } = await runOne(nome);
        resultados[nome as AgentName] =
          result ?? `[ERRO: ${error}]`;
        if (logAgentes) {
          console.log(
            `  ✅ [${nome.toUpperCase()}] ${(durationMs / 1000).toFixed(1)}s`
          );
        }
      }
    }

    return resultados;
  }

  async processarTarefa(
    tarefa: string,
    opcoes: OrchestratorOptions = {}
  ): Promise<OrchestratorResult> {
    const modo = opcoes.modo ?? "paralelo";
    const verbose = opcoes.verbose;
    const projeto = opcoes.projeto ?? null;
    const salvarHistorico = opcoes.salvarHistorico ?? true;
    const logVerbose = verbose !== false;
    const perguntarUsuario = opcoes.perguntarUsuario;
    const maxEsclarecimentos = opcoes.maxEsclarecimentos ?? 3;
    const progressCallbacks: {
      onAgentStart?: (nome: string, modelo: string) => void;
      onAgentDone?: (nome: string, durationMs: number) => void;
      onAgentError?: (nome: string, error: string) => void;
    } = {};
    if (opcoes.onAgentStart) progressCallbacks.onAgentStart = opcoes.onAgentStart;
    if (opcoes.onAgentDone) progressCallbacks.onAgentDone = opcoes.onAgentDone;
    if (opcoes.onAgentError) progressCallbacks.onAgentError = opcoes.onAgentError;

    if (logVerbose) {
      console.log("\n" + "=".repeat(72));
      console.log("AGENTS-AI — Processamento de tarefa");
      console.log("=".repeat(72));
      console.log(`Tarefa: ${tarefa}`);
      if (projeto) {
        console.log(`Projeto: ${projeto.nome} (${projeto.id})`);
        console.log(`Caminho: ${projeto.caminho}`);
      } else {
        console.log("Projeto: (nenhum)");
      }
      console.log("=".repeat(72) + "\n");
    }

    let contextoGeral = "";
    let contextosPorAgente: Partial<Record<AgentName, string>> = {};

    if (projeto && projeto.caminho && fs.existsSync(projeto.caminho)) {
      try {
        const base = gerarContextoProjeto(projeto.caminho, "frontend");
        contextoGeral =
          `Estrutura de ficheiros:\n${base.estrutura}\n\n` +
          `Dependências / manifest:\n${base.dependencias}`;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("⚠️ Aviso ao ler contexto do projeto:", msg);
      }
    } else if (projeto && projeto.caminho) {
      console.warn(
        `⚠️ Caminho do projeto não existe: ${projeto.caminho} — continuando sem contexto de ficheiros.`
      );
    }

    if (logVerbose) {
      console.log("🧠 Analisando tarefa com o gestor...\n");
    }

    const plano = await this.analisarTarefa(
      tarefa,
      contextoGeral,
      perguntarUsuario,
      maxEsclarecimentos
    );

    if (logVerbose) {
      console.log("\n📋 Plano do gestor:");
      console.log(`   Análise: ${plano.analise}`);
      console.log(`   Agentes: [${plano.agentes_necessarios.join(", ")}]`);
      if (plano.criterios_aceitacao) {
        console.log(`   Critérios: ${plano.criterios_aceitacao}`);
      }
      if (plano.riscos) {
        console.log(`   Riscos: ${plano.riscos}`);
      }
      console.log();
    }

    if (projeto && projeto.caminho && fs.existsSync(projeto.caminho)) {
      const agentes = Array.isArray(plano.agentes_necessarios)
        ? plano.agentes_necessarios
        : [];
      for (const agente of agentes) {
        try {
          const ctx = gerarContextoProjeto(projeto.caminho, agente);
          contextosPorAgente[agente] = ctx.arquivosRelevantes;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`⚠️ Contexto para ${agente}:`, msg);
          contextosPorAgente[agente] = "";
        }
      }
    }

    const t0 = Date.now();
    const resultados = await this.executarAgentes(
      plano,
      contextosPorAgente,
      modo,
      logVerbose,
      progressCallbacks
    );
    const respostaFinal = await consolidarResultados(
      tarefa,
      plano,
      resultados,
      contextoGeral
    );
    const duracaoMs = Date.now() - t0;

    let execucaoSalva: Execution | null = null;
    if (salvarHistorico && projeto) {
      execucaoSalva = salvarExecucao(
        projeto.id,
        projeto.nome,
        tarefa,
        plano,
        resultados,
        respostaFinal,
        duracaoMs
      );
      incrementarTarefas(projeto.id);
    }

    const execucaoParaRelatorio: Execution =
      execucaoSalva ??
      ({
        id: Date.now().toString(),
        projetoId: projeto?.id ?? "standalone",
        projetoNome: projeto?.nome ?? "Sem projeto",
        tarefa,
        executadoEm: new Date().toISOString(),
        duracaoMs,
        plano,
        agentesUsados: plano.agentes_necessarios,
        resultadosPorAgente: resultados,
        respostaFinal,
      } satisfies Execution);

    const relatorioTexto = gerarRelatorioExecucao(execucaoParaRelatorio);
    const nomeArquivo = gerarNomeRelatorio(
      projeto?.nome ?? "standalone",
      "execucao"
    );
    const caminhoRelatorio = salvarRelatorio(relatorioTexto, nomeArquivo);
    if (logVerbose) {
      console.log(`\nRelatório guardado em: ${caminhoRelatorio}\n`);
    }

    // Salvar relatório de aprendizado na pasta do cliente (se identificado)
    const clienteNome = plano.cliente;
    if (clienteNome) {
      try {
        const clientDir = path.join(process.cwd(), "clients", clienteNome);
        if (!fs.existsSync(clientDir)) {
          fs.mkdirSync(clientDir, { recursive: true });
        }

        const agora = new Date();
        const timestamp = agora.toISOString().slice(0, 16).replace("T", " ");
        const dataArquivo = agora.toISOString().slice(0, 10);

        // Atualizar historico.md do cliente
        const historicoPath = path.join(clientDir, "historico.md");
        const qaResult = resultados["qa"] ?? "N/A";
        const qaStatus = typeof qaResult === "string" && qaResult.includes("APROVADO") ? "APROVADO" : "PENDENTE REVISÃO";

        const entrada =
          `\n## ${timestamp} — ${tarefa.slice(0, 80)}\n\n` +
          `- **Data:** ${dataArquivo}\n` +
          `- **Tarefa:** ${tarefa}\n` +
          `- **Status QA:** ${qaStatus}\n` +
          `- **Agentes:** ${plano.agentes_necessarios.join(", ")}\n` +
          `- **Duração:** ${(duracaoMs / 1000).toFixed(1)}s\n`;

        const aprendizado = plano.relatorio_aprendizado;
        const entradaAprendizado = aprendizado
          ? `- **Dificuldades:** ${aprendizado["dificuldades"] ?? "N/A"}\n` +
            `- **Decisões técnicas:** ${aprendizado["decisoes_tecnicas"] ?? "N/A"}\n`
          : "";

        if (fs.existsSync(historicoPath)) {
          fs.appendFileSync(historicoPath, entrada + entradaAprendizado);
        } else {
          fs.writeFileSync(
            historicoPath,
            `# Histórico de Tarefas — ${clienteNome}\n` + entrada + entradaAprendizado
          );
        }

        if (logVerbose) {
          console.log(`📁 Memória do cliente "${clienteNome}" atualizada em: ${historicoPath}`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`⚠️ Falha ao salvar memória do cliente: ${msg}`);
      }
    }

    return {
      plano,
      resultados,
      respostaFinal,
      caminhoRelatorio,
      duracaoMs,
    };
  }
}
