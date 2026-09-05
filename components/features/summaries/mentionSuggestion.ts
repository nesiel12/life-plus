import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { ENTITY_LABELS, searchEntities, type EntityCandidate, type EntitySources } from "@/lib/summaries/entityRef";

// The @mention dropdown.
//
// Rendered with plain DOM rather than a React portal. TipTap's suggestion
// plugin lives inside ProseMirror's own lifecycle, and bridging it into React
// means either a portal that fights ProseMirror for focus or a renderer that
// re-mounts on every keystroke. A small imperative popup is both simpler and
// better behaved here: it never steals focus from the editor, which is what
// keeps typing continuous while the list filters.
//
// Ranking and matching are not implemented here — they come from
// searchEntities in lib/summaries/entityRef.ts, which is pure and tested.

const MAX_VISIBLE = 8;

// Typed against TipTap's own MentionNodeAttrs rather than a hand-written
// shape. `command` is contravariant in its attrs, so declaring a *wider*
// attrs type here (one adding entityType) makes the whole suggestion object
// unassignable to Mention.configure — the error surfaces at the call site as
// an unreadable variance complaint. Aligning to the library's type and
// widening only at the one call that needs it keeps that boundary honest.
type Props = SuggestionProps<EntityCandidate, MentionNodeAttrs>;

export function buildMentionSuggestion(
  getSources: () => EntitySources
): Omit<SuggestionOptions<EntityCandidate, MentionNodeAttrs>, "editor"> {
  return {
    char: "@",
    // Only trigger at a word boundary. Without this, an email address typed
    // in prose ("a@b.com") opens the picker mid-word.
    allowSpaces: false,

    items: ({ query }: { query: string }): EntityCandidate[] => searchEntities(query, getSources(), MAX_VISIBLE),

    render: () => {
      let popup: HTMLDivElement | null = null;
      let items: EntityCandidate[] = [];
      let selected = 0;
      let commandFn: Props["command"] | null = null;

      const paint = () => {
        if (!popup) return;
        popup.innerHTML = "";

        if (items.length === 0) {
          const empty = document.createElement("p");
          empty.className = "px-3 py-2 text-xs text-muted";
          empty.textContent = "לא נמצאה התאמה";
          popup.appendChild(empty);
          return;
        }

        items.forEach((item, index) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = [
            "flex w-full items-center gap-2 px-3 py-2 text-start text-xs transition-colors",
            index === selected ? "bg-gold-soft text-gold-ink" : "text-foreground hover:bg-fill-subtle",
          ].join(" ");

          const label = document.createElement("span");
          label.className = "min-w-0 flex-1 truncate";
          // textContent, never innerHTML — these are user-authored names.
          label.textContent = item.label;

          const kind = document.createElement("span");
          kind.className = "shrink-0 text-muted";
          kind.textContent = item.detail ? `${ENTITY_LABELS[item.type]} · ${item.detail}` : ENTITY_LABELS[item.type];

          row.append(label, kind);
          // mousedown, not click: click fires after blur, by which point the
          // editor selection has already collapsed and the insert lands in
          // the wrong place.
          row.addEventListener("mousedown", (e) => {
            e.preventDefault();
            select(index);
          });
          popup!.appendChild(row);
        });
      };

      const select = (index: number) => {
        const item = items[index];
        if (!item || !commandFn) return;
        // entityType is a real attribute on our EntityMention node (see that
        // file's addAttributes) but is not part of TipTap's base
        // MentionNodeAttrs, so the extra field is asserted here — the single
        // place the two shapes meet.
        commandFn({ id: item.id, label: item.label, entityType: item.type } as MentionNodeAttrs);
      };

      const position = (rect: DOMRect | null | undefined) => {
        if (!popup || !rect) return;
        popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
        popup.style.left = `${rect.left + window.scrollX}px`;
      };

      return {
        onStart: (props: Props) => {
          items = props.items ?? [];
          commandFn = props.command;
          selected = 0;

          popup = document.createElement("div");
          popup.className =
            "glass-control fixed z-[95] max-h-64 w-64 overflow-y-auto rounded-xl py-1 shadow-lg";
          popup.setAttribute("role", "listbox");
          document.body.appendChild(popup);
          paint();
          position(props.clientRect?.());
        },

        onUpdate: (props: Props) => {
          items = props.items ?? [];
          commandFn = props.command;
          selected = 0;
          paint();
          position(props.clientRect?.());
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          const { event } = props;
          if (event.key === "ArrowDown") {
            selected = (selected + 1) % Math.max(items.length, 1);
            paint();
            return true;
          }
          if (event.key === "ArrowUp") {
            selected = (selected - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1);
            paint();
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            select(selected);
            return true;
          }
          if (event.key === "Escape") {
            popup?.remove();
            popup = null;
            return true;
          }
          return false;
        },

        onExit: () => {
          popup?.remove();
          popup = null;
          commandFn = null;
        },
      };
    },
  };
}
