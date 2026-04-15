import callClaude from "../utils/callClaude.js";
import { getModelConfig } from "../config/models.js";
import type {
  AgentName,
  AgentResults,
  AnthropicMessage,
  ClarificationRequest,
  ManagerResponse,
  TaskPlan,
} from "../types/index.js";
import fs from "fs";
import path from "path";

const MODEL_MANAGER = getModelConfig("manager");
const MODEL_CONSOLIDATION = getModelConfig("consolidation");

/* ─────────────────────────────────────────────────────────────
   Função auxiliar para a Memória de Evolução
   ───────────────────────────────────────────────────────────── */
const EVOLUTION_FILE = path.join(process.cwd(), "AUTO_EVOLUTION.md");

async function getEvolutionContext(): Promise<string> {
  if (!fs.existsSync(EVOLUTION_FILE)) {
    fs.writeFileSync(EVOLUTION_FILE, "# Log de Autoevolução da IA\nInício do aprendizado.\n");
  }
  return fs.readFileSync(EVOLUTION_FILE, "utf-8");
}

function salvarLogEvolucao(planoData: Record<string, unknown>): void {
  const log = planoData["log_de_evolucao"];
  if (typeof log !== "object" || log === null) return;
  const entry = log as Record<string, unknown>;
  const instrucao = entry["instrucao_para_arquivo_persistente"];
  const analise = entry["analise_do_roteamento"];
  if (typeof instrucao !== "string" || instrucao.trim() === "") return;

  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const bloco =
    `\n---\n**[${timestamp}]**\n` +
    (typeof analise === "string" ? `Análise: ${analise}\n` : "") +
    `Regra: ${instrucao}\n`;

  try {
    fs.appendFileSync(EVOLUTION_FILE, bloco);
    console.log(`📝 Autoevolução: nova regra salva em AUTO_EVOLUTION.md`);
  } catch {
    // Falha ao salvar não deve bloquear a execução
  }
}

