# Agents-AI

Sistema multi-agente de desenvolvimento que orquestra especialistas (frontend, backend, QA, DevOps, UX/UI, Security, Data Analyst, Architect) através de um gestor/planeador inteligente, com leitura opcional de projetos reais no disco, histórico de execuções e relatórios em texto.

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
| `node dist/index.js --agents` | Lista todos os agentes disponíveis |
| `node dist/index.js --agent security "<tarefa>"` | Executa tarefa diretamente com o agente de segurança |
| `node dist/index.js --agent data "<tarefa>"` | Executa tarefa diretamente com o agente analista de dados |
| `node dist/index.js --agent architect "<tarefa>"` | Executa tarefa diretamente com o agente arquiteto |

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

# Acesse no navegador (ou a porta definida em PORT no .env):
# http://localhost:3000
```

A interface em `public/index.html` permite cadastrar projetos, executar tarefas, consultar histórico e descarregar relatórios `.txt`.

## Docker

```bash
# Copiar e configurar .env
cp .env.example .env
# Edite o .env com sua ANTHROPIC_API_KEY
# Opcional: AGENTS_AI_HOST_PORT (porta no host; predefinido 3001 para não colidir com outra app na 3000)

# Subir com Docker Compose
docker compose up -d

# Interface no navegador (predefinido host 3001):
# http://localhost:3001

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

# 5. Auditoria de segurança completa (aciona o agente security automaticamente)
node dist/index.js --run "Auditoria de segurança: verificar vulnerabilidades OWASP, autenticação e dados sensíveis" "Meu Ecommerce"

# 6. Agente security direto num projeto
node dist/index.js --agent security "Analisar vulnerabilidades e sugerir correções" --path /Users/joao/projetos/meu-ecommerce

# 7. Otimização de banco de dados (aciona o agente data automaticamente)
node dist/index.js --run "Otimizar queries lentas e criar índices faltantes" "Meu Ecommerce"

# 8. Agente data direto — modelagem de schema
node dist/index.js --agent data "Modelar schema para sistema de pedidos com particionamento por data" --path /Users/joao/projetos/meu-ecommerce

# 9. Revisão arquitetural completa (aciona architect + data + security)
node dist/index.js --run "Revisar arquitetura, identificar gargalos e propor melhorias" "Meu Ecommerce"

# 10. Agente architect direto num projeto
node dist/index.js --agent architect "Analisar escalabilidade e dívida técnica" --path /Users/joao/projetos/meu-ecommerce

# 11. Histórico e relatório do projeto
node dist/index.js --report "Meu Ecommerce"
```

## Agente Arquiteto de Software (Architect)

O agente `architect` atua como **Arquiteto de Software Sênior** com foco em Engenharia de Dados. Trabalha subordinado ao Gerente de IA, alinhando sugestões técnicas aos objetivos de negócio.

### O que o agente faz

- **Análise de projetos**: revisa arquiteturas existentes em busca de gargalos, dívida técnica e falhas de segurança
- **Propostas de melhorias**: refatorações específicas para otimizar performance de sistemas SQL e NoSQL
- **Escalabilidade**: avalia se o sistema aguenta 10x o tráfego atual e propõe melhorias
- **Design patterns**: microservices, CQRS, event sourcing, hexagonal architecture, clean architecture, saga pattern, outbox pattern
- **Cloud**: AWS, GCP, Azure — decisões de serviços, custos, resiliência
- **Observabilidade**: logs estruturados, métricas (USE/RED), tracing distribuído (OpenTelemetry)

### Tecnologias que domina

| Categoria | Tecnologias |
| --- | --- |
| Linguagens | Python, Node.js/TypeScript, Go, SQL |
| SQL | PostgreSQL, MySQL, SQL Server |
| NoSQL | MongoDB, Redis, DynamoDB, Elasticsearch |
| Cloud | AWS (RDS, Aurora, Lambda, ECS/EKS), GCP (BigQuery, Cloud Run, GKE), Azure (Cosmos DB, AKS) |
| IaC | Terraform, Pulumi, CloudFormation |
| Patterns | Microservices, CQRS, Event Sourcing, Hexagonal, Clean Architecture, Saga, Circuit Breaker |

### Design Patterns aplicados

**Arquiteturais**: Microservices, Event-Driven, Hexagonal (Ports & Adapters), Clean Architecture, Modular Monolith

**De Dados**: Repository, Unit of Work, CQRS, Event Sourcing, Saga, Outbox, CDC

**De Resiliência**: Circuit Breaker, Retry com backoff, Bulkhead, Rate Limiting, Graceful Degradation

**De Escalabilidade**: Sharding, Read Replicas, Cache Layers (L1/L2/L3), Message Queues

### Formato do relatório

Quando solicitado, o agente entrega um relatório estruturado em 3 seções:

**1. Pontos Fortes** — O que o projeto faz bem: decisões técnicas acertadas, padrões bem aplicados, práticas replicáveis

**2. Riscos** — Classificados por severidade (Cr tico/Alto/M dio/Baixo), com descri  o t cnica, impacto no neg cio e probabilidade

**3. Plano de Acao** — Dividido em fases:
- FASE 1 (Quick Wins, 1-2 semanas): correcoes rapidas com alto impacto
- FASE 2 (Melhorias Estruturais, 1-2 meses): refatoracoes e otimizacoes
- FASE 3 (Evolucao Arquitetural, 3-6 meses): mudancas de longo prazo

### Quando e acionado automaticamente pelo manager

- Qualquer tarefa que mencione: arquitetura, refatoracao, escalabilidade, divida tecnica, revisao de projeto, design patterns, microservices, migracao de sistema, performance geral, gargalos
- Quando o projeto estiver crescendo e precisar de decisoes arquiteturais
- Em revisoes completas de projeto (junto com security e data)
- Quando houver proposta de nova stack ou mudanca de paradigma

### Como interagir com o agente

```bash
# Analise arquitetural completa de um projeto
node dist/index.js --agent architect "Analisar arquitetura e propor melhorias" --path /caminho/projeto

