import type { Script } from "@/types";
import { fmtDate } from "./utils";
import { platformLabel } from "./constants";

/** Exporta um roteiro como PDF (carregado sob demanda). */
export async function exportScriptPdf(script: Script) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  doc.setFillColor(121, 82, 214);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(32, 32, 51);
  for (const line of doc.splitTextToSize(script.title, width)) {
    doc.text(line, margin, y);
    y += 24;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(133, 131, 153);
  const meta = [
    script.platform && platformLabel(script.platform),
    script.duration_seconds && `${script.duration_seconds}s`,
    `Atualizado em ${fmtDate(script.updated_at)}`,
  ].filter(Boolean).join("  ·  ");
  doc.text(meta, margin, y);
  y += 28;

  const write = (text: string, size: number, color: [number, number, number]) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += size * 1.55;
    }
  };
  write(script.content || "(roteiro vazio)", 12, [32, 32, 51]);
  if (script.notes) {
    y += 16;
    doc.setFont("helvetica", "bold");
    write("Observações", 12, [89, 53, 168]);
    doc.setFont("helvetica", "normal");
    write(script.notes, 11, [80, 78, 99]);
  }
  doc.setFontSize(8);
  doc.setTextColor(185, 183, 201);
  doc.text("Gerado com ContentFlow AI", margin, pageHeight - 28);
  doc.save(`${script.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "roteiro"}.pdf`);
}