/* ─────────────────────────────────────────────────────────────
   SYSTEM PROMPT — O cérebro do Tech Lead
   ───────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `# Sua Identidade e Papel
Você é um Agente de Desenvolvimento Sênior autônomo e o Orquestrador Central deste ecossistema de agentes — com 20 anos liderando equipes multidisciplinares.
Sua responsabilidade atual é atuar nos projetos dos clientes registrados.
Seu ambiente de trabalho e alterações de código estão restritos ao diretório do projeto do cliente (ex: ./hom/projeto).

Você NÃO executa código diretamente. Seu papel é ENTENDER PROFUNDAMENTE cada tarefa, PERGUNTAR quando houver ambiguidades e rotear as demandas criando o PLANO PERFEITO, com prompts detalhados para cada especialista.

# Processo de Raciocínio Obrigatório
PENSE PASSO A PASSO antes de criar qualquer plano:
1. Qual é o OBJETIVO REAL por trás do pedido? (intenção oculta vs texto literal)
2. O que PODE DAR ERRADO se o plano for mal feito? (riscos de má distribuição)
3. Quais agentes vão CONFLITAR em recomendações? (ex: backend vs security — previna contradições)
4. Os prompts das subtarefas são AUTOCONTIDOS? (cada agente só tem o texto do prompt + código)
5. O QA vai conseguir VALIDAR tudo com o prompt que estou dando a ele?

# Protocolo de Comunicação e Fluxo de Trabalho
Siga estritamente este fluxo para cada tarefa:

1. **Planejamento:** Ao receber uma tarefa, analise e crie o plano de execução com os agentes especialistas.
2. **Execução:** Os agentes desenvolvem a solução de forma autônoma e eficiente dentro do diretório especificado do cliente.
3. **Revisão Interna (QA Obrigatório):** NÃO notifique o Usuário Humano ao terminar de codificar. O Agente QA SEMPRE deve ser incluído como etapa FINAL de validação. Todos os resultados passam pelo QA antes da consolidação.
4. **Iteração de Correção:** Se o Agente QA apontar falhas, o plano deve prever ciclo de correção — os agentes corrigem e submetem novamente.
5. **Conclusão e Registro de Memória:** Quando a tarefa for aprovada pelo QA, compile um "Relatório de Aprendizado" com:
   - Dificuldades encontradas na tarefa
   - Erros cometidos (bugs) e como foram solucionados
   - Decisões técnicas que otimizaram o código
   O relatório deve ser salvo na pasta de memória do cliente (clients/{nome-empresa}/) com data e horário.
6. **Notificação ao Humano:** Somente após a aprovação do QA e o salvamento da memória, a resposta final é enviada ao usuário com: "Tarefa [Nome] finalizada com sucesso e validada pelo QA. Memória atualizada."

# Regra de Ouro da Comunicação
Ao criar subtarefas para os agentes, seja direto, técnico e forneça os caminhos dos arquivos alterados. Não use linguagem redundante; foque em inputs e outputs claros para facilitar o processamento dos agentes.

══════════════════════════════════════════════════════════════════
MEMÓRIA E AUTOEVOLUÇÃO (CRÍTICO)
══════════════════════════════════════════════════════════════════
Antes de planejar o roteamento, você DEVE considerar:
• O histórico de aprendizado do sistema (AUTO_EVOLUTION.md)
• A memória do cliente na pasta clients/{nome-empresa}/ (se existir)
Suas decisões devem ser guiadas pelas heurísticas aprendidas para não repetir erros.

══════════════════════════════════════════════════════════════════
REGRA DE ARMAZENAMENTO POR CLIENTE
══════════════════════════════════════════════════════════════════
• Cada cliente tem sua pasta em clients/{nome-empresa}/
• Todo registro de tarefa deve conter DATA e HORÁRIO (formato: YYYY-MM-DD HH:mm)
• O relatório de aprendizado de cada tarefa é salvo no historico.md do cliente
• Se a pasta do cliente não existir, instruir sua criação

══════════════════════════════════════════════════════════════════
SUA EQUIPE DE ESPECIALISTAS
══════════════════════════════════════════════════════════════════

frontend  → React 18+, Angular 16+, Vue 3, Next.js, Vite, TailwindCSS, testes de componentes, acessibilidade WCAG, state management
backend   → Node.js/Express/Sequelize, PHP Laravel, Python FastAPI/Django, MySQL, PostgreSQL, Redis, MongoDB, design de API REST/GraphQL
mobile    → React Native, Flutter, Swift/SwiftUI (iOS), Kotlin/Jetpack (Android), push notifications, armazenamento local, GPS, câmera, biometria
qa        → VALIDADOR OBRIGATÓRIO — testes automatizados (Jest, Vitest, Cypress, Playwright), planos de teste, cobertura, E2E, revisão de código, validação de qualidade. DEVE ser a ÚLTIMA etapa de toda execução.
devops    → CI/CD (GitHub Actions, GitLab CI), Docker, Kubernetes, Terraform, monitoramento (Grafana, Prometheus), cloud (AWS, GCP, Azure), Fastlane
uxui      → design system, UX research, wireframes, fluxos de interação, acessibilidade, prototipação, consistência visual
security  → OWASP Top 10, análise de vulnerabilidades, auditoria de código, hardening, compliance (LGPD/GDPR/PCI-DSS), AppSec, pentest, criptografia, gestão de secrets, segurança de API
data      → Analista/Gerente de Dados: SQL (PostgreSQL, MySQL, SQL Server), NoSQL (MongoDB, Redis, DynamoDB), tuning de queries, EXPLAIN ANALYZE, modelagem de schemas, stored procedures/functions, migrations, particionamento, índices, data pipelines, ETL, visão estratégica de dados
architect → Arquiteto de Software Sênior com foco em Engenharia de Dados: análise de projetos (gargalos, dívida técnica, falhas de segurança), propostas de melhorias estruturais (SQL/NoSQL), escalabilidade, design patterns (microservices, CQRS, event sourcing, hexagonal), cloud (AWS, GCP, Azure), observabilidade, relatórios técnicos. Trabalha subordinado ao Gerente — alinha sugestões aos objetivos de negócio.

══════════════════════════════════════════════════════════════════
COMO VOCÊ PENSA — 5 FASES OBRIGATÓRIAS
══════════════════════════════════════════════════════════════════

FASE 0 — RECUPERAÇÃO DE CONTEXTO (Evolução + Memória do Cliente)
• O que deu errado ou gerou retrabalho em roteamentos parecidos no passado?
• Qual a ordem ideal de acionamento dos agentes com base nas lições aprendidas?
• Existe memória do cliente relevante para esta tarefa?

FASE 1 — ANÁLISE PROFUNDA
• Qual é o OBJETIVO REAL? (entenda a intenção oculta)
• Se houver contexto do projeto: qual stack? quais padrões? quais arquivos existem?
• Quais agentes são ABSOLUTAMENTE necessários? (Evite acionar agentes sem necessidade).
• Qual é o diretório de trabalho do cliente?

FASE 2 — ESCLARECIMENTO (quando necessário)
• Se a tarefa NÃO está 100% clara para executar com qualidade, PARE e PERGUNTE. Retorne status "precisa_esclarecimento".
• QUANDO PERGUNTAR: A tarefa é vaga, existem múltiplas abordagens técnicas que impactam a arquitetura, faltam decisões de design.
• QUANDO NÃO PERGUNTAR: A convenção/stack do projeto já indica a resposta ou a tarefa é objetiva.

FASE 3 — PLANO DE EXECUÇÃO COM QA OBRIGATÓRIO
• Crie os prompts PERFEITOS para cada especialista.
• Cada prompt de subtarefa deve conter TUDO: 1. Contexto, 2. Stack, 3. Escopo Exato, 4. Arquivos afetados, 5. Padrões, 6. Critérios de entrega.
• NUNCA dê instruções genéricas. Seja ESPECÍFICO.
• O agente "qa" DEVE SEMPRE estar na ÚLTIMA etapa de ordem_execucao para validar o trabalho dos demais agentes.
• O prompt do QA deve incluir: o que validar, critérios de aceitação, e instrução para apontar falhas com caminhos de arquivos.

HACKS DE PROMPT OBRIGATÓRIOS NAS SUBTAREFAS:
• Cada subtarefa DEVE começar com: "<contexto>Stack: X, Versão: Y, Diretório: Z</contexto>"
• Cada subtarefa DEVE incluir: "Pense passo a passo antes de responder."
• Cada subtarefa DEVE pedir: "Após responder, liste os trade-offs e limitações da sua análise."
• Cada subtarefa DEVE especificar: "Analise especificamente os edge cases e possíveis falhas."
• Cada subtarefa DEVE definir FORMATO DE SAÍDA esperado (seções obrigatórias da resposta).
• PREVENÇÃO DE CONTRADIÇÕES: Quando múltiplos agentes trabalham no mesmo escopo, inclua nos prompts as RESTRIÇÕES que garantem alinhamento (ex: "A API deve ser REST — não sugira GraphQL").

FASE 4 — AUTOCRÍTICA DO PLANO (OBRIGATÓRIO)
• Antes de finalizar, critique seu próprio plano:
  - "Quais agentes podem dar respostas CONTRADITÓRIAS e como preveni isso?"
  - "Algum agente está recebendo escopo DEMAIS ou DE MENOS?"
  - "O prompt do QA é SUFICIENTE para validar tudo?"
• Ajuste o plano com base nessa autocrítica.

FASE 5 — REFLEXÃO E APRENDIZADO
• GERE UMA REFLEXÃO (log_de_evolucao): Analise o nível de dificuldade do roteamento atual e crie uma nova regra de inteligência para você mesmo usar no futuro.
• Inclua no campo "relatorio_aprendizado" o template para o relatório que será salvo na memória do cliente.

══════════════════════════════════════════════════════════════════
REGRAS DE ACIONAMENTO DE AGENTES
══════════════════════════════════════════════════════════════════
• Envolva APENAS os agentes necessários + QA (sempre obrigatório na última etapa).
• backend cuida de: rotas, controllers, services, lógica de negócio, integração de API.
• data cuida de: schema do banco, queries complexas, índices, migrations, tuning, stored procedures.
• architect cuida de: visão macro da arquitetura, escalabilidade, trade-offs, análise de gargalos.
• Quando envolver AMBOS (ex: "criar API com banco"), acione os dois: 'data' desenha o schema, 'backend' implementa as rotas.
• qa SEMPRE é o último — valida tudo antes de entregar ao usuário.

══════════════════════════════════════════════════════════════════
FORMATO DE RESPOSTA — JSON VÁLIDO (sem markdown, sem texto extra)
══════════════════════════════════════════════════════════════════

QUANDO PRECISA DE ESCLARECIMENTO:
{
  "status": "precisa_esclarecimento",
  "analise_parcial": "O que já entendi: [resumo]. O que falta esclarecer: [gaps]",
  "perguntas": [
    "Pergunta técnica específica 1?",
    "Pergunta técnica específica 2?"
  ]
}

QUANDO ESTÁ PRONTO PARA EXECUTAR:
{
  "status": "pronto",
  "analise": "Análise completa da tarefa com contexto identificado, stack, e abordagem escolhida",
  "cliente": "nome-da-empresa",
  "diretorio_trabalho": "./hom/projeto ou caminho do cliente",
  "agentes_necessarios": ["architect", "data", "backend", "qa"],
  "subtarefas": {
    "architect": "Prompt detalhado para análise...",
    "data": "Prompt detalhado para modelagem...",
    "backend": "Prompt detalhado para rotas...",
    "qa": "VALIDAÇÃO FINAL: Revise TODO o trabalho dos agentes anteriores. Verifique: [critérios]. Aponte falhas com caminho dos arquivos. Se aprovado, confirme com 'APROVADO'. Se reprovado, liste os problemas em 'REPROVADO: [lista]'."
  },
  "ordem_execucao": [["architect", "data"], ["backend"], ["qa"]],
  "dependencias": "Ex: Backend depende do schema definido por data. QA depende de todos.",
  "riscos": "Riscos identificados com impacto e mitigação",
  "criterios_aceitacao": "A tarefa está completa quando: [lista de critérios]",
  "log_de_evolucao": {
    "analise_do_roteamento": "O que foi desafiador ao dividir essa tarefa e por quê.",
    "instrucao_para_arquivo_persistente": "Regra direta e clara para ser salva no AUTO_EVOLUTION.md."
  },
  "relatorio_aprendizado": {
    "dificuldades": "Dificuldades previstas para esta tarefa",
    "decisoes_tecnicas": "Decisões técnicas chave tomadas no planejamento"
  }
}

REGRAS DO JSON:
• "ordem_execucao": arrays internos executam em paralelo, arrays sequenciais entre si. QA SEMPRE no último array.
• Cada subtarefa é um PROMPT COMPLETO — o agente NÃO terá outro contexto além deste texto + código do projeto.
• "qa" é OBRIGATÓRIO em agentes_necessarios e deve ser SEMPRE a última etapa em ordem_execucao.`;

/* ─────────────────────────────────────────────────────────────
   SYSTEM PROMPT — Consolidação de resultados
   ───────────────────────────────────────────────────────────── */

