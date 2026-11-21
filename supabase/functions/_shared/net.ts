// Busca de URLs externas com proteção contra SSRF: apenas https, sem IPs
// privados/locais, redirecionamentos revalidados, tempo e tamanho limitados.
import { HttpError } from "./http.ts";

const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localdomain|metadata\.google\.internal)$/i;

function isPrivateIp(host: string): boolean {
  if (/^\[?[0-9a-f:]+\]?$/i.test(host) && host.includes(":")) return true; // bloqueia IPv6 literal
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "invalid_url", "Link inválido. Cole o endereço completo, começando com https://");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "invalid_url", "Use um link que comece com https://");
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOST.test(host) || isPrivateIp(host) || !host.includes(".")) {
    throw new HttpError(400, "invalid_url", "Esse endereço não pode ser analisado.");
  }
  if (url.port && url.port !== "443") throw new HttpError(400, "invalid_url", "Esse endereço não pode ser analisado.");
  return url;
}

export async function safeFetch(raw: string, opts: { maxBytes?: number; timeoutMs?: number; accept?: string; userAgent?: string } = {}) {
  const { maxBytes = 2_000_000, timeoutMs = 8000, accept = "*/*", userAgent } = opts;
  let url = assertPublicHttpsUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: accept,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "User-Agent": userAgent ?? "Mozilla/5.0 (compatible; ContentFlowAI-LinkPreview/1.0)",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = assertPublicHttpsUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); break; }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(Math.min(size, maxBytes));
    let offset = 0;
    for (const c of chunks) { bytes.set(c.subarray(0, bytes.length - offset), offset); offset += c.byteLength; if (offset >= bytes.length) break; }
    return { status: res.status, ok: res.ok, url: url.toString(), contentType: res.headers.get("content-type") ?? "", bytes };
  }
  throw new HttpError(400, "too_many_redirects", "O link redireciona demais.");
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Baixa uma imagem pública (capa/miniatura) como base64. */
export async function fetchImageBase64(raw: string): Promise<{ mediaType: string; data: string } | null> {
  try {
    const res = await safeFetch(raw, { maxBytes: 5_000_000, accept: "image/*" });
    const mediaType = res.contentType.split(";")[0]!.trim().toLowerCase();
    if (!res.ok || !IMAGE_TYPES.includes(mediaType) || res.bytes.length >= 5_000_000) return null;
    return { mediaType, data: bytesToBase64(res.bytes) };
  } catch {
    return null;
  }
}

/** Imagem enviada pelo usuário como data URL (print/capa). */
export function parseDataUrlImage(dataUrl: string): { mediaType: string; data: string } | null {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[2]!.length > 7_000_000) return null;
  return { mediaType: m[1]!, data: m[2]! };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
