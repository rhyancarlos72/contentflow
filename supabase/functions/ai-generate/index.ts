// Edge Function: ai-generate
// Ponto único de geração com IA. Valida sessão, plano, limites mensais e por
// minuto, monta o contexto do projeto (memória isolada por projeto + histórico
// para evitar repetição), chama o Claude e registra o consumo.
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.118.0";
import { generateStructured, type Effort, type GenerateResult } from "../_shared/ai.ts";
import { HttpError, json, serve } from "../_shared/http.ts";
import { buildContext, loadProject } from "../_shared/context.ts";
import { fetchImageBase64, parseDataUrlImage } from "../_shared/net.ts";
import { admin, authenticate, getPlan, type PlanInfo } from "../_shared/supabase.ts";
import {
  CTA_GOAL_LABELS,
  HOOK_CATEGORY_LABELS,
  SCHEMAS,
  SCRIPT_TYPE_LABELS,
  SYSTEM_PROMPT,
} from "./prompts.ts";

type Tool = "ideas" | "script" | "caption" | "hooks" | "cta" | "hashtags" | "plan" | "analytics_insights" | "suggestions" | "topics" | "content_review";

const TOOL_FEATURE: Record<Tool, string> = {
  ideas: "ai_ideas",
  topics: "ai_ideas",
  content_review: "ai_review",
  hooks: "ai_hooks",
  hashtags: "ai_hashtags",
  suggestions: "ai_suggestions",
  script: "ai_scripts",
  caption: "ai_captions",
  cta: "ai_cta",
  plan: "ai_plan",
  analytics_insights: "ai_analytics",
};

const PER_MINUTE_LIMIT = 8;

type Input = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------
function text(input: Input, key: string, { required = false, max = 2000 } = {}): string {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, "invalid_input", `Preencha o campo "${key}".`);
    return "";
  }
  if (typeof value !== "string") throw new HttpError(400, "invalid_input", `Campo "${key}" inválido.`);
  return value.trim().slice(0, max);
}

function list(input: Input, key: string, max = 12): string[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim().slice(0, 80)).slice(0, max);
}

function number(input: Input, key: string, allowed: number[], fallback: number): number {
  const value = Number(input[key]);
  return allowed.includes(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------
/** Dados compartilhados por gerações que fazem mais de uma chamada à IA. */
interface ExecContext { context: string; deadline: number }

interface ToolRun {
  /** Execução própria (várias chamadas); se ausente, uma chamada com prompt/schema. */
  execute?: (ctx: ExecContext) => Promise<GenerateResult<unknown>>;
  prompt: string;
  images?: { mediaType: string; data: string }[];
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: Effort;
  transform?: (data: unknown) => unknown;
}

function ideasTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 300 });
  const quantity = number(input, "quantity", [5, 10, 15], 10);
  return {
    prompt: `Gere ${quantity} ideias de conteúdo sobre: "${topic}".
Distribua entre os tipos: Reels, carrosséis, Stories, temas de vídeo, conteúdos educativos, de autoridade e com potencial de alcance (marque como "viral_potencial" apenas ideias com gatilhos claros de compartilhamento; isso é potencial, não garantia).
Cada ideia: título claro, abordagem (como executar, em 1-2 frases), público específico a quem fala e objetivo estratégico.`,
    schema: SCHEMAS.ideas,
    maxTokens: 8000,
    effort: "low",
  };
}

const FORMAT_NAMES: Record<string, string> = {
  reels: "Reels/vídeo curto vertical", shorts: "YouTube Shorts", video_longo: "vídeo longo", carrossel: "carrossel",
  post: "post de imagem", stories: "Stories",
};

