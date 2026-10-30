import type { MemoryKind, Pillar, PostStatus, ProductionStage, TaskPriority } from "@/types";

export const APP_NAME = "ContentFlow AI";
export const SLOGAN = "Da ideia à publicação. Seu conteúdo, com estratégia e inteligência.";

export const PLATFORMS = [
  { value: "instagram", label: "Instagram", color: "#D6337A" },
  { value: "tiktok", label: "TikTok", color: "#202033" },
  { value: "youtube", label: "YouTube", color: "#E5352B" },
  { value: "linkedin", label: "LinkedIn", color: "#0A66C2" },
  { value: "facebook", label: "Facebook", color: "#1877F2" },
  { value: "threads", label: "Threads", color: "#3B3B4F" },
  { value: "x", label: "X (Twitter)", color: "#3B3B4F" },
  { value: "pinterest", label: "Pinterest", color: "#C8232C" },
  { value: "blog", label: "Blog", color: "#20B486" },
] as const;

export const platformLabel = (v: string | null | undefined) =>
  PLATFORMS.find((p) => p.value === v)?.label ?? (v || "—");
export const platformColor = (v: string | null | undefined) =>
  PLATFORMS.find((p) => p.value === v)?.color ?? "#858399";

export const FORMATS = [
  { value: "reels", label: "Reels" },
  { value: "carrossel", label: "Carrossel" },
  { value: "stories", label: "Stories" },
  { value: "post", label: "Post estático" },
  { value: "video_longo", label: "Vídeo longo" },
  { value: "shorts", label: "Shorts" },
  { value: "live", label: "Live" },
  { value: "artigo", label: "Artigo / texto" },
] as const;
export const formatLabel = (v: string | null | undefined) =>
  FORMATS.find((f) => f.value === v)?.label ?? (v || "—");

export const POST_STATUSES: { value: PostStatus; label: string; dot: string; bg: string; text: string }[] = [
  { value: "ideia", label: "Ideia", dot: "#B9B7C9", bg: "#F3F2F8", text: "#5E5C73" },
  { value: "planejado", label: "Planejado", dot: "#9775DE", bg: "#F4F0FC", text: "#5935A8" },
  { value: "roteiro_pronto", label: "Roteiro pronto", dot: "#4F7BE8", bg: "#ECF2FE", text: "#2F57B8" },
  { value: "gravacao_pendente", label: "Gravação pendente", dot: "#E8A33D", bg: "#FDF5E7", text: "#9A6213" },
  { value: "em_edicao", label: "Em edição", dot: "#E8743D", bg: "#FDF0E9", text: "#A44B1D" },
  { value: "aprovado", label: "Aprovado", dot: "#2BA7C2", bg: "#E6F6F9", text: "#16758A" },
  { value: "agendado", label: "Agendado", dot: "#7952D6", bg: "#EDE6FB", text: "#472A86" },
  { value: "publicado", label: "Publicado", dot: "#20B486", bg: "#E3F6EF", text: "#127757" },
];
export const statusMeta = (s: PostStatus) => POST_STATUSES.find((x) => x.value === s)!;

export const STAGES: { value: ProductionStage; label: string; color: string }[] = [
  { value: "ideias", label: "Ideias", color: "#B9B7C9" },
  { value: "planejamento", label: "Planejamento", color: "#9775DE" },
  { value: "roteiro", label: "Roteiro", color: "#4F7BE8" },
  { value: "gravacao", label: "Gravação", color: "#E8A33D" },
  { value: "edicao", label: "Edição", color: "#E8743D" },
  { value: "revisao", label: "Revisão", color: "#2BA7C2" },
  { value: "publicado", label: "Publicado", color: "#20B486" },
];

export const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: "baixa", label: "Baixa", color: "#858399" },
  { value: "media", label: "Média", color: "#4F7BE8" },
  { value: "alta", label: "Alta", color: "#E8743D" },
  { value: "urgente", label: "Urgente", color: "#D93A4A" },
];