# Revisao de escalabilidade
node dist/index.js --agent architect "O sistema aguenta 10x mais usuarios? Identificar gargalos"

# Auditoria de divida tecnica
node dist/index.js --agent architect "Mapear divida tecnica e propor plano de refatoracao" --path /caminho/projeto

# Via orquestracao — o manager aciona architect + data + security
node dist/index.js --run "Revisao completa da arquitetura do projeto" "Meu Projeto"

# Proposta de migracao
node dist/index.js --run "Avaliar migracao de monolito para microservices" "Meu Projeto"
```

### Fluxo de trabalho

```
Pedido de analise/melhoria arquitetural
  |
Manager analisa e aciona o agente architect
  |
Architect recebe: tarefa + codigo/config do projeto
  |
Analisa 6 dimensoes: arquitetura, escalabilidade, divida tecnica,
                     seguranca, observabilidade, manutenibilidade
  |
Entrega:
  |-- Pontos Fortes (o que manter)
  |-- Riscos (classificados por severidade)
  |-- Plano de Acao (fases 1/2/3 com esforco estimado)
  |-- Propostas SQL/NoSQL (com EXPLAIN e metricas)
  |
Manager consolida com respostas dos outros agentes
```

---

## Agente Analista de Dados (Data)

O agente `data` atua como **Gerente de Dados** da equipe — não apenas executa, mas revisa, questiona decisões de arquitetura e prioriza qualidade de longo prazo com visão de negócio.

### O que o agente faz

- **Estruturação de dados**: modelagem relacional (normalização, denormalização estratégica), modelagem dimensional (star/snowflake schema), design de schemas NoSQL
- **Otimização de performance**: tuning de queries com EXPLAIN ANALYZE, criação de índices estratégicos, particionamento de tabelas, connection pooling
- **SQL avançado**: PostgreSQL, MySQL, SQL Server — window functions, CTEs, views materializadas, stored procedures/functions otimizadas
- **NoSQL**: MongoDB (schema design por access patterns, aggregation pipeline, sharding), Redis (cache patterns, sorted sets, streams), DynamoDB (single-table design, GSI/LSI)
- **Migrations**: zero-downtime migrations, versionamento de schema, rollback seguro
- **Data pipelines**: ETL/ELT, CDC (Change Data Capture), data quality, monitoring
- **Postura gerencial**: revisa schemas, questiona decisões, estima impacto no negócio, prioriza ações, documenta trade-offs

### Diretrizes de otimização que o agente segue

1. NUNCA otimizar sem medir — EXPLAIN ANALYZE é obrigatório
2. Índices resolvem 80% dos problemas — mas índices demais causam outros 20%
3. A query mais rápida é aquela que não executa — cache estratégico
4. Normalização primeiro, denormalização quando a performance exigir
5. Connection pooling é obrigatório em produção
6. Monitorar SEMPRE: slow query log, lock waits, connection count
7. Backup testado é o único backup que existe

### Framework de análise (aplicado em toda resposta)

| Etapa | Descrição |
| --- | --- |
| Situação atual | Métricas reais (tempo de execução, rows examined, tipo de scan) |
| Problema | Causa raiz da degradação (full scan, lock, join ineficiente) |
| Solução | Mudança proposta com justificativa técnica |
| Impacto esperado | Estimativa de melhoria (ex: "de 2.3s para ~50ms") |
| Riscos | Trade-offs (ex: "índice adiciona ~5% ao INSERT") |
| Validação | Como confirmar que a otimização funcionou |

### Quando é acionado automaticamente pelo manager

- Qualquer tarefa que mencione: banco de dados, query, SQL, migration, schema, modelagem, tabela, índice, stored procedure, function, trigger, view, particionamento, tuning, EXPLAIN, ORM, Sequelize, Prisma, Knex, TypeORM, Mongoose, Redis, MongoDB, DynamoDB, PostgreSQL, MySQL
- Quando o backend precisar criar ou modificar tabelas/schemas
- Problemas de performance relacionados a banco de dados
- Projetos novos que precisam de modelagem de dados

### Como interagir com o agente

```bash
# Uso direto — otimização de query
node dist/index.js --agent data "Otimizar query de relatório de vendas que está levando 8s" --path /caminho/projeto

