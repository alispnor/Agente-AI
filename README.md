# Agents-AI

Sistema multi-agente de desenvolvimento que orquestra 9 especialistas (frontend, backend, QA, DevOps, UX/UI, Mobile, Security, Data, Architect) coordenados por um **Gerente IA** inteligente. O Gerente analisa cada tarefa, aciona os agentes necessarios, valida com QA e salva a memoria do cliente.

Roda via **Docker Compose** em qualquer sistema.

---

## Inicio Rapido

### 1. Clonar e configurar

```bash
git clone <url-do-repositorio> Agents-AI
cd Agents-AI
cp .env.example .env
```

Edite o `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
AGENTS_AI_HOST_PORT=3001
PROJECT_PATH=/home/seu-usuario/projects
```

| Variavel | Descricao |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Chave da API Anthropic (obrigatorio) |
| `AGENTS_AI_HOST_PORT` | Porta no host (default: 3001) |
| `PROJECT_PATH` | Pasta raiz dos seus projetos (montado em `/mnt/projects` no container) |

### 2. Subir com Docker

```bash
docker compose up -d --build
```

Verificar se esta rodando:

```bash
docker compose ps
curl http://localhost:3001/api/health
```

### 3. Verificar status de todos os agentes

Antes de enviar tarefas, verifique se todos os agentes e o Gerente estao operacionais:

```bash
docker compose exec agents-ai node dist/index.js --status
```

Saida esperada:

```
============================================================
  VERIFICAÇÃO DE STATUS — Agentes IA
============================================================
  Testando 10 componentes (9 agentes + gerente)
  Cada agente recebe um ping e deve responder...

  [1/10]  🧠 Gerente IA (manager)...
         ✅ PRONTO (17.4s) — Planejamento funcional, 1 agente(s) no plano
  [2/10]  🤖 frontend...
         ✅ PRONTO (3.3s) — "OK"
  [3/10]  🤖 backend...
         ✅ PRONTO (1.8s) — "OK"
  ...
  [10/10] 🤖 architect...
         ✅ PRONTO (12.6s) — "OK"

  RESULTADO
  ✅ Prontos:    10/10
  🟢 Todos os agentes estão operacionais!
```

O teste roda **um agente por vez** para nao estourar rate limit. Se algum falhar, aparece `❌ FALHA` com o motivo.

---

## Como funciona

```
Voce envia uma tarefa
    |
    v
[1] Gerente IA analisa a tarefa
    -> Pode te fazer perguntas se a tarefa for ambigua
    |
    v
[2] Gerente cria o plano e escolhe os agentes
    Ex: [architect] -> [data] -> [backend] -> [qa]
    |
    v
[3] Agentes executam sequencialmente (com codigo real do projeto)
    |
    v
[4] QA valida (APROVADO / REPROVADO)
    |
    v
[5] Memoria salva em clients/{empresa}/historico.md com data/hora
    |
    v
[6] Resposta final entregue a voce
```

---

## Registrar um cliente

Cada empresa/cliente tem uma pasta de memoria em `clients/{nome}/`. Voce pode registrar um cliente **com ou sem** um projeto existente.

### Com projeto existente (linkando o path)

Se o cliente ja tem um projeto no disco e voce quer que os agentes leiam o codigo:

```bash
docker compose exec agents-ai node dist/index.js --add /mnt/projects/ai-base-template "Guep" "Template base da GuepTech"
```

> O path deve ser relativo ao container: `/mnt/projects/{nome-da-pasta}` (a pasta `PROJECT_PATH` do .env e montada em `/mnt/projects/`).

### Sem projeto (so para criar a pasta de memoria do cliente)

Se o cliente ainda nao tem projeto ou voce quer criar a pasta primeiro para guardar requisitos e documentacao:

```bash
mkdir -p clients/acme
```

Depois, quando o projeto existir, registre normalmente:

```bash
docker compose exec agents-ai node dist/index.js --add /mnt/projects/projeto-acme "Acme" "Sistema de gestao da Acme Corp"
```

### Verificar clientes/projetos registrados

```bash
docker compose exec agents-ai node dist/index.js --list
```

Saida:

```
ID             NOME    CAMINHO                            TAREFAS
-------------------------------------------------------------------------
1775760431332  Guep    /mnt/projects/ai-base-template           1
```

---

## Enviar tarefas para o Gerente IA

### Formato basico

```bash
docker compose exec agents-ai node dist/index.js --run "<tarefa>" <NomeCliente>
```

O `<NomeCliente>` vincula a tarefa ao projeto registrado. O Gerente recebe o codigo, planeja, aciona os agentes e o QA valida no final.

### Exemplos de tarefas

