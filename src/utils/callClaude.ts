import type { AnthropicMessage, AnthropicResponse } from "../types/index.js";

const MODEL = "claude-sonnet-4-20250514";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryHttp(status: number): boolean {
  return status === 529 || status === 500;
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

  const RETRIES = 3;
  const BACKOFF = [1000, 2000, 4000] as const;

  for (let attempt = 0; attempt < RETRIES; attempt++) {
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

      const errText = await res.text();
      if (shouldRetryHttp(res.status) && attempt < RETRIES - 1) {
        const wait = BACKOFF[attempt] ?? 4000;
        console.warn(
          `[callClaude] retry ${attempt + 1}/${RETRIES} após ${wait} ms (${res.status})`
        );
        await sleep(wait);
        continue;
      }

      throw new Error(
        `Erro na API Anthropic (${res.status} ${res.statusText}): ${errText}`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Erro na API Anthropic")) {
        throw e instanceof Error ? e : new Error(msg);
      }
      if (e instanceof SyntaxError) {
        throw e;
      }
      if (attempt < RETRIES - 1) {
        const wait = BACKOFF[attempt] ?? 4000;
        console.warn(
          `[callClaude] retry ${attempt + 1}/${RETRIES} após ${wait} ms:`,
          msg
        );
        await sleep(wait);
        continue;
      }
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  throw new Error("callClaude: falha após retentativas");
}
