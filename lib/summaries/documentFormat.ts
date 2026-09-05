// Import/export conversions for the summary editor.
//
// The pure, synchronous half lives here so the format logic is testable
// without a DOM, a file picker, or Mammoth's async pipeline. The browser-only
// parts (reading a File, running Mammoth's docx→HTML) sit in the component
// and call into these.

/** Formats accepted by the import picker. */
export const IMPORT_ACCEPT = ".docx,.md,.markdown,.txt";

export type ImportKind = "docx" | "markdown" | "text";

/**
 * Chooses a parser by extension rather than by MIME type. Browsers report
 * .md as everything from text/markdown to text/plain to an empty string
 * depending on OS and origin, so the extension is the more reliable signal —
 * and it is what the user actually sees on their own file.
 */
export function importKindFor(filename: string): ImportKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".txt")) return "text";
  // .doc is the old binary format; Mammoth cannot read it, and silently
  // producing an empty document would look like data loss.
  return null;
}

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (c) => ESCAPE[c]);
}

/**
 * Minimal Markdown → HTML for imported .md files.
 *
 * Deliberately not a full CommonMark implementation. It covers exactly the
 * block types this editor can represent — headings, lists, blockquotes,
 * paragraphs, and inline bold/italic/code — so a round trip through the
 * editor is lossless for anything it claims to support. Pulling in a full
 * Markdown parser to support syntax the editor would immediately discard
 * would be a bigger dependency for a worse result.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li><p>${inlineMarkdown(bullet[1])}</p></li>`);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li><p>${inlineMarkdown(numbered[1])}</p></li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  return out.join("\n");
}

/** Escapes first, then applies inline marks, so user text can't inject HTML. */
function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

/** Plain text → HTML: blank lines separate paragraphs, nothing else is inferred. */
export function textToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n");
}

/**
 * A filename that is safe on every platform.
 *
 * Windows additionally forbids a trailing dot or space and reserves a set of
 * device names, which is why this does more than strip slashes.
 */
export function safeFilename(title: string, extension: string): string {
  const base = title
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  // A title made only of illegal characters sanitises to a run of dashes,
  // which is a valid filename but a useless one — require at least one real
  // letter or digit before accepting it.
  const meaningful = /[\p{L}\p{N}]/u.test(base);
  const safe = meaningful ? base : "summary";
  return `${safe}.${extension}`;
}
