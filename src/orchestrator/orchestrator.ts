import fs from "node:fs";
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

    // Se tem ordem_execucao definida, respeitar grupos
    if (plano.ordem_execucao && plano.ordem_execucao.length > 0) {
      if (logAgentes) {
        const etapas = plano.ordem_execucao
          .map((g, i) => `  Etapa ${i + 1}: [${g.join(", ")}]`)
          .join("\n");
        console.log(`📋 Ordem de execução definida pelo gestor:\n${etapas}\n`);
      }

      for (let i = 0; i < plano.ordem_execucao.length; i++) {
        const grupo = plano.ordem_execucao[i];
        if (!grupo || grupo.length === 0) continue;

        if (logAgentes) {
          console.log(`\n── Etapa ${i + 1}/${plano.ordem_execucao.length}: [${grupo.join(", ")}] ──`);
        }

        if (grupo.length === 1) {
          const nome = grupo[0]!;
          const [k, v] = await executarUm(nome);
          resultados[k] = v;
        } else {
          // Executar grupo em paralelo
          const pairs = await Promise.all(grupo.map((nome) => executarUm(nome)));
          for (const [k, v] of pairs) {
            resultados[k] = v;
          }
        }
      }

      return resultados;
    }

    // Fallback: modo clássico
    const nomes = Array.isArray(plano.agentes_necessarios)
      ? plano.agentes_necessarios
      : [];

    if (modo === "sequencial") {
      for (const nome of nomes) {
        const [k, v] = await executarUm(nome);
        resultados[k] = v;
      }
    } else {
      const pairs = await Promise.all(nomes.map((nome) => executarUm(nome)));
      for (const [k, v] of pairs) {
        resultados[k] = v;
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

    return {
      plano,
      resultados,
      respostaFinal,
      caminhoRelatorio,
      duracaoMs,
    };
  }
}
