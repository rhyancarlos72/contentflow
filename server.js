// Servidor de produção do ContentFlow AI (Hostinger Node.js, Render, Railway, VPS…).
// - Gera o build automaticamente se a pasta dist/ ainda não existir.
// - Serve os arquivos estáticos com cache e cai no index.html nas rotas do React.
// - Publica /env-config.js com as variáveis VITE_* do ambiente, para que a
//   configuração funcione mesmo quando a hospedagem só as define em tempo de execução.
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

if (!existsSync(join(dist, "index.html"))) {
  console.log("[contentflow] dist/ não encontrado — gerando build…");
  const { build } = await import("vite");
  await build({ root, logLevel: "warn" });
}

const PUBLIC_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_GOOGLE_AUTH_ENABLED"];
const envScript = `window.__ENV__ = ${JSON.stringify(
  Object.fromEntries(PUBLIC_ENV.filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
)};`;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.get("/env-config.js", (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store").send(envScript);
});

app.use("/assets", express.static(join(dist, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
app.use(express.static(dist, { index: false, maxAge: "1h" }));

// Rotas do React Router
app.get("/{*path}", (_req, res) => {
  res.set("Cache-Control", "no-cache").sendFile(join(dist, "index.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`[contentflow] rodando na porta ${port}`));
