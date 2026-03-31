# Agents-AI

Sistema multi-agente de desenvolvimento que orquestra especialistas (frontend, backend, QA, DevOps, UX/UI) através de um gestor/planeador, com leitura opcional de projetos reais no disco, histórico de execuções e relatórios em texto.

## Requisitos

- Node.js 18 ou superior
- Chave de API Anthropic (`ANTHROPIC_API_KEY`)

## Instalação

```bash
git clone <url-do-repositorio> Agents-AI
cd Agents-AI
cp .env.example .env
# Edite .env e adicione a sua ANTHROPIC_API_KEY
```

O código-fonte está em **TypeScript** (`src/`). Após `npm install`, compile com `npm run build` (saída em `dist/`). Em desenvolvimento pode usar `npm run dev` (tsx) sem compilar.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm start` ou `node dist/server.js` | Inicia o servidor web (UI + API na porta `PORT` ou 3000) |
| `npm run cli` ou `node dist/index.js` | CLI: sem argumentos executa a tarefa de exemplo (upload de avatar) |
| `node dist/index.js --list` | Lista todos os projetos cadastrados |
| `node dist/index.js --add <caminho> "<nome>" "<desc>"` | Cadastra um projeto existente no disco |
| `node dist/index.js --run "<tarefa>" [projeto]` | Executa uma tarefa (com ou sem projeto vinculado) |
| `node dist/index.js --report <projeto>` | Gera relatório completo do histórico do projeto |
| `node dist/index.js --report-all` | Relatório geral de todos os projetos e execuções |

Scripts no `package.json`:

- `npm run build` / `npm run build:watch` — compilação TypeScript (`tsc`)
- `npm run typecheck` — verificação de tipos sem emitir ficheiros
- `npm run start` / `npm run server` — `node dist/server.js`
- `npm run cli` — `node dist/index.js`
- `npm run dev` — `tsx watch src/server.ts`
- `npm run dev:cli` — `tsx watch src/index.ts`
- `npm run list` — `--list`
- `npm run report` — `node dist/index.js --report` (passe o projeto como argumento extra)
- `npm run docker:build`, `docker:up`, `docker:down`, `docker:logs` — Docker

## Interface Web

```bash
npm run build
npm start

# ou em desenvolvimento (sem build prévio)
npm run dev

# Acesse no navegador:
# http://localhost:3000
```

A interface em `public/index.html` permite cadastrar projetos, executar tarefas, consultar histórico e descarregar relatórios `.txt`.

## Docker

```bash
# Copiar e configurar .env
cp .env.example .env
# Edite o .env com sua ANTHROPIC_API_KEY

# Subir com Docker Compose
docker compose up -d

# Ver logs


# Parar
docker compose down
```

### Nota sobre projetos no Docker

Ao usar Docker, defina `PROJECT_PATH` no `.env` com o diretório raiz dos seus projetos. Eles serão montados em `/mnt/projects` dentro do container (somente leitura). Ao cadastrar um projeto pelo frontend no Docker, use o caminho `/mnt/projects/nome-do-projeto`.

## Exemplos de uso

```bash
# 1. Cadastre um projeto existente
node dist/index.js --add /Users/joao/projetos/meu-ecommerce "Meu Ecommerce" "Loja online React + Node"

# 2. Corrigir um bug com contexto do projeto
node dist/index.js --run "Corrigir o erro de CORS na rota /api/checkout" "Meu Ecommerce"

# 3. Nova feature — os agentes leem ficheiros relevantes por especialidade
node dist/index.js --run "Adicionar filtro por categoria na listagem de produtos" "Meu Ecommerce"

# 4. Análise geral
node dist/index.js --run "Faça uma análise de segurança e performance do projeto" "Meu Ecommerce"

# 5. Histórico e relatório do projeto
node dist/index.js --report "Meu Ecommerce"
```

## O que cada agente faz ao receber código real

- Analisa padrões e stack já usados no projeto
- Mantém consistência com o estilo de código existente
- Indica ficheiros concretos a criar ou alterar
- Aponta problemas no código atual quando forem relevantes para a tarefa

## Histórico e relatórios

- Cada execução com projeto vinculado garda um JSON em `data/history/` com tarefa, plano do gestor, respostas por agente, resposta consolidada, duração e data.
- Relatórios legíveis em `.txt` são escritos em `reports/`.
- O registo de projetos está em `data/projects.json`.

## Como adicionar um novo agente

1. Crie `src/agents/meuAgenteAgent.js` com `export default async function(tarefa, contextoArquivos = "")` e o system prompt adequado (inclua a secção “QUANDO RECEBER CÓDIGO EXISTENTE” como nos agentes existentes).
2. Em `src/orchestrator/orchestrator.js`, importe o agente e acrescente-o a `this.agentes` com uma chave única (ex.: `meuAgente`).
3. Atualize o system prompt em `src/manager/managerAgent.js` na lista “SUA EQUIPE” e as regras, para o gestor poder planear o uso do novo papel.
4. Se o novo papel tiver extensões de ficheiro específicas, acrescente-as em `AGENT_EXTENSIONS` em `src/project/projectReader.js`.

## Estrutura do repositório

- `src/agents/` — agentes especialistas (`.ts`)
- `src/manager/` — gestor (planeamento em JSON + consolidação)
- `src/orchestrator/` — orquestração e fluxo completo
- `src/types/` — tipos e interfaces partilhados
- `src/server.ts` — servidor HTTP (`node:http`) + API REST + ficheiro estático `public/index.html`
- `src/loadEnv.ts` — carregamento do ficheiro `.env`
- `src/index.ts` — interface de linha de comandos (CLI)
- `src/project/` — leitura de disco e registo de projetos
- `src/history/` — histórico e geração de relatórios
- `src/utils/callClaude.ts` — chamada à API Anthropic (retentativas em 529/500)
- `src/tasks/examples.ts` — tarefas de exemplo
- `public/` — interface web (SPA em HTML/CSS/JS)
- `dist/` — JavaScript emitido pelo `tsc` (não editar manualmente)

## Modelo LLM

O modelo predefinido é `claude-sonnet-4-20250514`, definido em `src/utils/callClaude.js`. Se a sua conta usar outro identificador de modelo, altere-o nesse ficheiro.