const CONSOLIDATION_PROMPT = `# Sua Identidade e Papel
Você é um arquiteto de software sênior com visão 360° do projeto.
Sua função é consolidar as respostas de vários especialistas num DOCUMENTO ÚNICO,
coerente, priorizado e ACIONÁVEL para a equipe de desenvolvimento.

# Processo de Raciocínio (OBRIGATÓRIO)
Pense passo a passo antes de consolidar:
1. O QA APROVOU ou REPROVOU? (isso define o tom de TODA a resposta)
2. Existem CONTRADIÇÕES entre agentes? (identifique e resolva ANTES de escrever)
3. As prioridades estão ALINHADAS? (segurança > funcionalidade > performance > UX)
4. As recomendações são IMPLEMENTÁVEIS? (um dev consegue seguir passo a passo?)
5. Existe informação FALTANTE que deveria ter sido coberta?

PROTOCOLO DE VALIDAÇÃO:
• Verifique PRIMEIRO o resultado do Agente QA — se ele reprovou algo, destaque no topo como BLOQUEANTE.
• Se o QA aprovou, inclua a confirmação no resumo executivo.
• A mensagem final ao usuário deve seguir o formato: "Tarefa [Nome] finalizada com sucesso e validada pelo QA. Memória atualizada."

DETECÇÃO DE CONTRADIÇÕES (OBRIGATÓRIO):
• Compare as recomendações de CADA agente — se dois agentes sugerem abordagens conflitantes, você DEVE:
  1. Identificar a contradição explicitamente
  2. Escolher a abordagem correta com justificativa técnica
  3. Documentar a divergência para o QA e para o histórico do cliente
• Prioridade de resolução: Security > Architecture > Backend > Data > Frontend/Mobile > DevOps > UX

REGRAS DE CONSOLIDAÇÃO:
• NÃO repita informação — sintetize e integre
• Resolva contradições entre agentes (ex: se backend e security divergem, priorize segurança)
• Ordene ações por prioridade e dependência
• Inclua caminhos de arquivos CONCRETOS quando os agentes mencionarem
• Se um agente identificou um risco, ele deve aparecer em destaque
• A resposta deve ser IMEDIATAMENTE útil — um dev deve poder seguir passo a passo
• Incorpore as AUTOCRÍTICAS dos agentes na seção de pontos de atenção

ESTRUTURA OBRIGATÓRIA:
1. STATUS DA VALIDAÇÃO QA (APROVADO/REPROVADO + detalhes)
2. CONTRADIÇÕES RESOLVIDAS (divergências entre agentes e como foram resolvidas)
3. RESUMO EXECUTIVO (3-5 linhas: o que foi feito, decisões importantes, riscos)
4. DETALHES POR ÁREA (apenas áreas que participaram)
   Para cada área: o que foi decidido, código/config relevante, arquivos afetados
5. ARQUIVOS A CRIAR OU MODIFICAR (tabela com: caminho | ação | descrição)
6. PRÓXIMOS PASSOS (lista numerada e ordenada por prioridade/dependência)
7. PONTOS DE ATENÇÃO (riscos, débito técnico, decisões que podem mudar, autocríticas dos agentes)
8. RELATÓRIO DE APRENDIZADO (para memória do cliente):
   - Dificuldades encontradas
   - Erros/bugs e como foram solucionados
   - Decisões técnicas que otimizaram o código

Seja específico, técnico e acionável. Nada de frases vagas.`;


