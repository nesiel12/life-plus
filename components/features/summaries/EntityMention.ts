import Mention from "@tiptap/extension-mention";
import type { EntityCandidate } from "@/lib/summaries/entityRef";

// The @mention node.
//
// Extends TipTap's Mention rather than replacing it, so the suggestion
// plugin, keyboard navigation and input rules all come for free. What is
// customised is the *persistence shape*: the node renders the same
// data-entity-type / data-entity-id / data-label attributes that
// lib/summaries/entityRef.ts's extractMentions reads back out of the saved
// HTML. Those two have to agree exactly, which is why the attribute names
// are stated in both places and tested from the parsing side.
export const EntityMention = Mention.extend({
  name: "entityMention",

  addAttributes() {
    return {
      entityType: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-entity-type"),
        renderHTML: (attributes) =>
          attributes.entityType ? { "data-entity-type": attributes.entityType as string } : {},
      },
      entityId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-entity-id"),
        renderHTML: (attributes) => (attributes.entityId ? { "data-entity-id": attributes.entityId as string } : {}),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => (attributes.label ? { "data-label": attributes.label as string } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-entity-id]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      // The class is what carries the mention chip styling in globals.css;
      // it is applied here rather than inline so the saved HTML stays clean
      // and re-themes with the app.
      { ...HTMLAttributes, class: "entity-mention" },
      `@${(node.attrs.label as string) ?? ""}`,
    ];
  },

  renderText({ node }) {
    // Plain-text and Markdown exports read this, so a mention degrades to
    // readable prose rather than disappearing.
    return `@${(node.attrs.label as string) ?? ""}`;
  },
});

/** The shape the suggestion dropdown hands back on selection. */
export interface MentionSelection {
  id: string;
  label: string;
  entityType: EntityCandidate["type"];
}
