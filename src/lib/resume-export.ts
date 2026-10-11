export const RESUME_TEMPLATES = {
  classic: { label: "Classic Professional", font: "Times New Roman", pdfFont: "times", size: 11 },
  modern: { label: "Modern Minimal", font: "Arial", pdfFont: "helvetica", size: 11 },
  technical: { label: "Technical Specialist", font: "Courier New", pdfFont: "courier", size: 10 },
} as const;

export type ResumeTemplate = keyof typeof RESUME_TEMPLATES;

export function validateResumeExport(version: { status: string; tailored_content: string | null }) {
  if (version.status !== "approved")
    throw new Error("Review and approve this version before exporting.");
  if (!version.tailored_content?.trim()) throw new Error("This version has no resume content.");
  return version.tailored_content;
}

export async function createResumeExport(
  content: string,
  template: ResumeTemplate,
  format: "pdf" | "docx",
): Promise<Blob> {
  const style = RESUME_TEMPLATES[template];
  if (format === "docx") {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const document = new Document({
      styles: { default: { document: { run: { font: style.font, size: style.size * 2 } } } },
      sections: [
        {
          properties: {},
          children: content.split("\n").map(
            (line, index) =>
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: line,
                    bold: index === 0,
                    size: index === 0 ? 32 : style.size * 2,
                  }),
                ],
              }),
          ),
        },
      ],
    });
    return Packer.toBlob(document);
  }
  // Built-in PDF fonts cannot represent every Unicode script; never silently lose identity text.
  if (
    /[^\u0020-\u007e\u00a0-\u00ff\u2013-\u2014\u2018-\u201d\u2022\u2026]/u.test(
      content.replaceAll("\n", "").replaceAll("\r", "").replaceAll("\t", ""),
    )
  ) {
    throw new Error("Use DOCX for text requiring a Unicode font.");
  }
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ unit: "mm", format: "a4" });
  document.setFont(style.pdfFont);
  document.setFontSize(style.size);
  let y = 20;
  for (const paragraph of content.split("\n")) {
    const lines: string[] = document.splitTextToSize(paragraph || " ", 170);
    for (const line of lines) {
      if (y > 277) {
        document.addPage();
        y = 20;
      }
      document.text(line, 20, y);
      y += 5.5;
    }
  }
  return document.output("blob");
}
