// ── Projeto ──────────────────────────────────────────────────
export interface Project {
  id: string;
  nome: string;
  caminho: string;
  descricao: string;
  registradoEm: string;
  totalTarefas: number;
}

export interface ProjectsFile {
  projects: Project[];
}

// ── Agentes ──────────────────────────────────────────────────
export type AgentName = 'frontend' | 'backend' | 'qa' | 'devops' | 'uxui' | 'mobile' | 'security' | 'data' | 'architect';
export type AgentResults = Partial<Record<AgentName, string>>;

export interface AgentExtensions {
  frontend: readonly string[];
  backend: readonly string[];
  qa: readonly string[];
  devops: readonly string[];
  uxui: readonly string[];
  mobile: readonly string[];
  security: readonly string[];
  data: readonly string[];
  architect: readonly string[];
}

// ── Manager / Plano ──────────────────────────────────────────
export interface TaskPlan {
  analise: string;
  agentes_necessarios: AgentName[];
  subtarefas: Partial<Record<AgentName, string>>;
  ordem_execucao?: AgentName[][];
  dependencias: string | null;
  riscos: string | null;
  criterios_aceitacao?: string;
  cliente?: string;
  diretorio_trabalho?: string;
  relatorio_aprendizado?: Record<string, string>;
}

// ── Esclarecimento do Manager ───────────────────────────────
export interface ClarificationRequest {
  status: "precisa_esclarecimento";
  analise_parcial: string;
  perguntas: string[];
}

export type ManagerResponse =
  | (TaskPlan & { status: "pronto" })
  | ClarificationRequest;

// ── Execução / Histórico ─────────────────────────────────────
export interface Execution {
  id: string;
  projetoId: string;
  projetoNome: string;
  tarefa: string;
  executadoEm: string;
  duracaoMs: number | null;
  plano: TaskPlan;
  agentesUsados: AgentName[];
  resultadosPorAgente: AgentResults;
  respostaFinal: string;
}

// ── Contexto de Projeto ──────────────────────────────────────
export interface ProjectContext {
  caminho: string;
  estrutura: string;
  dependencias: string;
  arquivosRelevantes: string;
}

// ── Callback para perguntas do Manager ──────────────────────
export type AskUserFn = (perguntas: string[]) => Promise<string>;

// ── Opções do Orquestrador ───────────────────────────────────
export interface OrchestratorOptions {
  modo?: "paralelo" | "sequencial";
  verbose?: boolean;
  projeto?: Project | null | undefined;
  salvarHistorico?: boolean;
  perguntarUsuario?: AskUserFn;
  maxEsclarecimentos?: number;
}

export interface OrchestratorResult {
  plano: TaskPlan;
  resultados: AgentResults;
  respostaFinal: string;
  caminhoRelatorio: string;
  duracaoMs: number;
}

// ── API ──────────────────────────────────────────────────────
export interface ApiRunBody {
  tarefa: string;
  projetoId?: string;
  modo?: "paralelo" | "sequencial";
  respostas_esclarecimento?: string;
  sessao_id?: string;
}

export interface ApiProjectBody {
  caminho: string;
  nome: string;
  descricao?: string;
}

export interface ReportFile {
  nome: string;
  caminho: string;
  tamanhoKb: number;
  criadoEm: string;
}

// ── Anthropic API ────────────────────────────────────────────
export type AnthropicRole = "user" | "assistant";

export interface AnthropicMessage {
  role: AnthropicRole;
  content: string;
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: AnthropicMessage[];
}

export interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}