async function contentReviewTool(input: Input): Promise<ToolRun> {
  const caption = text(input, "caption", { max: 4000 });
  const transcript = text(input, "transcript", { max: 8000 });
  const title = text(input, "title", { max: 300 });
  if (!caption && !transcript && !title) {
    throw new HttpError(400, "invalid_input", "Cole a legenda ou o texto/fala do conteúdo para a IA analisar.");
  }
  const platform = text(input, "platform", { max: 40 }) || "não informada";
  const format = text(input, "format", { max: 40 });
  const audience = text(input, "audience", { max: 600 });
  const goal = text(input, "goal", { max: 200 });
  const notes = text(input, "notes", { max: 1000 });
  const url = text(input, "url", { max: 500 });

  const m = (input.metrics && typeof input.metrics === "object") ? input.metrics as Record<string, unknown> : {};
  const metricNames: Record<string, string> = { views: "visualizações", reach: "alcance", likes: "curtidas", comments: "comentários", shares: "compartilhamentos", saves: "salvamentos", followers: "seguidores do perfil" };
  const metrics = Object.entries(metricNames)
    .map(([k, label]) => [label, Number(m[k])] as const)
    .filter(([, v]) => Number.isFinite(v) && v >= 0)
    .map(([label, v]) => `${label}: ${v}`);

  const images: { mediaType: string; data: string }[] = [];
  const uploaded = typeof input.image === "string" ? parseDataUrlImage(input.image) : null;
  if (uploaded) images.push(uploaded);
  const thumb = text(input, "thumbnail", { max: 2000 });
  if (!uploaded && thumb.startsWith("https://")) {
    const img = await fetchImageBase64(thumb);
    if (img) images.push(img);
  }

  return {
    prompt: `Analise este conteúdo já publicado e diga com honestidade o que está bom e o que melhorar.

Dados do conteúdo:
- Plataforma: ${platform}${format ? ` · Formato: ${FORMAT_NAMES[format] ?? format}` : ""}${url ? `\n- Link: ${url}` : ""}
${title ? `- Título: ${title}\n` : ""}- Legenda: ${caption || "(não informada)"}
- Fala / roteiro / texto na tela: ${transcript || "(não informado — o áudio e as imagens do vídeo NÃO foram analisados)"}
- Público que a pessoa quer atingir: ${audience || "o público do projeto (veja o contexto)"}
${goal ? `- Objetivo do conteúdo: ${goal}\n` : ""}- Métricas informadas: ${metrics.length ? metrics.join(", ") : "nenhuma"}
${notes ? `- Observações do criador: ${notes}\n` : ""}${images.length ? "- A imagem anexada é a capa/print do conteúdo: avalie o impacto visual, a leitura do texto na capa e se ela gera curiosidade.\n" : "- Nenhuma imagem disponível: dê nota ao critério capa_visual apenas se houver informação; senão use 0 e explique.\n"}
Como avaliar:
- Notas de 0 a 100, calibradas: 50 = mediano, 70 = bom, 85+ = excelente. Não infle notas.
- "scores": avalie TODOS os critérios (gancho, clareza, naturalidade, valor_entregue, adequacao_ao_publico, cta, legenda, capa_visual, hashtags), citando trechos reais do conteúdo nos comentários.
- "strengths": 2 a 4 pontos que já funcionam (seja específico, cite o trecho).
- "improvements": 3 a 6 melhorias priorizadas; em "example" mostre como ficaria, reescrito.
- "rewrites": reescreva para soar o mais natural possível para o público-alvo — como uma pessoa real falando com essa pessoa, no vocabulário dela. 3 ganchos alternativos, a abertura do roteiro (primeiros ~10 segundos), a legenda completa sem hashtags, um CTA e 5 a 8 hashtags relevantes.
- "audience_fit": para quem o conteúdo fala hoje vs. para quem deveria falar, e o que ajustar.
- "natural_language_tips": 3 a 5 dicas práticas para deixar a comunicação mais natural.
- "metrics_reading": interprete as métricas informadas (proporções como salvamentos/alcance) sem inventar médias de mercado; se não houver métricas, diga isso.
- "next_content_ideas": 3 conteúdos de continuação que aproveitam o que funcionou.
- "data_caveats": deixe claro o que não foi possível avaliar (ex.: vídeo e áudio não analisados).
- Nunca diga que o conteúdo viralizou ou vai viralizar.`,
    schema: SCHEMAS.content_review,
    maxTokens: 12000,
    effort: "medium",
    images,
  };
}

