# PROMPT PARA O CURSOR

Abra o projeto em ~/projects/Agente-AI e cole no chat (CMD+L):

---

Analise TODOS os arquivos do projeto atual em ~/projects/Agente-AI.
Leia cada arquivo existente, avalie se está correto e funcional, otimize o que precisar,
e depois adicione os novos recursos abaixo. NÃO apague arquivos existentes — apenas corrija e expanda.

---

## PARTE 1 — ANÁLISE E CORREÇÃO DO PROJETO EXISTENTE

Leia e avalie cada arquivo. Corrija os seguintes problemas comuns se existirem:

**src/utils/callClaude.js**
- Verificar se usa `fetch` nativo do Node 18+
- Verificar se o modelo é `claude-sonnet-4-20250514`
- Verificar se `max_tokens` está em 8192
- Adicionar retry automático (3 tentativas com backoff de 1s, 2s, 4s) para erros 529 (overloaded) e 500
- Adicionar log de tempo de resposta

**src/project/projectReader.js**
- Verificar se `lerEstruturaProjeto` funciona corretamente com recursão e profundidade
- Verificar se `IGNORED_DIRS` está completo (adicionar: `.turbo`, `.vercel`, `.nx`, `__tests__` se faltar)
- Verificar se Dockerfile e Makefile são tratados como nomes exatos (não só extensão)
- Verificar se `lerArquivosRelevantes` tem try/catch por arquivo
- Verificar se `gerarContextoProjeto` verifica `existsSync`

**src/project/projectRegistry.js**
- Verificar resolução de caminho via `fileURLToPath` + `import.meta.url`
- Verificar se `buscarProjeto` busca por id exato E nome parcial case-insensitive
- Se alguma função estiver faltando, criar

**src/history/historyManager.js**
- Verificar se a pasta `data/history/` é criada automaticamente se não existir
- Verificar se `salvarExecucao` aceita `duracaoMs`

**src/history/reportGenerator.js**
- Verificar se `salvarRelatorio` cria a pasta `reports/` com `mkdirSync recursive`

**src/manager/managerAgent.js**
- Verificar se o JSON de retorno é parseado com fallback (remover markdown fences)
- Verificar se `consolidarResultados` está exportado como named export

