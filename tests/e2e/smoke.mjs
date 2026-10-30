// Smoke test visual de todas as telas com a API do Supabase interceptada.
// Os dados abaixo existem APENAS neste teste (fixtures), nunca no app.
// Uso: VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=test npm run build
//      npx vite preview --port 4173 &  node tests/e2e/smoke.mjs [pasta-screenshots]
import { createRequire } from "node:module";

// Usa o Playwright do projeto ou o global (NODE_PATH).
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const OUT = process.argv[2] ?? "tests/e2e/screenshots";
const uid = "00000000-0000-0000-0000-00000000000a";
const pid = "10000000-0000-0000-0000-00000000000a";
const d = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const now = new Date().toISOString();

const fx = {
  profiles: [{ id: uid, full_name: "Ana Souza", email: "ana@teste.dev", avatar_url: null, niche: "Finanças", communication_style: "natural",
    preferred_language: "pt-BR", weekly_goal: 3, onboarding_completed: true, tutorial_completed: true, active_project_id: pid,
    notification_prefs: { in_app: true, email: false, whatsapp: false, recording_reminders: true, scheduled_posts: true, overdue_tasks: true, weekly_planning: true, goals: true, weekly_report: true }, created_at: now }],
  projects: [{ id: pid, user_id: uid, name: "Finanças da Ana", description: "Educação financeira", kind: "marca_pessoal", niche: "Finanças pessoais",
    audience: "Mulheres 25-40", voice: "Próxima e direta", platforms: ["instagram", "tiktok"], goals: ["Construir autoridade"], posts_per_week: 3,
    color: "#7952D6", logo_url: null, archived: false, created_at: now }],
  calendar_posts: [
    ["Reserva de emergência em 3 passos", 1, "agendado", "carrossel"], ["Mitos sobre investir", 2, "gravacao_pendente", "reels"],
    ["Planilha de gastos", -2, "publicado", "reels"], ["Como sair do cheque especial", 4, "planejado", "reels"], ["Bastidores", 0, "em_edicao", "stories"],
  ].map(([title, off, status, format], i) => ({ id: `p${i}`, user_id: uid, project_id: pid, plan_id: null, script_id: null, idea_id: null, title,
    scheduled_date: d(off), scheduled_time: "18:00:00", platform: i % 2 ? "tiktok" : "instagram", format, status, content_pillar: "educativo",
    strategic_goal: "Gerar salvamentos", hook: "Você sabe quanto gasta por mês?", script_outline: "1. Gancho\n2. Passos", caption: "Legenda", cta: "Salve",
    hashtags: ["#financas"], notes: "", published_at: status === "publicado" ? now : null, created_at: now, updated_at: now })),
  production_tasks: [["Gravar reels de mitos", "gravacao"], ["Editar bastidores", "edicao"], ["Revisar carrossel", "revisao"], ["Planilha", "publicado"]]
    .map(([title, stage], i) => ({ id: `t${i}`, user_id: uid, project_id: pid, post_id: null, title, stage, position: i, assignee: i ? "Bia" : "",
      due_date: d(i - 1), platform: "instagram", priority: ["alta", "media", "urgente", "baixa"][i], notes: "", checklist: [{ id: "c1", text: "Roteiro", done: true }, { id: "c2", text: "Luz", done: false }],
      attachments: [], completed_at: stage === "publicado" ? now : null, created_at: now, updated_at: now })),
  analytics: [["Planilha de gastos", "reels", 5400, 4100, 320, 41, 60, 210], ["5 erros", "carrossel", 2100, 1800, 150, 22, 30, 190], ["Bastidores", "stories", 900, 850, 40, 3, 2, 5]]
    .map(([title, format, views, reach, likes, comments, shares, saves], i) => ({ id: `a${i}`, user_id: uid, project_id: pid, post_id: null, title, platform: "instagram",
      format, topic: "orçamento", published_on: d(-10 + i * 3), views, reach, likes, comments, shares, saves, followers_gained: 12, clicks: 8,
      engagement_rate: Number((((likes + comments + shares + saves) / reach) * 100).toFixed(2)), source: "manual", created_at: now })),
  content_ideas: [{ id: "i1", user_id: uid, project_id: pid, category_id: "cat1", title: "Desafio 30 dias sem delivery", description: "Série de stories", niche: "Finanças",
    format: "stories", reference: "", inspiration_url: "https://example.com", notes: "", is_favorite: true, source: "manual", converted_script_id: null, converted_post_id: null, created_at: now }],
  idea_categories: [{ id: "cat1", project_id: pid, name: "Educativo", color: "#4F7BE8" }],
  scripts: [{ id: "s1", user_id: uid, project_id: pid, folder_id: null, idea_id: null, title: "Mitos sobre investir", content: "Você acha que precisa de muito dinheiro pra investir?\n\nNão precisa.", notes: "Gravar de manhã",
    duration_seconds: 30, platform: "instagram", format: "camera", status: "rascunho", source: "ai", created_at: now, updated_at: now }],
  script_folders: [], library_items: [{ id: "l1", user_id: uid, project_id: pid, kind: "gancho", title: "Você paga juros sem saber?", content: "Você paga juros sem saber?", url: null,
    file_path: null, file_size: null, mime_type: null, tags: ["juros"], created_at: now }],
  content_plans: [{ id: "cp1", user_id: uid, project_id: pid, title: "7 dias · a partir de hoje", days: 7, start_date: d(0), briefing: {}, strategy_summary: "Começar atraindo com conteúdos educativos e terminar com autoridade.",
    items: [{ id: "x1", date: d(0), platform: "instagram", format: "reels", theme: "O mito do salário alto", pillar: "educativo", strategic_goal: "Alcance", hook: "Ganhar mais não resolve.", script: "1. ...", caption: "...", cta: "Siga", hashtags: ["#financas"] }], created_at: now }],
  ai_memory: [{ id: "m1", project_id: pid, kind: "tom_de_voz", content: "Próxima e direta", source: "onboarding", created_at: now }],
  social_accounts: [], notifications: [{ id: "n1", project_id: pid, type: "publicacao", title: "Publicação programada: Reserva de emergência", body: "Instagram · amanhã", link: "/calendario", read_at: null, created_at: now }],
};

