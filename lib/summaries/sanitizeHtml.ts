// HTML sanitiser for stored summary content.
//
// Why this exists even though the HTML comes from our own editor: the content
// makes a round trip through the database and is rendered with
// dangerouslySetInnerHTML, and it can originate from an imported .docx or a
// fragment pasted from any website. That is attacker-influenced input even
// when the "attacker" is a page the user copied from, and rendering it
// unfiltered is a textbook stored-XSS hole.
//
// A regex-based allowlist rather than a DOM-based one, deliberately: this
// runs during server rendering too, where there is no DOMParser, and pulling
// in a full sanitiser (DOMPurify + jsdom) for a tag set this small would cost
// more than it protects. The allowlist is exactly what the editor can emit,
// so nothing legitimate is stripped — a narrower set than a general-purpose
// sanitiser would allow, which is the safer direction to err.

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
  "span",
]);

// Only what the mention chip needs, plus table spans. Notably absent: every
// on* handler, style, href, src, and anything else that can execute or load.
const ALLOWED_ATTRS = new Set([
  "data-entity-type",
  "data-entity-id",
  "data-label",
  "class",
  "colspan",
  "rowspan",
]);

// `class` is allowed for the mention chip and table styling, so it is
// constrained to the specific values the editor emits rather than accepting
// arbitrary class strings (which could otherwise be used to abuse layout).
const ALLOWED_CLASSES = new Set(["entity-mention"]);

function sanitizeAttributes(raw: string): string {
  const kept: string[] = [];
  const attrPattern = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

  for (const match of raw.matchAll(attrPattern)) {
    const [, name, value] = match;
    const lower = name.toLowerCase();
    if (!ALLOWED_ATTRS.has(lower)) continue;

    if (lower === "class") {
      const classes = value.split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c));
      if (classes.length === 0) continue;
      kept.push(`class="${classes.join(" ")}"`);
      continue;
    }

    // Defence in depth: an allowed attribute must still never carry a
    // script-bearing value.
    if (/javascript:|data:text\/html|vbscript:/i.test(value)) continue;
    kept.push(`${lower}="${escapeAttr(value)}"`);
  }

  return kept.length > 0 ? ` ${kept.join(" ")}` : "";
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeSummaryHtml(html: string): string {
  // Remove whole dangerous elements *with their contents* first. Stripping
  // only the tags would leave the script body behind as visible text — and,
  // worse, `<style>` contents can still affect the page.
  let out = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object\s*>/gi, "")
    .replace(/<embed\b[\s\S]*?>/gi, "")
    // Comments can hide conditional-comment payloads in older engines.
    .replace(/<!--[\s\S]*?-->/g, "");

  // Then filter what remains tag by tag.
  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_full, slash: string, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (slash) return `</${name}>`;
    return `<${name}${sanitizeAttributes(attrs)}>`;
  });

  return out;
}