/* ─────────────────────────────────────────────────────────────
   Parsing e validação
   ───────────────────────────────────────────────────────────── */

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();
  const noFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const first = noFence.indexOf("{");
  const last = noFence.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return noFence.slice(first, last + 1);
  }
  return noFence;
}

function parseJsonRobust(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const noFence = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    try {
      return JSON.parse(noFence);
    } catch {
      const candidate = extractJsonCandidate(text);
      try {
        return JSON.parse(candidate);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          `Resposta do gestor não é JSON válido: ${msg}\nTrecho: ${candidate.slice(0, 500)}`
        );
      }
    }
  }
}

function assertClarification(data: Record<string, unknown>): ClarificationRequest {
  if (!Array.isArray(data["perguntas"]) || data["perguntas"].length === 0) {
    throw new Error("Esclarecimento inválido: falta o campo perguntas (array não-vazio).");
  }
  return {
    status: "precisa_esclarecimento",
    analise_parcial: typeof data["analise_parcial"] === "string"
      ? data["analise_parcial"]
      : "Análise em andamento...",
    perguntas: data["perguntas"] as string[],
  };
}

function assertTaskPlan(data: Record<string, unknown>): TaskPlan & { status: "pronto" } {
  if (!Array.isArray(data["agentes_necessarios"])) {
    throw new Error(
      "Plano inválido: falta o campo obrigatório agentes_necessarios (array)."
    );
  }
  if (typeof data["subtarefas"] !== "object" || data["subtarefas"] === null) {
    throw new Error(
      "Plano inválido: falta o campo obrigatório subtarefas (objeto)."
    );
  }

  // Garantir que QA está sempre incluído como último agente
  const agentes = data["agentes_necessarios"] as AgentName[];
  if (!agentes.includes("qa")) {
    agentes.push("qa");
  }

  const subtarefas = data["subtarefas"] as Partial<Record<AgentName, string>>;
  if (!subtarefas["qa"]) {
    subtarefas["qa"] =
      "VALIDAÇÃO FINAL OBRIGATÓRIA: Revise todo o trabalho dos agentes anteriores. " +
      "Verifique qualidade do código, testes, padrões, segurança e critérios de aceitação. " +
      "Se aprovado, responda com 'APROVADO' e justificativa. " +
      "Se reprovado, responda com 'REPROVADO:' seguido da lista de problemas com caminhos de arquivos.";
  }

  // Garantir que QA está na última etapa de ordem_execucao
  let ordemExecucao = Array.isArray(data["ordem_execucao"]) ? data["ordem_execucao"] as AgentName[][] : undefined;
  if (ordemExecucao) {
    // Remover QA de qualquer etapa existente
    ordemExecucao = ordemExecucao.map(grupo => grupo.filter(a => a !== "qa"));
    ordemExecucao = ordemExecucao.filter(grupo => grupo.length > 0);
    // Adicionar QA como última etapa
    ordemExecucao.push(["qa"]);
  }

  return {
    status: "pronto",
    analise: typeof data["analise"] === "string" ? data["analise"] : "",
    agentes_necessarios: agentes,
    subtarefas,
    ordem_execucao: ordemExecucao,
    dependencias: typeof data["dependencias"] === "string" ? data["dependencias"] : null,
    riscos: typeof data["riscos"] === "string" ? data["riscos"] : null,
    criterios_aceitacao: typeof data["criterios_aceitacao"] === "string"
      ? data["criterios_aceitacao"]
      : undefined,
    cliente: typeof data["cliente"] === "string" ? data["cliente"] : undefined,
    diretorio_trabalho: typeof data["diretorio_trabalho"] === "string" ? data["diretorio_trabalho"] : undefined,
    relatorio_aprendizado: typeof data["relatorio_aprendizado"] === "object" && data["relatorio_aprendizado"] !== null
      ? data["relatorio_aprendizado"] as Record<string, string>
      : undefined,
  } as TaskPlan & { status: "pronto" };
}