const planStatus = { plan: "pro", limits: { plan: "pro", max_projects: 15, monthly_ai_generations: 600, max_plan_days: 30,
  features: ["calendar", "ideas_bank", "manual_scripts", "ai_ideas", "ai_hooks", "ai_hashtags", "ai_suggestions", "ai_plan", "ai_scripts", "ai_captions", "ai_cta", "analytics_manual", "library", "ai_analytics", "advanced_memory", "advanced_analytics", "reports"] },
  ai_used_this_month: 12, projects_count: 1, subscription: { plan: "pro", status: "active", current_period_end: d(20), cancel_at_period_end: false, provider: "stripe" } };

const aiFixtures = {
  suggestions: { ideas: [{ title: "Quanto custa seu cafezinho por ano", format: "Reels", pillar: "educativo", why: "Lacuna de conteúdo leve" }], recommendations: [{ title: "Equilibre pilares", detail: "Mais emocionais." }] },
  ideas: { ideas: [{ title: "Orçamento 50/30/20 na prática", type: "carrossel", approach: "Exemplo com salário real", audience: "CLT iniciante", objective: "Salvamentos" }] },
};

const routes = ["/app", "/planejamento", "/calendario", "/calendario?view=semana", "/calendario?view=lista", "/estudio", "/ideias", "/roteiros", "/roteiros/s1",
  "/producao", "/analytics", "/projetos", "/biblioteca", "/configuracoes", "/configuracoes?tab=plano", "/configuracoes?tab=notificacoes", "/precos"];

