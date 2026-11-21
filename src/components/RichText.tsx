import { Fragment, type ReactNode } from "react";

/** Renderiza o markdown simples das respostas da IA (títulos, listas, negrito, itálico). Sem HTML bruto. */
function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={key} className="font-bold text-ink">{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={key}>{p.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(p)) return <code key={key} className="rounded bg-canvas px-1 py-0.5 text-[0.92em]">{p.slice(1, -1)}</code>;
    return <Fragment key={key}>{p}</Fragment>;
  });
}

export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(
      <Tag key={`l${out.length}`} className={list.ordered ? "my-2 list-decimal space-y-1 pl-5" : "my-2 list-disc space-y-1 pl-5"}>
        {list.items.map((it, i) => <li key={i}>{inline(it, `li${out.length}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) { flush(); list = { ordered: isOrdered, items: [] }; }
      list.items.push((bullet ?? ordered)![1]!);
      return;
    }
    flush();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      out.push(<p key={idx} className="mb-1 mt-3 text-[15px] font-extrabold text-ink first:mt-0">{inline(heading[2]!, `h${idx}`)}</p>);
    } else if (line.trim() === "") {
      out.push(<div key={idx} className="h-2" />);
    } else if (/^---+$/.test(line.trim())) {
      out.push(<hr key={idx} className="my-3 border-line" />);
    } else {
      out.push(<p key={idx}>{inline(line, `p${idx}`)}</p>);
    }
  });
  flush();
  return <div className="space-y-0.5 text-[14.5px] leading-relaxed">{out}</div>;
}
