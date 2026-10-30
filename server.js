// Servidor de produção do ContentFlow AI.
// Em CommonJS de propósito: a Hostinger (LiteSpeed/lsnode) carrega o arquivo
// com require(), que não aceita módulos ESM com top-level await.
// Também roda com `node server.js` em qualquer outra hospedagem (Render, Railway, VPS…).
//
// - Começa a responder na hora; se dist/ não existir, gera o build em segundo
//   plano e mostra uma página de "preparando" até terminar.
// - Serve os arquivos estáticos com cache e cai no index.html nas rotas do React.
// - Publica /env-config.js com as variáveis VITE_* do ambiente (configuração em
//   tempo de execução, além da embutida no build).
"use strict";

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const dist = path.join(root, "dist");
const indexHtml = path.join(dist, "index.html");

let ready = fs.existsSync(indexHtml);
let buildError = null;

if (!ready) {
  console.log("[contentflow] dist/ não encontrado — gerando build em segundo plano…");
  import("vite")
    .then(({ build }) => build({ root, logLevel: "warn" }))
    .then(() => {
      ready = fs.existsSync(indexHtml);
      console.log("[contentflow] build concluído");
    })
    .catch((err) => {
      buildError = err;
      console.error("[contentflow] falha no build:", err);
    });
}

const PUBLIC_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_GOOGLE_AUTH_ENABLED"];
const envScript = "window.__ENV__ = " + JSON.stringify(
  Object.fromEntries(PUBLIC_ENV.filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
) + ";";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
});

app.get("/healthz", (_req, res) => res.json({ ok: true, ready, buildError: buildError ? String(buildError.message || buildError) : null }));

app.get("/env-config.js", (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store").send(envScript);
});

app.use((req, res, next) => {
  if (ready) return next();
  res.status(503).set({ "Retry-After": "10", "Cache-Control": "no-store" }).type("html").send(
    buildError
      ? "<h1>Erro ao preparar o ContentFlow AI</h1><p>Veja os logs do servidor.</p>"
      : '<meta http-equiv="refresh" content="8"><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;color:#5935A8">' +
        "<p>Preparando o ContentFlow AI… a página recarrega sozinha.</p></body>",
  );
});

app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
app.use(express.static(dist, { index: false, maxAge: "1h" }));

// Rotas do React Router
app.get("/{*path}", (_req, res) => {
  res.set("Cache-Control", "no-cache").sendFile(indexHtml);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log("[contentflow] rodando na porta " + port));

module.exports = app;
