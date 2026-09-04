// XML Prompt Compiler (LifeOS Pillar 2).
//
// Turns a raw idea plus whatever context is to hand into the tag-structured
// prompt shape Anthropic's own guidance recommends. Pure string building: no
// model call, because compiling structure is a deterministic transform and
// asking a model to format XML is both slower and less reliable than doing
// it directly.
//
// The escaping below is the part that actually matters. Pasted context is
// usually code or notes, and code contains `<`, `>` and `&` constantly — a
// naive template would emit malformed XML the moment someone pastes a
// generic type or an HTML snippet, and the receiving model would silently
// misread the section boundaries.

export interface PromptSection {
  tag: string;
  content: string;
}

export interface CompilePromptInput {
  /** The raw ask, in the user's own words. */
  idea: string;
  /** Background the model needs: notes, file excerpts, prior decisions. */
  context?: string;
  /** Hard rules the output must satisfy. */
  constraints?: string[];
  /** Optional worked examples. */
  examples?: { input: string; output: string }[];
  /** Ask the model to reason inside <thinking> before answering. */
  includeThinking?: boolean;
  /** What the answer should look like. */
  outputFormat?: string;
}

/** XML text-node escaping. Order matters — `&` first, or the escapes
 *  introduced below would themselves get re-escaped. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Tag names come from callers, not users, but validating keeps a typo from
 *  silently producing an unparseable document. */
function safeTag(tag: string): string {
  return /^[A-Za-z][\w-]*$/.test(tag) ? tag : "section";
}

function block(tag: string, content: string): string {
  const t = safeTag(tag);
  return `<${t}>\n${escapeXml(content.trim())}\n</${t}>`;
}

/**
 * Compiles the structured prompt.
 *
 * Section order is deliberate and follows the documented guidance: context
 * before the task (so the model reads background before instructions),
 * constraints and examples after the task, and `<thinking>` last as the
 * explicit instruction to reason before answering.
 */
export function compileXmlPrompt(input: CompilePromptInput): string {
  const parts: string[] = [];

  if (input.context?.trim()) {
    parts.push(block("context", input.context));
  }

  parts.push(block("task", input.idea));

  const constraints = (input.constraints ?? []).map((c) => c.trim()).filter(Boolean);
  if (constraints.length > 0) {
    const items = constraints.map((c) => `  <constraint>${escapeXml(c)}</constraint>`).join("\n");
    parts.push(`<constraints>\n${items}\n</constraints>`);
  }

  const examples = input.examples ?? [];
  if (examples.length > 0) {
    const rendered = examples
      .map(
        (ex) =>
          `  <example>\n    <input>${escapeXml(ex.input.trim())}</input>\n` +
          `    <output>${escapeXml(ex.output.trim())}</output>\n  </example>`
      )
      .join("\n");
    parts.push(`<examples>\n${rendered}\n</examples>`);
  }

  if (input.outputFormat?.trim()) {
    parts.push(block("output_format", input.outputFormat));
  }

  if (input.includeThinking) {
    parts.push(
      "<thinking>\nחשוב שלב אחר שלב לפני שאתה עונה. אל תציג את המחשבות האלה בתשובה הסופית.\n</thinking>"
    );
  }

  return parts.join("\n\n");
}

/**
 * Context Stacking (same pillar): folds several named sources into one
 * `<context>` body, each in its own labelled sub-block so the model can tell
 * a note from a code file rather than reading one undifferentiated wall.
 * Empty sources are dropped instead of emitting hollow tags.
 */
export function stackContext(sources: { label: string; content: string }[]): string {
  return sources
    .filter((s) => s.content.trim())
    .map((s) => `<source name="${escapeXml(s.label)}">\n${escapeXml(s.content.trim())}\n</source>`)
    .join("\n\n");
}