function topicsTool(input: Input): ToolRun {
  const focus = text(input, "topic", { max: 300 });
  const quantity = number(input, "quantity", [6, 12, 18], 12);
  return {
    prompt: `Sugira ${quantity} temas (pautas) de conteúdo para este projeto${focus ? `, com foco em: "${focus}"` : ", cobrindo o nicho de forma ampla"}.
Cada tema precisa ser específico e acionável (nada genérico como "dicas de finanças"), com:
- "title": o tema em uma frase curta;
- "angle": o ângulo que torna o tema interessante (o que a pessoa vai descobrir ou sentir);
- "pillar": o pilar de conteúdo;
- "format": o formato mais indicado (Reels, Carrossel, Stories, Vídeo longo, Post…);
- "hook": um gancho de abertura pronto para usar.
Distribua entre os pilares e varie formatos. Não repita assuntos já abordados no contexto.`,
    schema: SCHEMAS.topics,
    maxTokens: 6000,
    effort: "low",
  };
}

function scriptTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 500 });
  const type = text(input, "type", { max: 40 }) || "camera";
  const duration = number(input, "duration", [15, 30, 45, 60, 90], 30);
  const platform = text(input, "platform", { max: 40 });
  const extra = text(input, "notes", { max: 1000 });
  const words = Math.round(duration * 2.4);
  return {
    prompt: `Escreva um roteiro de ${duration} segundos (cerca de ${words} palavras faladas no total).
Tipo: ${SCRIPT_TYPE_LABELS[type] ?? type}.
${platform ? `Plataforma: ${platform}.` : ""}
Tema: ${topic}
${extra ? `Observações do usuário: ${extra}` : ""}

Estrutura obrigatória: gancho forte (primeiros 3 segundos), desenvolvimento natural, mensagem central, conclusão e CTA.
Escreva como fala, não como texto escrito: contrações naturais ("tá", "pra") quando combinarem com o tom do projeto, pausas indicadas com quebra de linha, sem palavras difíceis.
Em "full_script", junte tudo no texto final para gravar, com indicações de cena entre colchetes quando úteis (ex.: [corte para a tela do celular]).
Em "recording_tips", até 4 dicas práticas de gravação para este roteiro.`,
    schema: SCHEMAS.script,
    maxTokens: 8000,
    effort: "medium",
  };
}

function captionTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 800 });
  const platform = text(input, "platform", { required: true, max: 40 });
  const tone = text(input, "tone", { max: 40 }) || "natural";
  const goal = text(input, "goal", { max: 200 });
  const niche = text(input, "niche", { max: 200 });
  return {
    prompt: `Crie 3 variações de legenda para ${platform}.
Tema/conteúdo do post: ${topic}
${niche ? `Nicho: ${niche}` : ""}
${goal ? `Objetivo: ${goal}` : ""}
Tom: ${tone}.
Adapte tamanho e formatação às convenções de ${platform} (ex.: LinkedIn aceita textos mais longos com parágrafos; TikTok pede legendas curtas).
Cada variação com abertura forte na primeira linha, corpo e CTA final. Não inclua hashtags no texto.
Em "label", descreva a abordagem em 2-4 palavras (ex.: "Direta e curta").`,
    schema: SCHEMAS.caption,
    maxTokens: 6000,
    effort: "low",
  };
}

function hooksTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 500 });
  const categories = list(input, "categories").filter((c) => c in HOOK_CATEGORY_LABELS);
  const selected = categories.length ? categories : Object.keys(HOOK_CATEGORY_LABELS);
  return {
    prompt: `Crie ganchos de abertura (a primeira frase do vídeo ou do post) sobre: "${topic}".
Gere 2 ganchos para cada categoria: ${selected.map((c) => `${c} (${HOOK_CATEGORY_LABELS[c]})`).join(", ")}.
Cada gancho com no máximo 18 palavras, falável em até 3 segundos. Em "why_it_works", explique em uma frase o mecanismo de atenção.`,
    schema: SCHEMAS.hooks,
    maxTokens: 6000,
    effort: "low",
  };
}

function ctaTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 500 });
  const goals = list(input, "goals").filter((g) => g in CTA_GOAL_LABELS);
  const selected = goals.length ? goals : Object.keys(CTA_GOAL_LABELS);
  const platform = text(input, "platform", { max: 40 });
  return {
    prompt: `Crie chamadas para ação (CTA) para um conteúdo sobre: "${topic}"${platform ? ` em ${platform}` : ""}.
Gere 3 opções para cada objetivo: ${selected.map((g) => `${g} (${CTA_GOAL_LABELS[g]})`).join(", ")}.
CTAs curtos, com um motivo concreto para a ação (o que a pessoa ganha), sem soar desesperado.`,
    schema: SCHEMAS.cta,
    maxTokens: 5000,
    effort: "low",
  };
}