export const PILLARS: { value: Pillar; label: string; color: string }[] = [
  { value: "educativo", label: "Educativo", color: "#4F7BE8" },
  { value: "emocional", label: "Emocional", color: "#D6337A" },
  { value: "informativo", label: "Informativo", color: "#2BA7C2" },
  { value: "entretenimento", label: "Entretenimento", color: "#E8A33D" },
  { value: "vendas", label: "Vendas", color: "#20B486" },
  { value: "autoridade", label: "Autoridade", color: "#5935A8" },
  { value: "comunidade", label: "Comunidade", color: "#E8743D" },
];
export const pillarMeta = (p: string | null | undefined) => PILLARS.find((x) => x.value === p);

export const GOALS = [
  "Crescer seguidores",
  "Aumentar engajamento",
  "Construir autoridade",
  "Gerar vendas",
  "Fortalecer marca pessoal",
  "Educar o público",
  "Criar comunidade",
] as const;

export const TONES = [
  { value: "natural", label: "Natural" },
  { value: "profissional", label: "Profissional" },
  { value: "descontraido", label: "Descontraído" },
  { value: "inspirador", label: "Inspirador" },
  { value: "emocional", label: "Emocional" },
  { value: "persuasivo", label: "Persuasivo" },
  { value: "educativo", label: "Educativo" },
] as const;

export const PROJECT_KINDS = [
  { value: "marca_pessoal", label: "Marca pessoal" },
  { value: "loja_virtual", label: "Loja virtual" },
  { value: "perfil_profissional", label: "Perfil profissional" },
  { value: "projeto_educacional", label: "Projeto educacional" },
  { value: "agencia", label: "Agência" },
  { value: "cliente", label: "Cliente" },
  { value: "outro", label: "Outro" },
] as const;

export const MEMORY_KINDS: { value: MemoryKind; label: string; hint: string }[] = [
  { value: "estilo", label: "Estilo de escrita", hint: "Ex.: frases curtas, sem jargão, usa exemplos do dia a dia" },
  { value: "tom_de_voz", label: "Tom de voz", hint: "Ex.: próximo, bem-humorado, sem ser informal demais" },
  { value: "publico", label: "Público-alvo", hint: "Ex.: mulheres 25-40 que estão começando a investir" },
  { value: "objetivo", label: "Objetivos", hint: "Ex.: vender a mentoria em dezembro" },
  { value: "preferencia", label: "Preferências", hint: "Ex.: prefiro carrosséis a vídeos longos" },
  { value: "palavra_evitar", label: "Palavras a evitar", hint: "Ex.: “guru”, “fórmula mágica”" },
  { value: "assunto_abordado", label: "Assuntos já abordados", hint: "Preenchido automaticamente ao aprovar/publicar" },
  { value: "conteudo_aprovado", label: "Conteúdos aprovados", hint: "Preenchido automaticamente ao aprovar" },
];

export const PLAN_INFO = {
  free: { name: "Gratuito", price: 0 },
  creator: { name: "Creator", price: 19.9 },
  pro: { name: "Pro", price: 39.9 },
} as const;

/** Recursos de cada plano (espelha plan_limits.features no banco). */
export const FEATURE_LABELS: Record<string, string> = {
  ai_plan: "Planejamento inteligente",
  ai_scripts: "Gerador de roteiros",
  ai_captions: "Gerador de legendas",
  ai_cta: "Gerador de CTAs",
  analytics_manual: "Analytics",
  library: "Biblioteca de conteúdo",
  ai_analytics: "Análise de resultados com IA",
  advanced_memory: "Memória estratégica avançada",
  advanced_analytics: "Analytics avançado",
  reports: "Relatórios",
};

export const minimumPlanFor = (feature: string): "creator" | "pro" =>
  ["advanced_memory", "advanced_analytics", "reports", "collaboration"].includes(feature) ? "pro" : "creator";
