// Leitura de metatags e entidades HTML (separado para poder testar sem rede).

export const decode = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

/** Lê metatags (og:*, twitter:*, description) aceitando aspas simples ou duplas em qualquer ordem. */
export function meta(html: string, ...keys: string[]): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const parsed = tags.map((tag) => {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? "";
    return attrs;
  });
  for (const key of keys) {
    const found = parsed.find((a) => (a.property ?? a.name ?? "").toLowerCase() === key);
    if (found?.content) return decode(found.content).trim();
  }
  return "";
}

const toNumber = (s: string) => {
  const m = s.trim().toLowerCase().match(/^([\d.,]+)\s*(k|mil|m|mi)?$/);
  if (!m) return undefined;
  const base = Number(m[2] ? m[1]!.replace(",", ".") : m[1]!.replace(/[.,]/g, ""));
  const mult = m[2] === "k" || m[2] === "mil" ? 1_000 : m[2] === "m" || m[2] === "mi" ? 1_000_000 : 1;
  return Number.isFinite(base) ? Math.round(base * mult) : undefined;
};

/**
 * Extrai curtidas, comentários, autor e legenda da descrição pública do Instagram,
 * ex.: '1,234 likes, 56 comments - ana on May 1, 2026: "legenda"' (ou em português).
 */
export function parseInstagramDescription(desc: string): { likes?: number; comments?: number; author?: string; caption?: string } {
  const out: { likes?: number; comments?: number; author?: string; caption?: string } = {};
  const likes = desc.match(/([\d.,]+\s*(?:k|mil|mi|m)?)\s+(?:likes?|curtidas?)/i);
  const comments = desc.match(/([\d.,]+\s*(?:k|mil|mi|m)?)\s+(?:comments?|comentários?)/i);
  if (likes) out.likes = toNumber(likes[1]!);
  if (comments) out.comments = toNumber(comments[1]!);
  const tail = desc.match(/-\s*([\w.]+)\s+(?:on|em)\s+[^:]+:\s*["“]?([\s\S]*?)["”]?\s*\.?$/);
  if (tail) {
    out.author = tail[1];
    out.caption = tail[2]!.trim();
  }
  return out;
}