**src/agents/*.js (todos os 5 agentes)**
- Verificar se todos têm o parâmetro `contextoArquivos = ""`
- Verificar se todos constroem a mensagem com o contexto antes da tarefa
- Verificar se todos têm a seção "QUANDO RECEBER CÓDIGO EXISTENTE" no system prompt

**src/orchestrator/orchestrator.js**
- Verificar se gera `contextoGeral` (estrutura + deps) ANTES do manager
- Verificar se gera `contextosPorAgente` DEPOIS do plano (apenas para agentes necessários)
- Verificar se mede `duracaoMs` e passa para `salvarExecucao`
- Verificar se `caminhoRelatorio` é retornado

**src/index.js**
- Verificar se o parser de args lida com nomes entre aspas corretamente
- Verificar se `mkdirSync` cria as pastas necessárias no início
- Verificar se o carregamento do `.env` está no topo antes de tudo

---

## PARTE 2 — ADICIONAR DOCKER

### Crie: Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json .

COPY . .

RUN mkdir -p data/history reports

EXPOSE 3000

CMD ["node", "src/server.js"]
```

### Crie: docker-compose.yml

```yaml
version: "3.9"

services:
  agents-ai:
    build: .
    container_name: agents-ai
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
      - ./reports:/app/reports
      - ${PROJECT_PATH:-/tmp}:/mnt/projects:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  data:
  reports:
```

**Importante:** o volume `PROJECT_PATH` permite montar projetos externos dentro do container em `/mnt/projects`.
No `.env.example`, adicionar:
```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
PROJECT_PATH=/home/seu-usuario/projetos
```

---

## PARTE 3 — SERVIDOR HTTP: src/server.js

Crie `src/server.js` usando apenas `node:http` nativo (sem express, sem fastify).
Este servidor serve o frontend HTML e expõe uma API REST para o frontend controlar os agentes.

### Rotas da API:

**GET /api/health**
```json
{ "status": "ok", "timestamp": "ISO date" }
```

**GET /api/projects**
- Chama `listarProjetos()` mas retorna JSON array (não string formatada)
- Retorna: `[{ id, nome, caminho, descricao, totalTarefas, registradoEm }]`

**POST /api/projects**
- Body JSON: `{ caminho, nome, descricao }`
- Chama `registrarProjeto(nome, caminho, descricao)`
- Retorna o projeto criado com status 201

**DELETE /api/projects/:id**
- Remove projeto do registry pelo id
- Retorna `{ success: true }`

**POST /api/run**
- Body JSON: `{ tarefa, projetoId?, modo? }`
- Se `projetoId` fornecido, busca o projeto
- Chama `orquestrador.processarTarefa(tarefa, { projeto, modo: modo || "paralelo" })`
- Retorna `{ plano, respostaFinal, caminhoRelatorio, duracaoMs }`
- Timeout de 5 minutos

**GET /api/history**
- Query param opcional: `?projetoId=xxx`
- Se projetoId: `carregarHistoricoProjeto(projetoId)`
- Senão: `carregarTodoHistorico()`
- Retorna array JSON (máximo 50 registros)

**GET /api/history/:id**
- Busca execução específica pelo id do arquivo
- Lê o arquivo `data/history/*_{id}.json` correspondente
- Retorna o objeto completo

**GET /api/reports**
- Lista arquivos em `reports/` com nome e data
- Retorna `[{ nome, caminho, tamanhoKb, criadoEm }]`

**GET / (e qualquer rota não-API)**
- Serve o arquivo `public/index.html`

**Implementação do servidor:**
- Parse de JSON no body com `req.on('data')` + `req.on('end')`
- CORS headers para desenvolvimento: `Access-Control-Allow-Origin: *`
- Tratar OPTIONS para preflight
- Roteamento simples por `req.method` + `req.url` com `URL` nativo
- Tratar erros com try/catch e retornar `{ error: mensagem }` com status 500
- Logar cada requisição: método, rota, status, tempo em ms
- Porta: `process.env.PORT || 3000`
- Ao iniciar: verificar `ANTHROPIC_API_KEY`, criar pastas necessárias, log da porta

---

## PARTE 4 — FRONTEND HTML: public/index.html

Crie a pasta `public/` e dentro dela o arquivo `index.html` — um SPA completo em HTML + CSS + JavaScript puro (sem frameworks, sem bundler, sem CDN externo).

### Design e estrutura visual:

**Layout geral:** sidebar esquerda fixa (260px) + área principal. Fundo escuro `#0d1117`, cards em `#161b22`, bordas `#30363d`. Fonte: system-ui. Completamente responsivo (no mobile, sidebar some e aparece hamburguer).

**Sidebar:**
- Logo "Agents AI" no topo com ícone ⚡
- Menu de navegação com 4 seções:
  - 🚀 Nova Tarefa
  - 📁 Projetos
  - 📜 Histórico
  - 📊 Relatórios
- Status no rodapé: indicador verde/vermelho de conexão com o servidor (faz ping em /api/health a cada 10s)

---

### SEÇÃO 1 — Nova Tarefa (`#view-task`)

**Formulário principal:**

```
┌─────────────────────────────────────────┐
│  Projeto (opcional)                      │
│  [Dropdown com projetos cadastrados ▼]   │
├─────────────────────────────────────────┤
│  Descreva a tarefa                       │
│  [Textarea grande - 6 linhas]            │
├─────────────────────────────────────────┤
│  Modo de execução                        │
│  ○ Paralelo (mais rápido)               │
│  ○ Sequencial (mais controlado)         │
├─────────────────────────────────────────┤
│  [▶ Executar Tarefa]                     │
└─────────────────────────────────────────┘
```

**Painel de progresso (aparece durante execução):**
- Barra de progresso animada
- Log em tempo real mostrando cada agente que foi ativado
- Lista de agentes com status: ⏳ aguardando / 🔄 executando / ✅ concluído
- Tempo decorrido em segundos (atualiza a cada segundo)

**Painel de resultado (aparece após execução):**
- Card com a resposta final consolidada (renderizar markdown básico: `**bold**`, `# heading`, ` ```code``` `)
- Seção colapsável "Ver resposta de cada agente" com tabs: Frontend | Backend | QA | DevOps | UX/UI
- Botão "💾 Baixar Relatório" que abre o relatório .txt
- Botão "🔁 Nova Tarefa" que limpa o formulário

---

### SEÇÃO 2 — Projetos (`#view-projects`)

**Header com botão "＋ Cadastrar Projeto"**

**Lista de projetos cadastrados** (cards em grid 2 colunas):
```
┌──────────────────────────────┐
│  📁 Nome do Projeto          │
│  /caminho/do/projeto         │
│  Descrição curta...          │
│                              │
│  3 tarefas executadas        │
│  Cadastrado em: 01/01/2024   │
│                              │
│  [▶ Usar]  [🗑 Remover]      │
└──────────────────────────────┘
```
- Botão "▶ Usar" navega para "Nova Tarefa" com este projeto já selecionado
- Botão "Remover" pede confirmação inline (não alert nativo)

**Modal "Cadastrar Projeto":**
```
┌─────────────────────────────────┐
│  Cadastrar Projeto         [×]  │
├─────────────────────────────────┤
│  Caminho do projeto             │
│  [/home/usuario/meu-projeto   ] │
│                                 │
│  Nome                           │
│  [Meu Projeto                 ] │
│                                 │
│  Descrição (opcional)           │
│  [App de ecommerce em React   ] │
│                                 │
│  [Cancelar]  [Cadastrar ✓]      │
└─────────────────────────────────┘
```
- Validação: caminho não pode ser vazio; nome não pode ser vazio
- Feedback visual de erro inline (borda vermelha + mensagem)
- Após cadastro: fechar modal e atualizar lista

---

### SEÇÃO 3 — Histórico (`#view-history`)

**Filtro por projeto:** dropdown para filtrar

**Tabela de execuções:**
```
Data/hora       Projeto         Tarefa                  Agentes    Duração
01/01 14:32     Meu App         Corrigir bug no login   3          47s
01/01 13:10     Meu App         Adicionar paginação     5          1m23s
```
- Linhas clicáveis: ao clicar, abre painel lateral com o detalhe completo da execução
- Painel lateral (drawer da direita): mostra resposta final + resposta de cada agente em tabs
- Badge colorido por número de agentes usados

---

### SEÇÃO 4 — Relatórios (`#view-reports`)

**Lista de arquivos .txt gerados:**
```
📄 meu-app_execucao_2024-01-15.txt     12 KB    15/01 14:32    [⬇ Baixar]
📄 meu-app_execucao_2024-01-14.txt      8 KB    14/01 09:15    [⬇ Baixar]
```
- Botão "⬇ Baixar" faz download do .txt via fetch + blob

---

### JavaScript do frontend (dentro do index.html em `<script>`):

**Arquitetura:**
- `const API = ''` (URL relativa, funciona tanto local quanto em Docker)
- Estado global simples: `const state = { view: 'task', projects: [], history: [], reports: [], selectedProject: null }`
- Função `navigate(view)` que troca a seção visível
- Função `api(path, method, body)` — wrapper de fetch com tratamento de erro e Content-Type JSON

**Inicialização:**
- `document.addEventListener('DOMContentLoaded', init)`
- `init()`: checar health, carregar projetos, carregar histórico, renderizar tudo

**Execução de tarefa — fluxo com feedback visual:**
```js
async function executarTarefa() {
  // 1. Mostrar painel de progresso
  // 2. Iniciar timer visual (setInterval 1s)
  // 3. Chamar POST /api/run
  // 4. Durante a espera, animar os agentes no painel
  // 5. Ao receber resposta: parar timer, mostrar resultado
  // 6. Renderizar markdown básico na resposta
}
```

**Renderizador de markdown básico:**
```js
function renderMarkdown(text) {
  return text
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
}
```

**CSS completo dentro do `<style>`:**
- Variáveis CSS: `--bg: #0d1117`, `--surface: #161b22`, `--border: #30363d`, `--text: #e6edf3`, `--muted: #8b949e`, `--accent: #58a6ff`, `--success: #3fb950`, `--danger: #f85149`, `--warning: #d29922`
- Reset básico: box-sizing, margin 0
- Sidebar: `position: fixed`, scrollável, transição suave
- Cards com `border-radius: 8px`, hover com `border-color: var(--accent)`
- Botão primário: `background: var(--accent)`, `color: #000`
- Animação de progresso: `@keyframes pulse` e `@keyframes spin`
- Tabs: underline no ativo, transição de cor
- Modal: overlay escuro + card centralizado com animação `fadeIn`
- Scrollbar customizada: `width: 6px`, `background: var(--border)`
- Responsivo: `@media (max-width: 768px)` — sidebar oculta com toggle hamburguer

---

## PARTE 5 — ATUALIZAR package.json

Atualize os scripts:
```json
{
  "scripts": {
    "start": "node src/server.js",
    "server": "node src/server.js",
    "cli": "node src/index.js",
    "dev": "node --watch src/server.js",
    "docker:build": "docker build -t agents-ai .",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",
    "docker:logs": "docker compose logs -f"
  }
}
```

---

## PARTE 6 — ATUALIZAR .env.example

```
# Chave da API Anthropic (obrigatório)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx

# Porta do servidor web (padrão: 3000)
PORT=3000

# Caminho base para projetos externos (usado no Docker)
# No Docker, os projetos dentro deste caminho ficam acessíveis em /mnt/projects
PROJECT_PATH=/home/seu-usuario/projetos
```

---

## PARTE 7 — ATUALIZAR README.md

Adicione as seguintes seções ao README existente:

### Interface Web
```bash
# Iniciar o servidor web
node src/server.js

# Ou com recarga automática
node --watch src/server.js

# Acesse no navegador:
# http://localhost:3000
```

### Docker
```bash
# Copiar e configurar .env
cp .env.example .env
# Edite o .env com sua ANTHROPIC_API_KEY

# Subir com Docker Compose
docker compose up -d

# Ver logs
docker compose logs -f

# Parar
docker compose down
```

### Nota sobre projetos no Docker
Ao usar Docker, defina `PROJECT_PATH` no `.env` com o diretório raiz dos seus projetos.
Eles serão montados em `/mnt/projects` dentro do container (somente leitura).
Ao cadastrar um projeto pelo frontend no Docker, use o caminho `/mnt/projects/nome-do-projeto`.

---

## INSTRUÇÕES FINAIS PARA O CURSOR

1. Leia cada arquivo existente do projeto antes de modificar
2. Corrija os problemas encontrados na Parte 1
3. Crie os novos arquivos das Partes 2, 3 e 4
4. Atualize os arquivos existentes das Partes 5, 6 e 7
5. Garanta que `src/server.js` e `src/index.js` podem coexistir (server.js importa as mesmas funções do orchestrator, registry, history)
6. O frontend em `public/index.html` deve ser COMPLETO — com HTML, CSS e JS tudo dentro do mesmo arquivo
7. Teste mental: ao rodar `node src/server.js`, deve subir na porta 3000 e servir o HTML em `/`
8. Crie todos os arquivos agora com conteúdo completo e funcional