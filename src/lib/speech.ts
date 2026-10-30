// Reconhecimento de voz nativo do navegador (Web Speech API), em português.
// Funciona no Chrome, Edge, Safari e na maioria dos Androids; no Firefox o
// recurso não existe e os botões de microfone ficam ocultos.
import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const Ctor: RecognitionCtor | undefined = typeof window === "undefined" ? undefined
  : (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export const speechSupported = Boolean(Ctor);

const ERRORS: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone no navegador para ditar.",
  "service-not-allowed": "Permita o uso do microfone no navegador para ditar.",
  "no-speech": "Não ouvi nada. Tente falar mais perto do microfone.",
  "audio-capture": "Nenhum microfone encontrado.",
  network: "Sem conexão para reconhecer a voz.",
};

/**
 * Dita texto. `onFinal` recebe cada frase concluída; `interim` mostra o que
 * está sendo falado em tempo real.
 */
export function useDictation(onFinal: (text: string) => void, onError?: (msg: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  const errorRef = useRef(onError);
  useEffect(() => { finalRef.current = onFinal; errorRef.current = onError; });

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    if (!Ctor) return;
    rec.current?.abort();
    const r = new Ctor();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const text = res[0].transcript;
        if (res.isFinal) finalRef.current(text.trim());
        else live += text;
      }
      setInterim(live);
    };
    r.onerror = (e) => { if (e.error !== "aborted") errorRef.current?.(ERRORS[e.error] ?? "Não foi possível usar o microfone."); };
    r.onend = () => { setListening(false); setInterim(""); };
    rec.current = r;
    r.start();
    setListening(true);
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported: speechSupported, listening, interim, start, stop, toggle: () => (listening ? stop() : start()) };
}

/** Junta o texto ditado ao que já existe, cuidando de espaço e maiúscula. */
export function appendDictation(current: string, spoken: string) {
  if (!spoken) return current;
  const text = spoken.charAt(0).toUpperCase() + spoken.slice(1);
  if (!current.trim()) return text;
  const sep = /[.!?]\s*$/.test(current) ? " " : /\s$/.test(current) ? "" : " ";
  return current + sep + (/[.!?]\s*$/.test(current) ? text : spoken);
}

/** Leitura em voz alta (pt-BR) com a voz do sistema. */
export function speak(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("pt-br"));
  if (voice) u.voice = voice;
  u.rate = 1.02;
  u.onend = () => onEnd?.();
  window.speechSynthesis.speak(u);
  return true;
}
