import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LessonContentRendererProps {
  /** Hebrew, RTL — Markdown, as documented on LessonBlockContent.coreContent (types/learning.ts). */
  content: string;
}

/**
 * Renders the model's Markdown for a lesson's deep-dive section.
 *
 * No `rehype-raw`, deliberately: `content` is AI-generated text, and this
 * renderer must never turn it into live HTML — react-markdown's default
 * behaviour (raw HTML in the source passed through as inert text, not
 * parsed) is exactly the safe default this depends on, not an accident to
 * "fix" later with a raw-HTML plugin.
 *
 * Styled via the `.masterclass-prose` rule in app/globals.css (mirrors
 * `.prose-editor`/`.summary-content`, this app's other hand-rolled prose
 * system) rather than Tailwind's typography plugin, which isn't installed.
 */
export function LessonContentRenderer({ content }: LessonContentRendererProps) {
  return (
    <div className="masterclass-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // react-markdown already strips <script>/<img onerror> etc. as
          // plain text (no rehype-raw means raw HTML is never parsed into
          // elements at all) — these overrides are purely presentational.
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