function hashtagsTool(input: Input): ToolRun {
  const topic = text(input, "topic", { required: true, max: 500 });
  const platform = text(input, "platform", { required: true, max: 40 });
  return {
    prompt: `Sugira hashtags para um conteúdo sobre "${topic}" em ${platform}.
Organize em grupos: "Nicho específico", "Comunidade", "Tema do post" e "Alcance amplo (relacionado)".
Respeite a quantidade usual da plataforma (ex.: Instagram até 15 no total, TikTok 3-6, LinkedIn 3-5, YouTube 3-5).
Todas devem ter relação direta com o assunto. Em "notes", explique em uma frase como combinar os grupos.`,
    schema: SCHEMAS.hashtags,
    maxTokens: 3000,
    effort: "low",
    transform: (data) => {
      const d = data as { groups: { label: string; hashtags: string[] }[]; notes: string };
      return {
        ...d,
        groups: d.groups.map((g) => ({
          ...g,
          hashtags: [...new Set(g.hashtags.map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, "")))],
        })),
      };
    },
  };
}

/** Datas de publicação distribuídas uniformemente no período. */
function planSlots(startDate: string, days: number, perWeek: number): string[] {
  const total = Math.max(1, Math.round((days * perWeek) / 7));
  const start = new Date(`${startDate}T12:00:00Z`);
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + Math.floor((i * days) / total));
    return d.toISOString().slice(0, 10);
  });
}

const OUTLINE_SCHEMA = (platforms: string[], formats: string[]) => ({
  type: "object", additionalProperties: false, required: ["strategy_summary", "items"],
  properties: {
    strategy_summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["platform", "format", "theme", "pillar", "strategic_goal"],
        properties: {
          platform: { type: "string", enum: platforms },
          format: formats.length ? { type: "string", enum: formats } : { type: "string" },
          theme: { type: "string" },
          pillar: { type: "string", enum: ["educativo", "emocional", "informativo", "entretenimento", "vendas", "autoridade", "comunidade"] },
          strategic_goal: { type: "string" },
        },
      },
    },
  },
});

