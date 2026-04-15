// Configuração de modelo por agente
// Cada agente pode usar um modelo diferente da Anthropic

export interface ModelConfig {
  model: string;
  max_tokens: number;
  thinking?: { type: "enabled"; budget_tokens: number };
  temperature?: number;
  description: string;
}

// Hierarquia de modelos Anthropic (do mais capaz ao mais rápido):
// claude-opus-4-5       → máxima capacidade, mais lento, mais caro
// claude-sonnet-4-5     → equilíbrio ideal (recomendado para a maioria)
// claude-haiku-4-5-20251001  → mais rápido e barato, bom para tarefas simples

export const AGENT_MODELS: Record<string, ModelConfig> = {
  // Gerente: usa Opus — precisa de máximo raciocínio para decompor tarefas
  manager: {
    model: "claude-opus-4-5",
    max_tokens: 4096,
    thinking: { type: "enabled", budget_tokens: 2000 },
    description:
      "Opus com extended thinking — máxima capacidade de planejamento",
  },

  // Frontend: Sonnet — bom equilíbrio para gerar código React/Angular/Vue
  frontend: {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    description: "Sonnet — geração de código frontend com alta qualidade",
  },

  // Backend: Sonnet — APIs, banco, lógica de negócio complexa
  backend: {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    description: "Sonnet — arquitetura backend, queries e segurança",
  },

  // Mobile: Sonnet — código nativo e multiplataforma
  mobile: {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    description: "Sonnet — React Native, Flutter, Swift, Kotlin",
  },

  // QA: Haiku — testes são mais mecânicos, Haiku é suficiente e mais rápido
  qa: {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    description: "Haiku — rápido para gerar casos de teste e planos de QA",
  },

  // DevOps: Sonnet — configs de infra precisam de precisão
  devops: {
    model: "claude-sonnet-4-5",
    max_tokens: 6144,
    description: "Sonnet — Dockerfiles, pipelines CI/CD, Terraform",
  },

  // UX/UI: Haiku — análise de UX e microcopy não precisam do modelo mais pesado
  uxui: {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    description: "Haiku — fluxos UX, acessibilidade e design system",
  },

  // Consolidação final: Opus — síntese de todas as respostas exige o melhor
  consolidation: {
    model: "claude-opus-4-5",
    max_tokens: 8192,
    thinking: { type: "enabled", budget_tokens: 3000 },
    description: "Opus com thinking — síntese e consolidação das respostas dos agentes",
  },

  security: {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    description: "Sonnet — revisão de segurança e AppSec",
  },

  data: {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    description: "Sonnet — dados, SQL e modelagem",
  },

  architect: {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    description: "Sonnet — arquitetura e análise macro",
  },
};

// Retorna o modelo configurado para um agente, com fallback para Sonnet
export function getModelConfig(agentName: string): ModelConfig {
  return (
    AGENT_MODELS[agentName] ?? {
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      description: "Sonnet (fallback padrão)",
    }
  );
}
