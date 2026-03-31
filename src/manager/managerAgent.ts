import callClaude from "../utils/callClaude.js";
import type { AgentResults, TaskPlan } from "../types/index.js";

const SYSTEM_PROMPT = `Você é um Tech Lead / Project Manager sênior com 15 anos de experiência.
Você recebe tarefas que podem envolver projetos existentes ou novos.
Quando receber contexto de um projeto real (estrutura de arquivos, código existente),
use esse contexto para tomar decisões mais precisas sobre quais agentes acionar
e quais sub-tarefas criar.

SUA EQUIPE:
- frontend : React.js, Angular 16+, Vue.js 3 — especialista nos três frameworks
- backend  : Node.js+Express+Sequelize, PHP Laravel, Python FastAPI/Django,
             MySQL, PostgreSQL, Redis, MongoDB
- mobile   : React Native, Flutter, Swift/SwiftUI (iOS nativo), Kotlin/Jetpack Compose (Android nativo)
- qa       : testes automatizados, planos de teste, cobertura, E2E, testes mobile
- devops   : CI/CD, Docker, Kubernetes, cloud, IaC, monitoramento, Fastlane para mobile
- uxui     : design system, UX research, fluxos, acessibilidade, design mobile

QUANDO ACIONAR O AGENTE MOBILE:
- Qualquer tarefa que mencione: app, mobile, iOS, Android, React Native, Flutter,
  Swift, Kotlin, Expo, Play Store, App Store, push notification, offline, GPS,
  câmera, biometria, ou qualquer funcionalidade de dispositivo
  
REGRAS:
- Envolva APENAS os agentes necessários para a tarefa específica
- Se o contexto do projeto revelar a stack tecnológica, mencione-a nas sub-tarefas
- Se for uma correção de bug, instrua o agente responsável a analisar o código fornecido
- Se for uma nova feature, detalhe o que deve ser criado e onde no projeto

RESPONDA APENAS com JSON válido, sem markdown, sem explicações adicionais:
{
  "analise": "resumo do que foi pedido e contexto identificado",
  "agentes_necessarios": ["frontend", "backend"],
  "subtarefas": {
    "frontend": "instrução detalhada para o frontend, mencione arquivos relevantes se souber",
    "backend": "instrução detalhada para o backend"
  },
  "dependencias": "descrição das dependências ou null",
  "riscos": "riscos identificados ou null"
}`;

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

function assertTaskPlan(data: unknown): TaskPlan {
  if (typeof data !== "object" || data === null) {
    throw new Error("Plano inválido: resposta do gestor não é um objeto JSON.");
  }
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o["agentes_necessarios"])) {
    throw new Error(
      "Plano inválido: falta o campo obrigatório agentes_necessarios (array)."
    );
  }
  if (typeof o["subtarefas"] !== "object" || o["subtarefas"] === null) {
    throw new Error(
      "Plano inválido: falta o campo obrigatório subtarefas (objeto)."
    );
  }
  return data as TaskPlan;
}

function parsePlanoJson(text: string): TaskPlan {
  const trimmed = text.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const noFence = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    try {
      parsed = JSON.parse(noFence);
    } catch {
      const candidate = extractJsonCandidate(text);
      try {
        parsed = JSON.parse(candidate);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          `Resposta do gestor não é JSON válido: ${msg}\nTrecho: ${candidate.slice(0, 500)}`
        );
      }
    }
  }
  return assertTaskPlan(parsed);
}

export default async function managerAgent(
  tarefa: string,
  contextoExtra = ""
): Promise<TaskPlan> {
  const userMessage =
    contextoExtra.trim() !== ""
      ? `CONTEXTO DO PROJETO (lido do sistema de arquivos):\n${contextoExtra}\n\nTAREFA SOLICITADA:\n${tarefa}`
      : tarefa;

  const text = await callClaude(SYSTEM_PROMPT, userMessage, []);
  return parsePlanoJson(text);
}

export async function consolidarResultados(
  tarefaOriginal: string,
  plano: TaskPlan,
  resultadosPorAgente: AgentResults,
  contextoExtra = ""
): Promise<string> {
  const blocos = Object.entries(resultadosPorAgente ?? {})
    .map(([agente, resposta]) => `### ${agente}\n${resposta}`)
    .join("\n\n");

  const contextoNota =
    contextoExtra.trim() !== ""
      ? "Os agentes especialistas tiveram acesso a trechos reais do código e à estrutura do projeto quando aplicável.\n\n"
      : "";

  const userMessage = `${contextoNota}TAREFA ORIGINAL:\n${tarefaOriginal}\n\nPLANO DO GERENTE (JSON resumido):\n${JSON.stringify(plano, null, 2)}\n\nRESULTADOS POR AGENTE:\n${blocos}\n\nConsolide tudo numa resposta final estruturada em português com as seções:\n1) Resumo executivo\n2) Detalhes por área (frontend, backend, qa, devops, uxui — apenas as que se aplicarem)\n3) Próximos passos práticos (ordenados)\n4) Arquivos que devem ser criados ou modificados (caminhos sugeridos quando possível)\n\nSeja específico e acionável.`;

  const systemPrompt = `Você é um arquiteto de software sênior. Sua função é consolidar respostas de vários especialistas num documento único, coerente e útil para a equipa de desenvolvimento. Não repita texto desnecessariamente; integre e priorize.`;

  return callClaude(systemPrompt, userMessage, []);
}