const DETAIL_SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["hook", "script", "caption", "cta", "hashtags"],
        properties: {
          hook: { type: "string" }, script: { type: "string" }, caption: { type: "string" }, cta: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const cleanTags = (tags: unknown) => ((tags as string[]) ?? []).map((h) => "#" + String(h).replace(/^#+/, "").replace(/\s+/g, ""));

/**
 * Planejamento em duas etapas, para caber no tempo da Edge Function mesmo em 30 dias:
 * 1) esqueleto do período (temas, pilares, formatos) — curto e rápido;
 * 2) gancho, roteiro, legenda, CTA e hashtags em lotes de até 4 publicações, em paralelo.
 */
function planTool(input: Input, plan: PlanInfo): ToolRun {
  const days = number(input, "days", [7, 15, 30], 7);
  if (days > plan.max_plan_days) {
    throw new HttpError(402, "plan_feature", `Planejamentos de ${days} dias estão disponíveis no plano Pro.`);
  }
  const startDate = text(input, "start_date", { required: true, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new HttpError(400, "invalid_input", "Data inicial inválida.");
  const perWeek = Math.min(14, Math.max(1, Number(input.posts_per_week) || 3));
  const platforms = list(input, "platforms");
  if (!platforms.length) throw new HttpError(400, "invalid_input", "Escolha pelo menos uma rede social.");
  const formats = list(input, "formats");
  const slots = planSlots(startDate, days, perWeek);
  const style = text(input, "style", { max: 400 }) || "natural";

  const briefing = `Briefing:
- Nicho: ${text(input, "niche", { required: true, max: 200 })}
- Público-alvo: ${text(input, "audience", { required: true, max: 600 })}
- Objetivo principal: ${text(input, "goal", { required: true, max: 80 })}
- Redes: ${platforms.join(", ")}
- Publicações por semana: ${perWeek}
- Formatos preferidos: ${formats.join(", ") || "livre"}
- Estilo de comunicação: ${style}
- Temas desejados: ${text(input, "themes", { max: 800 }) || "livre, dentro do nicho"}
- Temas a evitar: ${text(input, "avoid", { max: 800 }) || "nenhum informado"}`;

  return {
    prompt: "",
    schema: {},
    maxTokens: 0,
    effort: "low",
    execute: async ({ context, deadline }) => {
      // Etapa 1: esqueleto
      const outline = await generateStructured<{ strategy_summary: string; items: Record<string, unknown>[] }>({
        system: SYSTEM_PROMPT, context, deadline, effort: "low", maxTokens: 8000,
        schema: OUTLINE_SCHEMA(platforms, formats),
        prompt: `Monte o esqueleto de um planejamento de conteúdo de ${days} dias com exatamente ${slots.length} publicações, nas datas: ${slots.join(", ")} (um item por data, nessa ordem).

${briefing}

Regras:
- "theme": tema específico e acionável; nenhum repetido entre si nem com os já abordados no contexto.
- Equilibre pilares (vendas no máximo 1 a cada 5, salvo objetivo de vendas: até 1 a cada 3) e alterne plataformas e formatos.
- Progressão: atrair e gerar confiança no início, aprofundar e converter depois.
- "strategic_goal": uma frase curta com o objetivo da publicação.
- "strategy_summary": 3-5 frases explicando a lógica do planejamento.`,
      });
      const base = outline.data.items.slice(0, slots.length);

      // Etapa 2: detalhes em lotes paralelos
      const chunks: Record<string, unknown>[][] = [];
      for (let i = 0; i < base.length; i += 4) chunks.push(base.slice(i, i + 4));
      const details = await Promise.all(chunks.map((chunk) =>
        generateStructured<{ items: Record<string, unknown>[] }>({
          system: SYSTEM_PROMPT, context, deadline, effort: "low", maxTokens: 9000, schema: DETAIL_SCHEMA,
          prompt: `Escreva o conteúdo completo de ${chunk.length} publicações de um planejamento (mantenha a mesma ordem e quantidade):
${chunk.map((it, i) => `${i + 1}. [${it.platform} · ${it.format} · pilar ${it.pillar}] ${it.theme} — objetivo: ${it.strategic_goal}`).join("\n")}

Público e estilo: ${briefing.split("\n").slice(2, 3).join("")} · estilo ${style}.
Para cada uma:
- "hook": a primeira frase, que prende nos 3 primeiros segundos;
- "script": estrutura em tópicos curtos (gancho → desenvolvimento → mensagem → CTA) ou o carrossel slide a slide;
- "caption": legenda completa pronta para publicar, sem hashtags;
- "cta": chamada para ação específica;
- "hashtags": 3 a 8 hashtags relevantes, com #.`,
        })
      ));

      let k = 0;
      const items = details.flatMap((d, ci) => chunks[ci]!.map((it, j) => {
        const extra = d.data.items[j] ?? { hook: "", script: "", caption: "", cta: "", hashtags: [] };
        return { ...it, ...extra, id: crypto.randomUUID(), date: slots[k++], hashtags: cleanTags(extra.hashtags) };
      }));
      return {
        data: { strategy_summary: outline.data.strategy_summary, items },
        model: outline.model,
        inputTokens: outline.inputTokens + details.reduce((s, d) => s + d.inputTokens, 0),
        outputTokens: outline.outputTokens + details.reduce((s, d) => s + d.outputTokens, 0),
      };
    },
  };
}

interface AnalyticsRow {
  title: string;
  platform: string;
  format: string;
  topic: string;
  published_on: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers_gained: number;
  clicks: number;
  engagement_rate: number | null;
}

async function analyticsTool(db: SupabaseClient, projectId: string): Promise<ToolRun> {
  const { data, error } = await db.from("analytics")
    .select("title, platform, format, topic, published_on, views, reach, likes, comments, shares, saves, followers_gained, clicks, engagement_rate")
    .eq("project_id", projectId).order("published_on", { ascending: false }).limit(300);
  if (error) throw error;
  const rows = (data ?? []) as AnalyticsRow[];
  if (rows.length < 3) {
    throw new HttpError(422, "insufficient_data",
      "Registre métricas de pelo menos 3 publicações para a IA analisar seus resultados.");
  }

  const groupBy = (key: keyof AnalyticsRow) => {
    const groups = new Map<string, AnalyticsRow[]>();
    for (const r of rows) {
      const k = String(r[key] || "sem informação");
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups].map(([k, items]) => {
      const withEng = items.filter((i) => i.engagement_rate !== null);
      const avg = (f: (r: AnalyticsRow) => number) => Math.round(items.reduce((s, r) => s + f(r), 0) / items.length);
      return {
        [key]: k,
        publicacoes: items.length,
        media_views: avg((r) => r.views),
        media_salvamentos: avg((r) => r.saves),
        media_comentarios: avg((r) => r.comments),
        engajamento_medio: withEng.length
          ? Number((withEng.reduce((s, r) => s + Number(r.engagement_rate), 0) / withEng.length).toFixed(2))
          : null,
      };
    });
  };

  const dates = rows.map((r) => r.published_on).sort();
  const spanDays = Math.max(1, (Date.parse(dates.at(-1)!) - Date.parse(dates[0])) / 86_400_000 + 1);

  const dataset = {
    total_publicacoes: rows.length,
    periodo: { de: dates[0], ate: dates.at(-1), publicacoes_por_semana: Number((rows.length / (spanDays / 7)).toFixed(1)) },
    por_formato: groupBy("format"),
    por_plataforma: groupBy("platform"),
    por_tema: groupBy("topic"),
    mais_salvas: [...rows].sort((a, b) => b.saves - a.saves).slice(0, 5)
      .map((r) => ({ titulo: r.title, salvamentos: r.saves, formato: r.format })),
    publicacoes: rows.slice(0, 60),
  };

  return {
    prompt: `Analise as métricas reais registradas pelo usuário (JSON abaixo) e escreva observações úteis.

${JSON.stringify(dataset)}

Regras:
- Use apenas estes números. Não invente métricas nem extrapole tendências que os dados não mostram.
- Cubra: formatos com melhor desempenho, temas com mais interação, frequência de publicação, conteúdos mais salvos e sugestões para os próximos conteúdos.
- Em "evidence", cite os números que sustentam cada observação.
- Não chame nenhuma publicação de viral. Se a amostra for pequena (menos de 10 publicações ou grupos com 1-2 itens), diga isso em "data_caveats" e trate as conclusões como hipóteses.
- "next_steps": 3 a 5 ações concretas para as próximas semanas.`,
    schema: SCHEMAS.analytics_insights,
    maxTokens: 8000,
    effort: "medium",
  };
}

async function suggestionsTool(db: SupabaseClient, projectId: string): Promise<ToolRun> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.from("calendar_posts")
    .select("status, content_pillar, format, platform, scheduled_date")
    .eq("project_id", projectId).gte("scheduled_date", since);
  if (error) throw error;
  const posts = data ?? [];
  const count = (key: "status" | "content_pillar" | "format" | "platform") =>
    posts.reduce<Record<string, number>>((acc, p) => {
      const k = (p[key] as string | null) ?? "sem_pilar";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

  return {
    prompt: `Situação real dos últimos 30 dias e próximos agendamentos deste projeto:
${JSON.stringify({ total: posts.length, por_status: count("status"), por_pilar: count("content_pillar"), por_formato: count("format"), por_plataforma: count("platform") })}

1. Sugira 4 ideias de conteúdo novas e específicas para este projeto, que preencham lacunas de pilar ou formato.
2. Faça 3 recomendações estratégicas curtas baseadas nessa situação (ex.: equilíbrio de pilares, constância, gargalos de produção). Se não houver dados, recomende os primeiros passos.`,
    schema: SCHEMAS.suggestions,
    maxTokens: 5000,
    effort: "low",
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  // A Edge Function tem ~150 s de limite; a IA precisa responder antes disso.
  const deadline = Date.now() + 135_000;
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
  const { user, db } = await authenticate(req);

  const body = await req.json().catch(() => null) as { tool?: Tool; projectId?: string; input?: Input } | null;
  const tool = body?.tool;
  if (!tool || !(tool in TOOL_FEATURE)) throw new HttpError(400, "invalid_tool", "Ferramenta de IA inválida.");
  if (!body?.projectId) throw new HttpError(400, "invalid_input", "Selecione um projeto.");
  const input = (body.input && typeof body.input === "object") ? body.input : {};

  // 1. Plano e permissões (validados no servidor)
  const plan = await getPlan(user.id);
  if (!plan.features.includes(TOOL_FEATURE[tool])) {
    throw new HttpError(402, "plan_feature", "Este recurso não está disponível no seu plano. Faça upgrade para liberar.");
  }

  // 2. Limites de uso: mensal e anti-abuso por minuto
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [monthly, recent] = await Promise.all([
    admin.from("ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("success", true).gte("created_at", monthStart.toISOString()),
    admin.from("ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", new Date(Date.now() - 60_000).toISOString()),
  ]);
  if (monthly.error) throw monthly.error;
  if (recent.error) throw recent.error;
  const used = monthly.count ?? 0;
  if (used >= plan.monthly_ai_generations) {
    throw new HttpError(429, "monthly_limit",
      `Você usou as ${plan.monthly_ai_generations} gerações de IA do mês. Faça upgrade ou aguarde o próximo mês.`);
  }
  const toolLimit = Number(plan.tool_limits?.[tool] ?? 0);
  if (toolLimit > 0) {
    const { count, error } = await admin.from("ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("tool", tool).eq("success", true).gte("created_at", monthStart.toISOString());
    if (error) throw error;
    if ((count ?? 0) >= toolLimit) {
      throw new HttpError(429, "tool_limit",
        `Você usou ${toolLimit} ${tool === "content_review" ? "análises de conteúdo" : "roteiros com IA"} do plano gratuito neste mês. Assine o Creator para usar sem esse limite.`);
    }
  }
  if ((recent.count ?? 0) >= PER_MINUTE_LIMIT) {
    throw new HttpError(429, "rate_limited", "Muitas gerações seguidas. Aguarde um minuto.");
  }

  // 3. Contexto do projeto (RLS garante que o projeto é do usuário)
  const project = await loadProject(db, body.projectId);
  const context = await buildContext(db, project, plan);

  const run: ToolRun = await (async () => {
    switch (tool) {
      case "ideas": return ideasTool(input);
      case "topics": return topicsTool(input);
      case "content_review": return contentReviewTool(input);
      case "script": return scriptTool(input);
      case "caption": return captionTool(input);
      case "hooks": return hooksTool(input);
      case "cta": return ctaTool(input);
      case "hashtags": return hashtagsTool(input);
      case "plan": return planTool(input, plan);
      case "analytics_insights": return analyticsTool(db, project.id);
      case "suggestions": return suggestionsTool(db, project.id);
    }
  })();

  // Estilo de escrita escolhido para esta peça (predefinido ou da memória do projeto).
  const style = text(input, "style", { max: 400 });
  if (style && !run.execute) {
    run.prompt += `\n\nEstilo de escrita pedido para esta peça: ${style}\nSiga esse estilo com prioridade sobre o estilo padrão, sem perder a naturalidade e o tom de voz do projeto.`;
  }

  // 4. Geração
  try {
    const result = run.execute
      ? await run.execute({ context, deadline })
      : await generateStructured<unknown>({
        system: SYSTEM_PROMPT,
        context,
        prompt: run.prompt,
        schema: run.schema,
        maxTokens: run.maxTokens,
        effort: run.effort,
        images: run.images,
        deadline,
      });
    await admin.from("ai_usage").insert({
      user_id: user.id, project_id: project.id, tool, model: result.model,
      input_tokens: result.inputTokens, output_tokens: result.outputTokens, success: true,
    });
    return json({
      data: run.transform ? run.transform(result.data) : result.data,
      usage: { used: used + 1, limit: plan.monthly_ai_generations },
    });
  } catch (err) {
    // Falhas não consomem cota, mas contam para o limite por minuto.
    await admin.from("ai_usage").insert({
      user_id: user.id, project_id: project.id, tool, model: "n/a", success: false,
    });
    throw err;
  }
});
