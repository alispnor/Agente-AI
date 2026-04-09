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
import type {
  AgentName,
  AgentResults,
  AskUserFn,
  Execution,
  OrchestratorOptions,
  OrchestratorResult,
  TaskPlan,
} from "../types/index.js";

function ts(): string {
  return new Date().toISOString();
}

type AgenteFn = (tarefa: string, ctx?: string) => Promise<string>;

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
   * Cada grupo interno roda em paralelo; grupos rodam sequencialmente entre si.
   * Se ordem_execucao não existir, usa o modo clássico (paralelo ou sequencial).
   */
  private async executarAgentes(
    plano: TaskPlan,
    contextosPorAgente: Partial<Record<AgentName, string>> = {},
    modo: "paralelo" | "sequencial" = "paralelo",
    logAgentes = true
  ): Promise<AgentResults> {
    const subtarefas = plano.subtarefas ?? {};
    const resultados: AgentResults = {};

    const tarefaPara = (nome: AgentName): string => {
      const st = subtarefas[nome];
      return st !== undefined && String(st).trim() !== ""
        ? st
        : JSON.stringify(plano);
    };

    const executarUm = async (
      nome: AgentName
    ): Promise<[AgentName, string]> => {
      const fn = this.agentes[nome];
      if (!fn) {
        console.warn(`⚠️ Agente desconhecido ou não registado: ${nome}`);
        return [nome, `[agente ${nome} não disponível]`];
      }
      const ctx = contextosPorAgente[nome] ?? "";
      const tarefaAgente = tarefaPara(nome);
      if (logAgentes) {
        console.log(`🤖 [${ts()}] Iniciando agente: ${nome}`);
      }
      const resposta = await fn(tarefaAgente, ctx);
      if (logAgentes) {
        console.log(`✅ [${ts()}] Concluído agente: ${nome}`);
      }
      return [nome, resposta];
    };

    // ── MODO SEQUENCIAL ANTI-429 ──
    // Todos os agentes rodam estritamente um por vez para evitar
    // estourar o rate limit da API Anthropic (10k TPM).
    // A ordem_execucao do gestor é respeitada, mas sem paralelismo.
    console.log(`\n🔒 [ORQUESTRADOR] Rodando em modo sequencial anti-429\n`);

    // Montar lista ordenada de agentes
    let agentesOrdenados: AgentName[];

    if (plano.ordem_execucao && plano.ordem_execucao.length > 0) {
      // Achatar os grupos mantendo a ordem definida pelo gestor
      agentesOrdenados = plano.ordem_execucao.flat();
      if (logAgentes) {
        const etapas = plano.ordem_execucao
          .map((g, i) => `  Etapa ${i + 1}: [${g.join(", ")}]`)
          .join("\n");
        console.log(`📋 Ordem definida pelo gestor (executando sequencialmente):\n${etapas}\n`);
      }
    } else {
      agentesOrdenados = Array.isArray(plano.agentes_necessarios)
        ? plano.agentes_necessarios
        : [];
    }

    // Executar um por um, estritamente sequencial
    for (const nome of agentesOrdenados) {
      const [k, v] = await executarUm(nome);
      resultados[k] = v;
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
      logVerbose
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
