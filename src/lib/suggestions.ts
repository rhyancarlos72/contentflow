// Temas prontos para o usuário não precisar digitar. Gerados localmente a partir
// do nicho do projeto (instantâneo, sem gastar gerações de IA).

const TEMPLATES: Record<string, string[]> = {
  geral: [
    "3 erros comuns de quem está começando em {n}",
    "O que ninguém te conta sobre {n}",
    "Mito ou verdade: as crenças mais repetidas sobre {n}",
    "Como eu faria se tivesse que começar do zero em {n}",
    "Um dia na minha rotina trabalhando com {n}",
    "Antes e depois: o que mudou quando entendi {n}",
    "Guia rápido de {n} para iniciantes",
    "A pergunta que mais recebo sobre {n} (e a resposta)",
    "5 hábitos simples que fazem diferença em {n}",
    "O maior aprendizado que tive com {n} este ano",
    "Ferramentas que uso todos os dias para {n}",
    "Por que a maioria desiste de {n} — e como evitar",
    "Checklist de {n} para salvar e consultar depois",
    "Reagindo a conselhos virais sobre {n}",
    "Quanto tempo leva para ver resultado em {n}?",
    "O passo a passo que eu queria ter recebido em {n}",
  ],
};

const shuffle = <T,>(arr: T[], seed: number) => {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** Lista de temas sugeridos para o nicho; `seed` muda a seleção. */
export function topicSuggestions(niche: string, seed = 1, count = 6): string[] {
  const n = niche.trim().toLowerCase() || "o seu nicho";
  return shuffle(TEMPLATES.geral!, seed).slice(0, count).map((t) => t.replace("{n}", n));
}