```bash
# Analise completa
docker compose exec agents-ai node dist/index.js --run \
  "Analise completa do projeto: arquitetura, seguranca, performance e banco de dados." Guep

# Criar modulo novo
docker compose exec agents-ai node dist/index.js --run \
  "Criar modulo de gestao de usuarios com CRUD. Backend: novas rotas /api/private/usuario com Sequelize model. Frontend: modulo Angular com listagem e formulario. Seguir padroes do modulo chamado." Guep

# Corrigir bug
docker compose exec agents-ai node dist/index.js --run \
  "O cron AutobemCron trava quando a API externa demora mais de 30s. Implementar timeout e retry." Guep

# Auditoria de seguranca
docker compose exec agents-ai node dist/index.js --run \
  "Auditoria de seguranca: OWASP Top 10, validacao de inputs, SQL injection, headers, dados sensiveis." Guep

# Criar projeto novo baseado no template
docker compose exec agents-ai node dist/index.js --run \
  "Planejar novo projeto de gestao de contratos baseado no template. Definir models, rotas, modulos Angular e schema do banco. Manter padroes existentes (Keycloak, S3, Sequelize, Material)." Guep

# Otimizar banco de dados
docker compose exec agents-ai node dist/index.js --run \
  "Analisar queries, verificar indices faltantes e sugerir otimizacoes no Sequelize." Guep
```

### Dicas para escrever boas tarefas

1. **Seja especifico** — "criar endpoint /api/private/contrato com validacao de CNPJ" e melhor que "melhorar backend"
2. **Mencione padroes** — "seguir padrao do modulo chamado" ajuda os agentes
3. **Indique arquivos** — "modificar ChamadoController.ts para adicionar filtro" e mais eficiente
4. **Defina criterios** — "completo quando: tiver testes, validacao e doc Swagger"

---

## Falar direto com um agente

Para pular o Gerente e falar com um especialista:

```bash
docker compose exec agents-ai node dist/index.js --agent <nome> "<tarefa>" --path /mnt/projects/<projeto>
```

### Exemplos

```bash
# Backend
docker compose exec agents-ai node dist/index.js --agent backend \
  "Criar endpoint /api/private/contrato com CRUD Sequelize" --path /mnt/projects/ai-base-template

# Seguranca
docker compose exec agents-ai node dist/index.js --agent security \
  "Auditar autenticacao Keycloak e verificar vulnerabilidades" --path /mnt/projects/ai-base-template

# Banco de dados
docker compose exec agents-ai node dist/index.js --agent data \
  "Otimizar queries e criar indices faltantes" --path /mnt/projects/ai-base-template

# Arquiteto
docker compose exec agents-ai node dist/index.js --agent architect \
  "Analisar arquitetura e propor melhorias de escalabilidade" --path /mnt/projects/ai-base-template

# Frontend
docker compose exec agents-ai node dist/index.js --agent frontend \
  "Criar componente Angular de dashboard com Material" --path /mnt/projects/ai-base-template

# QA
docker compose exec agents-ai node dist/index.js --agent qa \
  "Criar plano de testes E2E para abertura de chamado" --path /mnt/projects/ai-base-template
```

### Agentes disponiveis

| Agente | Especialidade |
|--------|---------------|
| `frontend` | React, Angular, Vue, Next.js, TailwindCSS, acessibilidade |
| `backend` | Node/Express, Laravel, FastAPI, Sequelize, APIs REST/GraphQL |
| `qa` | Testes automatizados, E2E, Cypress, Playwright, validacao |
| `devops` | CI/CD, Docker, Kubernetes, Terraform, cloud (AWS/GCP/Azure) |
| `uxui` | Design system, wireframes, acessibilidade, UX research |
| `mobile` | React Native, Flutter, Swift, Kotlin |
| `security` | OWASP, auditoria, compliance (LGPD/GDPR), AppSec, pentest |
| `data` | SQL/NoSQL, tuning, modelagem, migrations, ETL, data pipelines |
| `architect` | Arquitetura, escalabilidade, design patterns, divida tecnica |

---

## Usar via API HTTP

O servidor sobe automaticamente com Docker na porta configurada.

```bash
# Health check
curl http://localhost:3001/api/health

# Listar projetos
curl http://localhost:3001/api/projects

# Registrar projeto
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"caminho":"/mnt/projects/ai-base-template","nome":"Guep","descricao":"Template GuepTech"}'

# Enviar tarefa
curl -X POST http://localhost:3001/api/run \
  -H "Content-Type: application/json" \
  -d '{"tarefa":"Analise de seguranca do middleware Keycloak","projetoId":"<ID>"}'

# Historico
curl http://localhost:3001/api/history

# Relatorios
curl http://localhost:3001/api/reports
```

A interface web tambem esta disponivel em `http://localhost:3001`.

