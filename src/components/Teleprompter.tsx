import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FlipHorizontal, Minus, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

function Ctl({ onClick, label, children, active }: { onClick: () => void; label: string; children: React.ReactNode; active?: boolean }) {
  return (

    <button onClick={onClick} aria-label={label} title={label}
      className={cn("grid h-11 w-11 place-items-center rounded-full transition", active ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20")}>{children}</button>
  );
}

/** Teleprompter em tela cheia para gravar lendo o roteiro. */
export function Teleprompter({ text, title, onClose }: { text: string; title: string; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);      // 1–10
  const [size, setSize] = useState(44);       // px
  const [mirror, setMirror] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); toggle(); }
      if (e.key === "ArrowUp") setSpeed((s) => Math.min(10, s + 1));
      if (e.key === "ArrowDown") setSpeed((s) => Math.max(1, s - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); };
  });

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const el = scroller.current;
      if (el) {
        el.scrollTop += ((now - last) / 1000) * speed * 14;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setPlaying(false);
      }
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { setCountdown(null); setPlaying(true); return; }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 800);
    return () => clearTimeout(t);
  }, [countdown]);

  function toggle() {
    if (playing) setPlaying(false);
    else setCountdown(3);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-label="Teleprompter">
      <div className="flex items-center justify-between px-5 py-3 text-sm text-white/60">
        <span className="truncate font-semibold">{title}</span>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Fechar teleprompter"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 h-px bg-brand-400/60 shadow-[0_0_20px_#9775DE]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-black to-transparent" />
        <div ref={scroller} className="h-full overflow-y-auto px-6 sm:px-[12%]" style={{ scrollbarWidth: "none" }}>
          <div style={{ fontSize: size, transform: mirror ? "scaleX(-1)" : undefined }}
            className="whitespace-pre-wrap py-[33vh] text-center font-bold leading-[1.45]">
            {text.replace(/\[[^\]]*\]/g, "").trim() || "Roteiro vazio."}
            <div className="h-[60vh]" />
          </div>
        </div>
        {countdown !== null && countdown > 0 && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 text-[120px] font-extrabold">{countdown}</div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-4">
        <Ctl onClick={() => { if (scroller.current) scroller.current.scrollTop = 0; setPlaying(false); }} label="Voltar ao início"><RotateCcw className="h-4 w-4" /></Ctl>
        <button onClick={toggle} className="flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-[#B05BD8] px-6 font-bold shadow-glow" aria-label={playing ? "Pausar" : "Iniciar"}>
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}{playing ? "Pausar" : "Iniciar"}
        </button>
        <div className="flex items-center gap-1 rounded-full bg-white/10 px-2">
          <button onClick={() => setSpeed((s) => Math.max(1, s - 1))} className="p-2" aria-label="Mais devagar"><Minus className="h-4 w-4" /></button>
          <span className="w-20 text-center text-xs font-semibold">Velocidade {speed}</span>
          <button onClick={() => setSpeed((s) => Math.min(10, s + 1))} className="p-2" aria-label="Mais rápido"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/10 px-2">
          <button onClick={() => setSize((s) => Math.max(24, s - 4))} className="p-2 text-sm font-bold" aria-label="Diminuir letra">A-</button>
          <button onClick={() => setSize((s) => Math.min(96, s + 4))} className="p-2 text-lg font-bold" aria-label="Aumentar letra">A+</button>
        </div>
        <Ctl onClick={() => setMirror((m) => !m)} label="Espelhar texto" active={mirror}><FlipHorizontal className="h-4 w-4" /></Ctl>
      </div>
      <p className="pb-3 text-center text-[11px] text-white/35">Espaço: iniciar/pausar · ↑/↓: velocidade · Esc: sair</p>
    </div>,
    document.body,
  );
}