# Uso direto — modelagem de schema
node dist/index.js --agent data "Modelar schema para sistema de e-commerce com produtos, categorias, pedidos e avaliações"

# Uso direto — tuning de banco
node dist/index.js --agent data "Analisar performance do PostgreSQL e sugerir índices" --path /caminho/projeto

# Via orquestração — o manager aciona data + backend automaticamente
node dist/index.js --run "Criar módulo de relatórios com queries otimizadas" "Meu Projeto"

# Via orquestração — migração de banco
node dist/index.js --run "Migrar de MySQL para PostgreSQL mantendo performance" "Meu Projeto"
```

### Fluxo de trabalho

```
Pedido de otimização/modelagem
  ↓
Manager analisa e aciona o agente data
  ↓
Data Analyst recebe: tarefa + código SQL/schema/ORM do projeto
  ↓
Analisa com framework: situação → problema → solução → impacto → riscos
  ↓
Entrega:
  ├── SQL pronto para executar (migrations, queries, índices)
  ├── Diagnóstico com métricas e estimativas
  ├── Plano de monitoramento (métricas + alertas)
  └── Roadmap de evolução (curto/médio/longo prazo)
  ↓
Manager consolida com respostas dos outros agentes (backend, security, etc.)
```

### Formato de resposta do agente

1. **Diagnóstico Executivo** — situação atual e impacto no negócio
2. **Análise Técnica** — queries, schemas, performance metrics
3. **Plano de Ação** — priorizado (quick wins primeiro, melhorias estruturais depois)
4. **SQL/Código Pronto** — migrations, queries otimizadas, índices
5. **Monitoramento** — métricas, alertas e dashboards recomendados
6. **Roadmap de Evolução** — melhorias de médio e longo prazo

---

## Agente de Segurança (Security)

O agente `security` é o guardião da equipe — especialista em segurança da informação, análise de vulnerabilidades e compliance.

### Quando é acionado automaticamente pelo manager

O gestor aciona o agente de segurança sempre que a tarefa envolver:
- Palavras-chave: segurança, vulnerabilidade, OWASP, autenticação, JWT, OAuth, XSS, CSRF, SQL injection, pentest, auditoria, compliance, LGPD, GDPR, criptografia, hardening, secrets, SSL/TLS, CVE
- Criação ou modificação de: login, registro, reset de senha, upload de arquivos, endpoints de API, middleware de autenticação, gestão de roles/permissões
- Dados sensíveis (PII, pagamentos, dados de saúde)
- Revisões de código ou auditorias de projeto existente
- Deploy para produção ou mudanças de infraestrutura (acionado junto com devops)

### Uso direto via CLI

```bash
# Análise de segurança de um projeto
node dist/index.js --agent security "Analisar vulnerabilidades de segurança" --path /caminho/do/projeto

# Auditoria de autenticação
node dist/index.js --agent security "Auditar fluxo de autenticação JWT e sessões"

# Verificar compliance LGPD
node dist/index.js --agent security "Verificar conformidade com LGPD no tratamento de dados pessoais" --path /caminho/do/projeto
```

### Uso via orquestração (o manager decide os agentes)

```bash
# O manager inclui automaticamente o agente security quando relevante
node dist/index.js --run "Fazer auditoria de segurança completa do projeto" "Meu Projeto"

# Tarefas que envolvem auth acionam security + backend automaticamente
node dist/index.js --run "Implementar login com OAuth2 e refresh tokens" "Meu Projeto"
```

### O que o agente analisa

- **OWASP Top 10**: Broken Access Control, Injection, XSS, CSRF, SSRF, falhas criptográficas, etc.
- **Segurança de API**: autenticação, rate limiting, validação de input, sanitização de output
- **Infraestrutura**: Docker (imagens, usuário não-root), Kubernetes (RBAC, NetworkPolicies), Terraform
- **Frontend**: XSS, CSRF, clickjacking, armazenamento seguro, CSP headers
- **Mobile**: certificate pinning, armazenamento seguro, proteção contra reverse engineering
- **Compliance**: LGPD/GDPR, PCI-DSS, SOC 2

### Formato do relatório de segurança

O agente retorna um relatório estruturado com:
1. **Resumo Executivo** — criticidade geral do projeto
2. **Vulnerabilidades Encontradas** — classificadas por severidade (Crítica, Alta, Média, Baixa) com referência OWASP/CWE
3. **Correções Detalhadas** — código pronto para aplicar
4. **Recomendações Preventivas** — melhorias de longo prazo
5. **Checklist de Segurança** — verificações para implementar no CI/CD

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

- `src/agents/` — agentes especialistas: frontend, backend, qa, devops, uxui, mobile, security, data, architect (`.ts`)
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
