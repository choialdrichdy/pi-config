/**
 * Content extraction for web-access.
 *
 * - HTML: @mozilla/readability finds the main article, turndown converts it to
 *   markdown. Falls back to the raw DOM text when readability gives up so the
 *   model still gets something useful.
 * - PDF: unpdf extracts text page by page without any external service.
 */

// These types let us stay fully typed while the heavy lifting happens through
// dynamic imports (unpdf). linkedom and turndown are static imports.
interface PdfDocument {
  numPages: number;
  getPage(index: number): Promise<PdfPage>;
  getMetadata(): Promise<{ info?: Record<string, unknown> }>;
}

interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
}

export interface ReadableResult {
  title: string;
  content: string;
}

export interface PdfResult {
  title: string;
  pages: number;
  text: string;
  truncatedPages: boolean;
}

const MIN_USEFUL_CONTENT = 80;

import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/**
 * Convert an HTML document to readable markdown.
 * Returns null when the page has no useful content (for example a JS-rendered
 * shell or an image-only page).
 */
export function extractReadable(html: string): ReadableResult | null {
  try {
    const { document } = parseHTML(html);
    const documentTitle =
      typeof document.title === "string" ? document.title.trim() : "";
    let fallbackText = "";
    try {
      fallbackText = String(document.textContent ?? "").trim();
    } catch {
      fallbackText = "";
    }

    let title = documentTitle;
    let markdown = "";

    try {
      const reader = new Readability(document as unknown as Document);
      const article = reader.parse();
      if (article && typeof article.content === "string" && article.content.length > 0) {
        markdown = turndown.turndown(article.content);
        title = typeof article.title === "string" && article.title.trim() ? article.title : title;
      }
    } catch {
      markdown = "";
    }

    if (markdown.trim().length < MIN_USEFUL_CONTENT) {
      if (fallbackText.length < MIN_USEFUL_CONTENT) {
        return null;
      }
      return { title, content: fallbackText };
    }
    return { title, content: markdown };
  } catch {
    return null;
  }
}

/** Extract text from a PDF buffer. Throws with a clear message when nothing is extractable. */
export async function extractPdfText(buffer: ArrayBuffer, maxPages: number): Promise<PdfResult> {
  const unpdfModule = await import("unpdf");
  const pdfjsModule = await import("unpdf/pdfjs");

  const { getDocumentProxy } = unpdfModule as {
    getDocumentProxy: (
      data: Uint8Array,
      options?: { verbosity?: number; password?: string },
    ) => Promise<PdfDocument>;
  };
  const { VerbosityLevel } = pdfjsModule as { VerbosityLevel: { ERRORS: number } };

  const pdf: PdfDocument = await getDocumentProxy(new Uint8Array(buffer), {
    verbosity: VerbosityLevel.ERRORS,
  });

  const metadata = await pdf.getMetadata();
  const info = metadata?.info ?? null;
  const metaTitle =
    info && typeof info.Title === "string" ? (info.Title as string).trim() : "";

  const pagesToExtract = Math.max(1, Math.min(pdf.numPages, maxPages));
  const pageParts: string[] = [];
  for (let i = 1; i <= pagesToExtract; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = (textContent.items ?? [])
      .map((item) => item.str ?? "")
      .join("");
    pageParts.push(`<!-- Page ${i} -->\n\n${text.trim()}\n`);
  }

  const combined = pageParts.join("\n");
  if (combined.trim().length < 10) {
    throw new Error(
      "No extractable text found in this PDF. It may be a scanned/image-based PDF that requires OCR.",
    );
  }

  return {
    title: metaTitle || "(PDF document)",
    pages: pdf.numPages,
    text: combined,
    truncatedPages: pdf.numPages > pagesToExtract,
  };
}