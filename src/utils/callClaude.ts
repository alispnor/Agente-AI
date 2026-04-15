import type { ModelConfig } from "../config/models.js";
import type {
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicResponse,
} from "../types/index.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function callClaude(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: readonly AnthropicMessage[] = [],
  modelConfig?: ModelConfig
): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não está definida no ambiente.");
  }

  const messages: AnthropicMessage[] = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const config: ModelConfig =
    modelConfig ?? {
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      description: "Sonnet (default)",
    };

  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const body: Record<string, unknown> = {
        model: config.model,
        max_tokens: config.max_tokens,
        system: systemPrompt,
        messages,
      };

      if (config.thinking) {
        body["thinking"] = config.thinking;
        body["temperature"] = 1;
      } else if (config.temperature !== undefined) {
        body["temperature"] = config.temperature;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      const elapsed = Date.now() - t0;
      console.log(`[callClaude] resposta em ${elapsed} ms (HTTP ${res.status})`);

      if (res.ok) {
        const responseData = (await res.json()) as AnthropicResponse;
        const thinkingBlock = responseData.content.find(
          (b: AnthropicContentBlock) => b.type === "thinking"
        );
        if (thinkingBlock?.thinking) {
          const t = thinkingBlock.thinking;
          console.log("\n🧠 [RACIOCÍNIO INTERNO DO MODELO]");
          console.log("─".repeat(50));
          console.log(
            t.slice(0, 800) + (t.length > 800 ? "\n...[truncado]" : "")
          );
          console.log("─".repeat(50) + "\n");
        }

        const textBlock = responseData.content.find(
          (b: AnthropicContentBlock) => b.type === "text"
        );
        if (!textBlock?.text) {
          throw new Error("Resposta sem bloco de texto da API");
        }
        return textBlock.text;
      }

      // ── Rate Limit (429) — Exponential Backoff ──
      if (res.status === 429) {
        if (attempt >= MAX_RETRIES) {
          const errText = await res.text();
          throw new Error(
            `Rate limit excedido após ${MAX_RETRIES} tentativas: ${errText}`
          );
        }
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : 0;
        const exponentialMs = 5000 * Math.pow(2, attempt);
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
        const wait = 2000 * Math.pow(2, attempt);
        console.warn(
          `[callClaude] retry ${attempt + 1}/${MAX_RETRIES} após ${(wait / 1000).toFixed(0)}s (HTTP ${res.status})`
        );
        await sleep(wait);
        continue;
      }

      const errText = await res.text();
      throw new Error(
        `Erro na API Anthropic (${res.status} ${res.statusText}): ${errText}`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("Erro na API Anthropic") ||
        msg.includes("Rate limit excedido")
      ) {
        throw e instanceof Error ? e : new Error(msg);
      }
      if (e instanceof SyntaxError) {
        throw e;
      }
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