const browser = await chromium.launch();
const failures = [];
for (const viewport of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR" });
  await ctx.addInitScript(([u]) => {
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "test", refresh_token: "test", token_type: "bearer",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u, email: "ana@teste.dev", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } }));
  }, [uid]);
  await ctx.route("http://localhost:54321/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    if (url.pathname.startsWith("/functions/v1/ai-generate")) {
      const tool = JSON.parse(req.postData() ?? "{}").tool;
      return route.fulfill({ json: { data: aiFixtures[tool] ?? {}, usage: { used: 13, limit: 600 } } });
    }
    if (url.pathname === "/rest/v1/rpc/my_plan_status") return route.fulfill({ json: planStatus });
    if (url.pathname.startsWith("/rest/v1/rpc/")) return route.fulfill({ json: [] });
    const table = url.pathname.replace("/rest/v1/", "");
    if (req.method() === "GET" || req.method() === "HEAD") {
      let rows = fx[table] ?? [];
      const id = url.searchParams.get("id");
      if (id?.startsWith("eq.")) rows = rows.filter((r) => r.id === id.slice(3));
      return route.fulfill({ json: single ? (rows[0] ?? null) : rows });
    }
    const body = JSON.parse(req.postData() ?? "{}");
    const out = Array.isArray(body) ? body.map((b, i) => ({ id: `new${i}`, created_at: now, updated_at: now, ...b })) : [{ id: "new", ...body }];
    return route.fulfill({ json: single ? out[0] : out });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => failures.push(`[${viewport.name}] ${page.url()} pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && failures.push(`[${viewport.name}] ${page.url()} console: ${m.text()}`));
  for (const r of viewport.name === "mobile" ? ["/app", "/calendario", "/producao", "/estudio"] : routes) {
    await page.goto(BASE + r);
    await page.waitForTimeout(900);
    const crashed = await page.locator("text=Algo deu errado").count();
    if (crashed) failures.push(`[${viewport.name}] ${r} mostrou erro`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) {
      const culprits = await page.evaluate(() => [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && ![...e.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 1))
        .filter((e) => { for (let a = e.parentElement; a; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return false; return true; })
        .slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 60)}`));
      failures.push(`[${viewport.name}] ${r} tem rolagem horizontal: ${culprits.join(" | ")}`);
    }
    await page.screenshot({ path: `${OUT}/${viewport.name}${r.replace(/[/?=]/g, "_")}.png`, fullPage: viewport.name === "desktop" });
  }
  // Fluxos interativos
  if (viewport.name === "desktop") {
    await page.goto(BASE + "/app");
    await page.getByRole("button", { name: "Gerar sugestões" }).click();
    await page.getByText("Quanto custa seu cafezinho por ano").waitFor({ timeout: 4000 });
    await page.getByRole("button", { name: "Criar novo conteúdo" }).click();
    await page.getByText("Nova publicação").waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Buscar publicações").waitFor();
    await page.keyboard.press("Escape");
    await page.goto(BASE + "/estudio");
    await page.getByPlaceholder(/organização financeira/).fill("orçamento doméstico");
    await page.getByRole("button", { name: "Gerar com IA" }).click();
    await page.getByText("Orçamento 50/30/20 na prática").waitFor({ timeout: 4000 });
    await page.screenshot({ path: `${OUT}/desktop_estudio_resultado.png`, fullPage: true });
  }
  await ctx.close();
}
// Telas públicas (sem sessão)
const pub = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await pub.route("http://localhost:54321/**", (r) => r.fulfill({ json: {} }));
const pp = await pub.newPage();
pp.on("pageerror", (e) => failures.push(`[public] pageerror: ${e.message}`));
for (const r of ["/", "/entrar", "/cadastro", "/recuperar-senha", "/precos"]) {
  await pp.goto(BASE + r);
  await pp.waitForTimeout(600);
  await pp.screenshot({ path: `${OUT}/public${r.replace(/\//g, "_") || "_home"}.png`, fullPage: true });
}
await browser.close();
if (failures.length) {
  console.error("FALHAS:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("SMOKE_OK");
