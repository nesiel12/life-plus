"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  Bold,
  Check,
  Download,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Redo2,
  Table as TableIcon,
  Undo2,
  Upload,
} from "lucide-react";
import { EntityMention } from "@/components/features/summaries/EntityMention";
import { buildMentionSuggestion } from "@/components/features/summaries/mentionSuggestion";
import { IMPORT_ACCEPT, importKindFor, markdownToHtml, safeFilename, textToHtml } from "@/lib/summaries/documentFormat";
import { extractMentions, type EntitySources } from "@/lib/summaries/entityRef";
import { cn } from "@/lib/utils";

const AUTOSAVE_DEBOUNCE_MS = 1200;

export interface SummaryDraft {
  title: string;
  html: string;
  text: string;
  mentions: ReturnType<typeof extractMentions>;
}

interface SummaryEditorProps {
  initialTitle?: string;
  initialHtml?: string;
  sources: EntitySources;
  /** Debounced background save. Called with the full draft. */
  onAutoSave: (draft: SummaryDraft) => Promise<void>;
  /** Explicit save-and-finish. */
  onSave?: (draft: SummaryDraft) => Promise<void>;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "focus-ring grid size-8 place-items-center rounded-lg transition-colors",
        active ? "glass-control glass-control-active text-foreground" : "text-muted hover:bg-fill-subtle hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// The rich-text summary editor.
//
// TipTap (ProseMirror) rather than a hand-rolled contentEditable. Selection
// handling, undo across composed input, and table editing are the three
// things a from-scratch editor gets wrong first, and Hebrew RTL with mixed
// LTR runs makes selection harder still — ProseMirror's document model is
// exactly the part that would take longest to rebuild badly.
export function SummaryEditor({ initialTitle = "", initialHtml, sources, onAutoSave, onSave }: SummaryEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Read inside the debounced callback so it always sees the latest title
  // without the timer being torn down and restarted on every keystroke.
  const titleRef = useRef(title);
  titleRef.current = title;

  const editor = useEditor({
    // Next renders this on the server first; without it React logs a
    // hydration mismatch for the editor's generated DOM.
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "התחל לכתוב את הסיכום… הקלד @ כדי לקשר ספר, רב או איש קשר." }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      EntityMention.configure({ suggestion: buildMentionSuggestion(() => sources) }),
    ],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        // Editing surface, not the toolbar — the toolbar carries the glass.
        class: "prose-editor focus:outline-none",
        dir: "rtl",
      },
    },
  });

  const collect = useCallback(
    (ed: Editor): SummaryDraft => {
      const html = ed.getHTML();
      return { title: titleRef.current, html, text: ed.getText(), mentions: extractMentions(html) };
    },
    []
  );

  // Debounced autosave. Restarting the timer on every change means a burst of
  // typing produces exactly one write once the person pauses, rather than one
  // per keystroke.
  const scheduleSave = useCallback(
    (ed: Editor) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setSaveState("saving");
        onAutoSave(collect(ed))
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"));
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [collect, onAutoSave]
  );

  useEffect(() => {
    if (!editor) return;
    const handler = () => scheduleSave(editor);
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor, scheduleSave]);

  // Flush on unmount. Without this, closing the editor within the debounce
  // window silently discards the last edits — which is exactly the "pause and
  // resume" case this feature exists for.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function handleImport(file: File) {
    setImporting(true);
    setImportError(null);
    try {
      const kind = importKindFor(file.name);
      if (!kind) {
        setImportError("אפשר לייבא רק קבצי .docx, .md או .txt. (פורמט .doc הישן אינו נתמך.)");
        return;
      }

      let html: string;
      if (kind === "docx") {
        // Imported lazily: Mammoth is a large parser and most sessions never
        // import a Word file, so it should not sit in the initial bundle.
        const mammoth = await import("mammoth");
        const buffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        html = result.value;
      } else if (kind === "markdown") {
        html = markdownToHtml(await file.text());
      } else {
        html = textToHtml(await file.text());
      }

      if (!html.trim()) {
        setImportError("הקובץ נראה ריק — לא ייבאנו כלום.");
        return;
      }

      editor?.commands.setContent(html);
      // Seed the title from the filename only when there isn't one, so an
      // import never silently renames the user's own summary.
      if (!titleRef.current.trim()) {
        setTitle(file.name.replace(/\.[^.]+$/, ""));
      }
      if (editor) scheduleSave(editor);
    } catch {
      setImportError("לא הצלחנו לקרוא את הקובץ. ייתכן שהוא פגום.");
    } finally {
      setImporting(false);
      // Reset so re-picking the same file fires change again.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function download(content: string, extension: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFilename(title, extension);
    a.click();
    // Revoking immediately can cancel the download in some browsers; a tick
    // later is enough for the click to have been dispatched.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportMarkdown() {
    if (!editor) return;
    const TurndownService = (await import("turndown")).default;
    const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
    const body = turndown.turndown(editor.getHTML());
    download(`# ${title || "סיכום"}\n\n${body}\n`, "md", "text/markdown;charset=utf-8");
  }

  function exportDocx() {
    if (!editor) return;
    // A Word-compatible HTML document rather than a real OOXML package.
    // Word opens this correctly and keeps headings, lists, bold and tables,
    // which is what matters here; producing a true .docx would mean shipping
    // a full OOXML writer for an export path. The extension is .doc,
    // deliberately, because labelling an HTML file .docx would make Word
    // complain about a corrupt package on open.
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${editor.getHTML()}</body></html>`;
    download(html, "doc", "application/msword;charset=utf-8");
  }

  if (!editor) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        טוען עורך…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleSave(editor);
        }}
        placeholder="כותרת הסיכום"
        aria-label="כותרת הסיכום"
        className="focus-ring w-full rounded-xl border border-hairline-card bg-transparent px-3 py-2 text-lg font-medium text-foreground placeholder:text-muted"
      />

      {/* Toolbar — the Liquid Glass surface, per the design constraint. */}
      <div className="glass-control flex flex-wrap items-center gap-1 rounded-xl p-1.5">
        <ToolbarButton label="כותרת ראשית" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton label="כותרת משנה" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="כותרת שלישית" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={15} />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-hairline-card" aria-hidden />

        <ToolbarButton label="מודגש" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton label="נטוי" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={15} />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-hairline-card" aria-hidden />

        <ToolbarButton label="רשימת תבליטים" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton label="רשימה ממוספרת" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton label="ציטוט" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="הוסף טבלה"
          active={editor.isActive("table")}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon size={15} />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-hairline-card" aria-hidden />

        <ToolbarButton label="בטל" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={15} />
        </ToolbarButton>
        <ToolbarButton label="בצע שוב" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={15} />
        </ToolbarButton>

        <span className="flex-1" />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-fill-subtle hover:text-foreground disabled:opacity-50"
        >
          {importing ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Upload size={13} aria-hidden />}
          ייבוא
        </button>
        <button
          type="button"
          onClick={exportMarkdown}
          className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
        >
          <Download size={13} aria-hidden />
          MD
        </button>
        <button
          type="button"
          onClick={exportDocx}
          className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
        >
          <Download size={13} aria-hidden />
          Word
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
        }}
        className="hidden"
        aria-hidden
      />

      {importError && <p className="text-xs text-accent-family">{importError}</p>}

      <div className="min-h-[24rem] rounded-2xl border border-hairline-card bg-surface p-5">
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {saveState === "saving" && "שומר…"}
          {saveState === "saved" && (
            <span className="flex items-center gap-1 text-accent-health">
              <Check size={12} aria-hidden />
              נשמר
            </span>
          )}
          {saveState === "error" && <span className="text-accent-family">השמירה נכשלה — ננסה שוב בעריכה הבאה.</span>}
        </span>

        {onSave && (
          <button
            type="button"
            onClick={() => {
              setSaveState("saving");
              onSave(collect(editor))
                .then(() => setSaveState("saved"))
                .catch(() => setSaveState("error"));
            }}
            className="glass-control focus-ring rounded-lg px-4 py-2 text-xs font-medium text-foreground"
          >
            שמור וסיים
          </button>
        )}
      </div>
    </div>
  );
}
