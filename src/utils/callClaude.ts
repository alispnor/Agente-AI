import type { AnthropicMessage, AnthropicResponse } from "../types/index.js";

const MODEL = "claude-sonnet-4-20250514";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function callClaude(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: readonly AnthropicMessage[] = []
): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não está definida no ambiente.");
  }

  const messages: AnthropicMessage[] = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8192,
          system: systemPrompt,
          messages,
        }),
      });

      const elapsed = Date.now() - t0;
      console.log(`[callClaude] resposta em ${elapsed} ms (HTTP ${res.status})`);

      if (res.ok) {
        const data = (await res.json()) as AnthropicResponse;
        const text = data.content[0]?.text;
        if (!text) {
          throw new Error("Resposta vazia da API Anthropic");
        }
        return text;
      }

      // ── Rate Limit (429) — Exponential Backoff ──
      if (res.status === 429) {
        if (attempt >= MAX_RETRIES) {
          const errText = await res.text();
          throw new Error(`Rate limit excedido após ${MAX_RETRIES} tentativas: ${errText}`);
        }
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 0;
        const exponentialMs = 5000 * Math.pow(2, attempt); // 5s, 10s, 20s, 40s, 80s
        const wait = Math.max(retryAfterMs, exponentialMs);
        console.warn(
          `⏳ [callClaude] RATE LIMIT (429) — tentativa ${attempt + 1}/${MAX_RETRIES}. ` +
          `Sistema pausado por ${(wait / 1000).toFixed(0)}s aguardando liberação...`
        );
        await sleep(wait);
        continue;
      }

      // ── Erros retentáveis (529 overloaded, 500 server error) ──
      if ((res.status === 529 || res.status === 500) && attempt < MAX_RETRIES) {
        const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s, 32s
        console.warn(
          `[callClaude] retry ${attempt + 1}/${MAX_RETRIES} após ${(wait / 1000).toFixed(0)}s (HTTP ${res.status})`
        );
        await sleep(wait);
        continue;
      }

      // ── Erro não retentável ──
      const errText = await res.text();
      throw new Error(
        `Erro na API Anthropic (${res.status} ${res.statusText}): ${errText}`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Propagar erros da API diretamente
      if (msg.includes("Erro na API Anthropic") || msg.includes("Rate limit excedido")) {
        throw e instanceof Error ? e : new Error(msg);
      }
      if (e instanceof SyntaxError) {
        throw e;
      }
      // Erros de rede — retry com backoff
      if (attempt < MAX_RETRIES) {
        const wait = 3000 * Math.pow(2, attempt);
        console.warn(
          `[callClaude] erro de rede, retry ${attempt + 1}/${MAX_RETRIES} após ${(wait / 1000).toFixed(0)}s: ${msg}`
        );
        await sleep(wait);
        continue;
      }
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  throw new Error("callClaude: falha após todas as retentativas");
}
