FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY public/ ./public/
COPY data/ ./data/

RUN apk add --no-cache wget
RUN mkdir -p data/history reports clients

EXPOSE 3000
CMD ["node", "dist/server.js"]
