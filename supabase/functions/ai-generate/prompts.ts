// Prompts e schemas JSON de cada ferramenta de IA do ContentFlow.

type Schema = Record<string, unknown>;
const str: Schema = { type: "string" };
const int: Schema = { type: "integer" };
const arr = (items: Schema): Schema => ({ type: "array", items });
const enumOf = (values: readonly string[]): Schema => ({ type: "string", enum: [...values] });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const PILLARS = ["educativo", "emocional", "informativo", "entretenimento", "vendas", "autoridade", "comunidade"] as const;

/** Instruções fixas (cacheáveis) válidas para todas as ferramentas. */
export const SYSTEM_PROMPT = `Você é o estrategista de conteúdo, roteirista e redator do ContentFlow AI.
Você ajuda criadores, empreendedores e agências brasileiras a planejar e produzir conteúdo para redes sociais com estratégia.

Como escrever:
- Português do Brasil, natural, como uma pessoa falando com outra. Frases curtas, vocabulário do dia a dia do público.
- Nada de clichês de marketing ("no mundo de hoje", "descubra o segredo", "você não vai acreditar", "transforme sua vida").
- Nada de excesso de emojis, exclamações em série ou frases prontas repetidas entre itens.
- Seja específico ao nicho: exemplos concretos, situações reais, números só quando forem plausíveis e apresentados como exemplo, nunca como dado do usuário.
- Respeite o tom de voz, o público, as palavras proibidas e as preferências descritas no contexto do projeto. Isso tem prioridade sobre seu estilo padrão.
- Antes de propor temas, confira a lista de assuntos já abordados e evite repetir ou parafrasear.
- Nunca prometa resultados (viralizar, ganhar seguidores) nem invente métricas, depoimentos ou estatísticas do usuário.
- Hashtags: relevantes ao tema e à plataforma, sem genéricas vazias (#love, #instagood) e sem espaços.
- Responda somente com o JSON pedido.`;

export const SCHEMAS = {
  ideas: obj({
    ideas: arr(obj({
      title: str,
      type: enumOf(["reels", "carrossel", "stories", "video", "educativo", "autoridade", "viral_potencial"]),
      approach: str,
      audience: str,
      objective: str,
    })),
  }),
  script: obj({
    title: str,
    hook: str,
    development: str,
    core_message: str,
    conclusion: str,
    cta: str,
    full_script: str,
    estimated_seconds: int,
    recording_tips: arr(str),
  }),
  caption: obj({
    captions: arr(obj({ label: str, text: str })),
  }),
  hooks: obj({
    hooks: arr(obj({
      category: enumOf(["curiosidade", "polemica_construtiva", "identificacao", "historia_pessoal", "pergunta", "erro_comum", "conselho", "quebra_de_crenca"]),
      text: str,
      why_it_works: str,
    })),
  }),
  cta: obj({
    ctas: arr(obj({
      goal: enumOf(["seguir", "comentar", "compartilhar", "salvar", "clicar_link", "comprar", "mensagem"]),
      text: str,
    })),
  }),
  hashtags: obj({
    groups: arr(obj({ label: str, hashtags: arr(str) })),
    notes: str,
  }),
  analytics_insights: obj({
    summary: str,
    observations: arr(obj({ title: str, detail: str, evidence: str })),
    next_steps: arr(str),
    data_caveats: str,
  }),
  suggestions: obj({
    ideas: arr(obj({ title: str, format: str, pillar: enumOf(PILLARS), why: str })),
    recommendations: arr(obj({ title: str, detail: str })),
  }),
} satisfies Record<string, Schema>;

export function planSchema(platforms: string[], formats: string[]): Schema {
  return obj({
    strategy_summary: str,
    items: arr(obj({
      platform: enumOf(platforms),
      format: formats.length ? enumOf(formats) : str,
      theme: str,
      pillar: enumOf(PILLARS),
      strategic_goal: str,
      hook: str,
      script: str,
      caption: str,
      cta: str,
      hashtags: arr(str),
    })),
  });
}

export const HOOK_CATEGORY_LABELS: Record<string, string> = {
  curiosidade: "Curiosidade",
  polemica_construtiva: "Polêmica construtiva",
  identificacao: "Identificação",
  historia_pessoal: "História pessoal",
  pergunta: "Pergunta",
  erro_comum: "Erro comum",
  conselho: "Conselho",
  quebra_de_crenca: "Quebra de crença",
};

export const CTA_GOAL_LABELS: Record<string, string> = {
  seguir: "Seguir o perfil",
  comentar: "Comentar",
  compartilhar: "Compartilhar",
  salvar: "Salvar",
  clicar_link: "Clicar no link",
  comprar: "Comprar",
  mensagem: "Enviar mensagem",
};

export const SCRIPT_TYPE_LABELS: Record<string, string> = {
  reels_narrado: "Reels narrado (voz em off sobre imagens)",
  camera: "Vídeo falando diretamente para a câmera",
  react: "Vídeo de react (reagindo a um conteúdo, com comentários próprios)",
  tiktok: "TikTok",
  shorts: "YouTube Shorts",
  motivacional: "Conteúdo motivacional",
  educativo: "Conteúdo educativo",
  vendas: "Conteúdo de vendas",
};
