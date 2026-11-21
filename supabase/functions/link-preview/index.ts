// Edge Function: link-preview
// Lê os dados públicos de um link de Reels/TikTok/YouTube/post: título ou
// legenda, autor e capa. Usa oEmbed público quando a rede oferece (TikTok,
// YouTube) e as metatags Open Graph nos demais casos. Instagram e Facebook
// muitas vezes escondem a legenda de visitantes: o app pede para colar o texto.
import { HttpError, json, serve } from "../_shared/http.ts";
import { assertPublicHttpsUrl, safeFetch } from "../_shared/net.ts";
import { authenticate } from "../_shared/supabase.ts";
import { decode, meta, parseInstagramDescription } from "./meta.ts";

function detectPlatform(host: string): string {
  const h = host.replace(/^www\.|^m\./, "");
  if (h.endsWith("instagram.com")) return "instagram";
  if (h.endsWith("tiktok.com")) return "tiktok";
  if (h === "youtu.be" || h.endsWith("youtube.com")) return "youtube";
  if (h.endsWith("facebook.com") || h === "fb.watch") return "facebook";
  if (h.endsWith("linkedin.com")) return "linkedin";
  if (h === "x.com" || h.endsWith("twitter.com")) return "x";
  if (h.endsWith("threads.net") || h.endsWith("threads.com")) return "threads";
  if (h.endsWith("pinterest.com") || h === "pin.it") return "pinterest";
  return "outro";
}

function detectFormat(url: URL, platform: string): string {
  const p = url.pathname.toLowerCase();
  if (platform === "instagram") return p.includes("/reel") ? "reels" : p.includes("/stories") ? "stories" : "post";
  if (platform === "youtube") return p.includes("/shorts") ? "shorts" : "video_longo";
  if (platform === "tiktok") return "reels";
  return "post";
}

async function oembed(endpoint: string) {
  try {
    const res = await safeFetch(endpoint, { accept: "application/json", maxBytes: 200_000 });
    if (!res.ok) return null;
    return JSON.parse(new TextDecoder().decode(res.bytes)) as { title?: string; author_name?: string; thumbnail_url?: string };
  } catch {
    return null;
  }
}

serve(async (req) => {
  await authenticate(req);
  const { url: raw } = await req.json().catch(() => ({})) as { url?: string };
  if (!raw) throw new HttpError(400, "invalid_url", "Cole o link do conteúdo.");
  const url = assertPublicHttpsUrl(raw);
  const platform = detectPlatform(url.hostname.toLowerCase());
  const out = {
    url: url.toString(), platform, format: detectFormat(url, platform), title: "", caption: "", author: "", thumbnail: "",
    metrics: {} as { likes?: number; comments?: number }, limited: false,
  };

  if (platform === "tiktok" || platform === "youtube") {
    const endpoint = platform === "tiktok"
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(out.url)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(out.url)}`;
    const data = await oembed(endpoint);
    if (data) {
      out.caption = platform === "tiktok" ? (data.title ?? "") : "";
      out.title = platform === "youtube" ? (data.title ?? "") : (data.title ?? "").slice(0, 120);
      out.author = data.author_name ?? "";
      out.thumbnail = data.thumbnail_url ?? "";
    }
  }

  if (!out.caption && !out.title) {
    try {
      const res = await safeFetch(out.url, { accept: "text/html", maxBytes: 1_500_000 });
      const html = new TextDecoder().decode(res.bytes);
      const description = meta(html, "og:description", "twitter:description", "description");
      out.title = meta(html, "og:title", "twitter:title") || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
      out.caption = description;
      if (platform === "instagram" && description) {
        const ig = parseInstagramDescription(description);
        if (ig.caption) out.caption = ig.caption;
        if (ig.author) out.author = ig.author;
        out.metrics = { likes: ig.likes, comments: ig.comments };
      }
      out.thumbnail ||= meta(html, "og:image", "twitter:image");
      out.author ||= meta(html, "og:site_name");
    } catch {
      // Página indisponível para visitantes: segue com o que houver.
    }
  }

  out.title = out.title.slice(0, 200);
  out.caption = out.caption.slice(0, 4000);
  out.limited = !out.caption;
  return json(out);
});
