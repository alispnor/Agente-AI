import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env", "utf8");
  env.split("\n").forEach((line: string) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const eq = t.indexOf("=");
    if (eq === -1) return;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k) process.env[k] = v;
  });
} catch {
  /* sem .env */
}
