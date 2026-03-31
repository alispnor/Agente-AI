##  como usar 

# ir para progeto 
cd /home/ali/projects/Agente-AI

# Configure sua chave
cp .env.example .env
nano .env   # cole sua ANTHROPIC_API_KEY

# Teste básico (sem projeto vinculado)
node src/index.js

# Cadastre seu primeiro projeto real
node src/index.js --add /caminho/do/seu/projeto "Nome do Projeto" "Descrição"

# Liste projetos cadastrados
node src/index.js --list

# Rode uma tarefa no projeto
node src/index.js --run "Descreva a tarefa aqui" "Nome do Projeto"

# Veja o relatório
node src/index.js --report "Nome do Projeto"



# Cadastre seu projeto uma vez
node src/index.js --add /caminho/do/seu/projeto "Nome do Projeto" "Descrição"

# Peça correção de bug — os agentes leem o código real
node src/index.js --run "Corrigir CORS na rota /api/checkout" "Nome do Projeto"

# Nova feature com contexto do projeto
node src/index.js --run "Adicionar paginação na listagem de produtos" "Nome do Projeto"

# Veja o histórico e relatório
node src/index.js --report "Nome do Projeto"


-------
cd ~/projects/Agente-AI

# Sem Docker — direto no Node
node src/server.js
# Acesse: http://localhost:3000

# Com Docker
cp .env.example .env
# edite o .env com sua chave
docker compose up -d
# Acesse: http://localhost:3000


---------------


npm install              # instala typescript + tsx

npm run dev              # desenvolvimento — recarga automática, sem compilar
npm run typecheck        # verifica tipos sem gerar arquivos
npm run build            # compila para dist/
npm start                # roda o compilado (produção)

docker compose up -d     # sobe com Docker já compilando via multi-stage