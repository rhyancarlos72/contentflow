// Servidor de produção do ContentFlow AI.
// Em CommonJS de propósito: a Hostinger (LiteSpeed/lsnode) carrega o arquivo
// com require(), que não aceita módulos ESM com top-level await.
// Também roda com `node server.js` em qualquer outra hospedagem (Render, Railway, VPS…).
//
// - Usa a pasta dist/ que já vem pronta no repositório (atualizada pelo GitHub
//   Actions). Se ela faltar, gera o build num processo separado e mostra uma
//   página de "preparando" até terminar.
// - Serve os arquivos estáticos com cache e cai no index.html nas rotas do React.
// - Embute as variáveis VITE_* do ambiente no index.html e as publica também em
//   /__config (configuração em tempo de execução, além da embutida no build).
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
  // Normalmente dist/ já vem pronta do repositório. Se faltar, gera o build num
  // processo separado: carregar o Vite dentro deste processo falha no LiteSpeed
  // (o stdin dele é um socket FastCGI e o Node dispara "open EEXIST").
  console.log("[contentflow] dist/ não encontrado — gerando build em segundo plano…");
  const { spawn } = require("node:child_process");
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteBin, "build", "--logLevel", "warn"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  });
  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));
  child.on("error", (err) => {
    buildError = err;
    console.error("[contentflow] falha ao iniciar o build:", err);
  });
  child.on("exit", (code) => {
    ready = code === 0 && fs.existsSync(indexHtml);
    if (ready) console.log("[contentflow] build concluído");
    else {
      buildError = new Error("build terminou com código " + code);
      console.error("[contentflow] falha no build (código " + code + ")");
    }
  });
}

// Algumas hospedagens (ex.: Hostinger) gravam as variáveis do painel num arquivo
// .env em vez de passá-las ao processo. Lê os arquivos sem sobrescrever o que já existe.
for (const file of [".env", ".env.local", ".env.production"]) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env[m[1]] = value;
  }
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

// Diagnóstico: mostra só SE cada variável chegou, nunca o valor.
app.get("/healthz", (_req, res) => res.json({
  ok: true,
  ready,
  buildError: buildError ? String(buildError.message || buildError) : null,
  env: Object.fromEntries(PUBLIC_ENV.map((k) => [k, Boolean(process.env[k])])),
}));

const publicConfig = Object.fromEntries(PUBLIC_ENV.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));

// Configuração pública em JSON. Não existe como arquivo, então sempre passa pelo
// Node — o app consulta este endereço se a página vier sem a configuração embutida.
app.get("/__config", (_req, res) => {
  res.set("Cache-Control", "no-store").json(publicConfig);
});
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

// Rotas do React Router: entrega o index.html com a configuração embutida.
let cachedHtml = null;
app.get("/{*path}", (_req, res) => {
  cachedHtml ??= fs.readFileSync(indexHtml, "utf8")
    .replace("<!--__CONTENTFLOW_ENV__-->", "<script>" + envScript.replace(/</g, "\\u003c") + "</script>");
  res.set("Cache-Control", "no-store").type("html").send(cachedHtml);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log("[contentflow] rodando na porta " + port));

module.exports = app;