---

## Onde ficam os resultados

| O que | No host (persistente) | No container |
|-------|----------------------|--------------|
| Memoria dos clientes | `./clients/{empresa}/` | `/app/clients/` |
| Registro de projetos | `./data/projects.json` | `/app/data/` |
| Historico (JSON) | `./data/history/` | `/app/data/history/` |
| Relatorios (.txt) | `./reports/` | `/app/reports/` |
| Aprendizado do Gerente | `./AUTO_EVOLUTION.md` | `/app/AUTO_EVOLUTION.md` |
| Projetos dos clientes | `$PROJECT_PATH` | `/mnt/projects/` (leitura) |

Estrutura da pasta de memoria de um cliente:

```
clients/guep/
  ├── historico.md          — Log de todas as tarefas com data/hora
  ├── learn.md              — Guia de uso especifico do cliente
  ├── analise-projeto.md    — Analise do projeto base
  ├── requisitos.md         — Requisitos e regras de negocio
  ├── stack-tecnologica.md  — Stack com versoes
  ├── schema-banco.md       — Schema do banco de dados
  ├── endpoints-api.md      — Endpoints da API
  └── arquitetura.md        — Arquitetura e deploy
```

---

## Cheat Sheet

```bash
# ── Docker ──
docker compose up -d --build          # Subir/rebuild
docker compose down                   # Parar
docker compose logs -f                # Logs
docker compose ps                     # Status

# ── Verificar agentes ──
docker compose exec agents-ai node dist/index.js --status             # Testar todos (um por um)

# ── Clientes ──
docker compose exec agents-ai node dist/index.js --list                    # Listar
docker compose exec agents-ai node dist/index.js --add /mnt/projects/projeto "Nome" "Desc"  # Registrar

# ── Tarefas ──
docker compose exec agents-ai node dist/index.js --run "Tarefa" NomeCliente          # Via Gerente
docker compose exec agents-ai node dist/index.js --agent backend "Tarefa" --path /mnt/projects/x  # Direto

# ── Agentes ──
docker compose exec agents-ai node dist/index.js --agents              # Listar agentes

# ── Relatorios ──
docker compose exec agents-ai node dist/index.js --report NomeCliente  # Relatorio do cliente
docker compose exec agents-ai node dist/index.js --report-all          # Relatorio geral

# ── API ──
curl http://localhost:3001/api/health
curl http://localhost:3001/api/projects
curl http://localhost:3001/api/history
```

---

## Docker Compose — Volumes

```yaml
volumes:
  - ./data:/app/data              # Projetos registrados + historico JSON
  - ./reports:/app/reports        # Relatorios de execucao (.txt)
  - ./clients:/app/clients        # Memorias por cliente (persistente)
  - ${PROJECT_PATH}:/mnt/projects # Projetos dos clientes (somente leitura)
```

Tudo em `./data`, `./reports` e `./clients` persiste no host e sobrevive a rebuilds.

---

## Desenvolvimento local (sem Docker)

```bash
npm install
npm run build
npm start             # Servidor na porta 3000
npm run cli           # CLI

# Ou em modo desenvolvimento (hot reload)
npm run dev           # Servidor
npm run dev:cli       # CLI
```

---

## Como adicionar um novo agente

1. Crie `src/agents/meuAgenteAgent.ts` com `export default async function(tarefa, contextoArquivos)` e o system prompt
2. Em `src/orchestrator/orchestrator.ts`, importe e adicione a `this.agentes`
3. Em `src/manager/managerAgent.ts`, adicione na lista "SUA EQUIPE DE ESPECIALISTAS"
4. Em `src/types/index.ts`, adicione o nome ao tipo `AgentName`
5. Se tiver extensoes de arquivo especificas, adicione em `AGENT_EXTENSIONS` em `src/project/projectReader.ts`

---

## Estrutura do repositorio

```
src/
  agents/           — 9 agentes especialistas (.ts)
  manager/          — Gerente IA (planejamento + consolidacao)
  orchestrator/     — Orquestracao e fluxo completo
  project/          — Leitura de disco e registro de projetos
  history/          — Historico e geracao de relatorios
  types/            — Tipos e interfaces TypeScript
  utils/            — callClaude (API Anthropic com retry/backoff)
  server.ts         — Servidor HTTP + API REST
  index.ts          — CLI
clients/            — Memorias e docs por cliente (persistente)
data/               — Registro de projetos + historico JSON
reports/            — Relatorios gerados (.txt)
public/             — Interface web (SPA)
```

## Modelo LLM

Modelo: `claude-sonnet-4-20250514` (definido em `src/utils/callClaude.ts`).
Execucao sequencial com exponential backoff para respeitar rate limits da API.