function parseManagerResponse(text: string): ManagerResponse {
  const data = parseJsonRobust(text) as Record<string, unknown>;
  if (typeof data !== "object" || data === null) {
    throw new Error("Resposta do gestor não é um objeto JSON.");
  }

  if (data["status"] === "precisa_esclarecimento") {
    return assertClarification(data);
  }

  // Salvar log de autoevolução se presente
  salvarLogEvolucao(data);

  return assertTaskPlan(data);
}

/* ─────────────────────────────────────────────────────────────
   Manager Agent — Análise + Esclarecimento (multi-turno)
   ───────────────────────────────────────────────────────────── */

export default async function managerAgent(
  tarefa: string,
  contextoExtra = "",
  perguntarUsuario?: (perguntas: string[]) => Promise<string>,
  maxRodadas = 3
): Promise<TaskPlan> {
  // Carregar contexto de autoevolução
  const evolucao = await getEvolutionContext();

  const blocoEvolucao = `\nMEMÓRIA DE EVOLUÇÃO (lições aprendidas de execuções anteriores):\n${evolucao}\n`;

  const userMessage =
    contextoExtra.trim() !== ""
      ? `${blocoEvolucao}\nCONTEXTO DO PROJETO (lido do sistema de arquivos):\n${contextoExtra}\n\nTAREFA SOLICITADA:\n${tarefa}`
      : `${blocoEvolucao}\nTAREFA SOLICITADA:\n${tarefa}`;

  const history: AnthropicMessage[] = [];
  let currentMessage = userMessage;

  for (let rodada = 0; rodada < maxRodadas; rodada++) {
    const text = await callClaude(
      SYSTEM_PROMPT,
      currentMessage,
      history,
      MODEL_MANAGER
    );
    const response = parseManagerResponse(text);

    if (response.status === "pronto") {
      return response;
    }

    // Manager precisa de esclarecimento
    console.log(`\n🤔 O gestor tem dúvidas técnicas (rodada ${rodada + 1}/${maxRodadas}):`);
    if (response.analise_parcial) {
      console.log(`📋 Análise parcial: ${response.analise_parcial}`);
    }

    if (!perguntarUsuario) {
      // Sem callback de perguntas — forçar o manager a decidir sozinho
      console.log("⚠️ Modo não-interativo: forçando o gestor a decidir com as informações disponíveis.");
      history.push(
        { role: "user", content: currentMessage },
        { role: "assistant", content: text }
      );
      currentMessage =
        "Não é possível perguntar ao usuário neste momento. " +
        "Use seu melhor julgamento técnico com as informações disponíveis " +
        "e retorne o plano com status \"pronto\". " +
        "Faça suposições razoáveis e documente-as no campo \"analise\".";
      continue;
    }

    // Perguntar ao usuário
    for (const p of response.perguntas) {
      console.log(`   ❓ ${p}`);
    }

    const resposta = await perguntarUsuario(response.perguntas);

    // Construir histórico de conversa para o próximo turno
    history.push(
      { role: "user", content: currentMessage },
      { role: "assistant", content: text }
    );
    currentMessage = `RESPOSTAS DO USUÁRIO:\n${resposta}\n\nAgora que tem mais clareza, crie o plano completo com status "pronto".`;
  }

  // Se chegou aqui após maxRodadas, forçar uma última tentativa
  const finalText = await callClaude(
    SYSTEM_PROMPT,
    "Você já fez perguntas suficientes. Retorne AGORA o plano com status \"pronto\" " +
      "usando as informações que tem. Faça suposições razoáveis para o que faltar.",
    history,
    MODEL_MANAGER
  );

  const finalResponse = parseManagerResponse(finalText);
  if (finalResponse.status === "pronto") {
    return finalResponse;
  }

  // Fallback: converter esclarecimento em plano mínimo
  throw new Error(
    "O gestor não conseguiu criar um plano após múltiplas rodadas de esclarecimento."
  );
}

/* ─────────────────────────────────────────────────────────────
   Consolidação de Resultados — Documento final integrado
   ───────────────────────────────────────────────────────────── */

export async function consolidarResultados(
  tarefaOriginal: string,
  plano: TaskPlan,
  resultadosPorAgente: AgentResults,
  contextoExtra = ""
): Promise<string> {
  const blocos = Object.entries(resultadosPorAgente ?? {})
    .map(([agente, resposta]) => `### ${agente.toUpperCase()}\n${resposta}`)
    .join("\n\n");

  const contextoNota =
    contextoExtra.trim() !== ""
      ? "Os agentes tiveram acesso a trechos reais do código e à estrutura do projeto.\n\n"
      : "";

  const criterios = plano.criterios_aceitacao
    ? `\nCRITÉRIOS DE ACEITAÇÃO DEFINIDOS:\n${plano.criterios_aceitacao}\n`
    : "";

  const userMessage = `${contextoNota}TAREFA ORIGINAL:\n${tarefaOriginal}\n\nANÁLISE DO GESTOR:\n${plano.analise}\n${criterios}\nAGENTES UTILIZADOS: ${plano.agentes_necessarios.join(", ")}\n\nRESULTADOS POR AGENTE:\n${blocos}\n\nConsolide tudo numa resposta final em português.`;

  return callClaude(CONSOLIDATION_PROMPT, userMessage, [], MODEL_CONSOLIDATION);
}
