"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpLeft,
  BookOpen,
  BookPlus,
  Clock3,
  CornerDownLeft,
  GraduationCap,
  Library,
  Loader2,
  NotebookPen,
  Search,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { normalizeTerm } from "@/lib/torah/normalizeTerm";
import { hebrewOnly, rabbiNameKey } from "@/lib/torah/hebrew";
import { SEFORIM_CATALOG } from "@/lib/torah/seforimCatalog";
import { torahHref, useRecentTorahPages } from "@/lib/torah/trail";
import { cn } from "@/lib/utils";

/** Mirrors ExternalBook / ExternalAuthor from lib/torah/sources/providers.ts. */
interface RemoteBook {
  provider: "sefaria" | "googleBooks";
  externalId: string;
  title: string;
  hebrewTitle?: string;
  author?: string;
  categories?: string[];
  publishedYear?: number;
  coverImageUrl?: string;
}

interface RemoteAuthor {
  slug: string;
  name: string;
}

export type CommandScope = "all" | "books" | "rabbis" | "notes";

type GroupKey = "recent" | "picks" | "library" | "books" | "authors" | "actions";

interface CommandItem {
  key: string;
  group: GroupKey;
  icon: LucideIcon;
  /** Tints the icon tile. */
  tone: "faith" | "learning" | "knowledge" | "gold" | "muted";
  title: string;
  subtitle?: string;
  badge?: string;
  coverUrl?: string;
  /** Short verb shown on the highlighted row. */
  hint: string;
  run: () => Promise<void> | void;
}

const GROUP_LABELS: Record<GroupKey, string> = {
  recent: "ביקרת לאחרונה",
  picks: "ספרים מומלצים להתחלה",
  library: "בספרייה שלך",
  books: "ספרים מספריא ו-Google Books",
  authors: "רבנים ומחברים",
  actions: "פעולות",
};

const SCOPES: { key: CommandScope; label: string; icon: LucideIcon }[] = [
  { key: "all", label: "הכל", icon: Sparkles },
  { key: "books", label: "ספרים", icon: BookOpen },
  { key: "rabbis", label: "רבנים", icon: GraduationCap },
  { key: "notes", label: "הסיכומים שלי", icon: NotebookPen },
];

// Rotating examples in the placeholder — a quiet hint at the range of the
// search (a sefer, a rav, a topic) without a paragraph of instructions.
const EXAMPLES = ["משנה ברורה", "הרב קוק", "מסילת ישרים", "החפץ חיים", "הלכות שבת", "רמח״ל"];

const TONE_CLASSES: Record<CommandItem["tone"], string> = {
  faith: "bg-accent-faith/12 text-accent-faith",
  learning: "bg-accent-learning/12 text-accent-learning",
  knowledge: "bg-accent-knowledge/12 text-accent-knowledge",
  gold: "bg-gold-soft text-gold-ink",
  muted: "bg-fill-subtle text-muted",
};

const DEBOUNCE_MS = 260;
const MIN_REMOTE_QUERY = 2;

interface TorahCommandCenterProps {
  /** Which scope the pills start on — the Torah page passes the active tab's. */
  defaultScope?: CommandScope;
  className?: string;
}

/**
 * The search command center for מרחב תורה.
 *
 * One field for the whole space: the user's own library (instant, searched in
 * the browser over the store), Sefaria and Google Books (debounced, through
 * /api/torah/search), Sefaria's authors, and the "add what I typed" actions.
 * Every result lands on a real page — picking a sefer that is not on the shelf
 * yet adds it and opens it, which is the first hop of the investigation loop.
 *
 * Keyboard-first: ⌘K / Ctrl+K or "/" focuses it from anywhere on the page,
 * ↑/↓ move through every group as one list, Enter runs the highlighted row,
 * Esc closes. The combobox/listbox ARIA pattern with aria-activedescendant
 * keeps focus in the input the whole time, which is what screen readers
 * expect of an autocomplete.
 */
export function TorahCommandCenter({ defaultScope = "all", className }: TorahCommandCenterProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const listId = useId();

  const books = useAtlasStore((s) => s.books);
  const rabbis = useAtlasStore((s) => s.rabbis);
  const summaries = useAtlasStore((s) => s.summaries);
  const addBook = useAtlasStore((s) => s.addBook);
  const addBookFromProvider = useAtlasStore((s) => s.addBookFromProvider);
  const addRabbi = useAtlasStore((s) => s.addRabbi);
  const openOrCreateRabbi = useAtlasStore((s) => s.openOrCreateRabbi);
  const recent = useRecentTorahPages();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<CommandScope>(defaultScope);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [remote, setRemote] = useState<{ books: RemoteBook[]; authors: RemoteAuthor[] }>({ books: [], authors: [] });
  const [searching, setSearching] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exampleIndex, setExampleIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setScope(defaultScope), [defaultScope]);

  const trimmed = query.trim();
  const folded = normalizeTerm(trimmed);

  // Rotate the placeholder example while the field is empty and idle.
  useEffect(() => {
    if (reduceMotion || trimmed) return;
    const timer = setInterval(() => setExampleIndex((i) => (i + 1) % EXAMPLES.length), 2800);
    return () => clearInterval(timer);
  }, [reduceMotion, trimmed]);

  // ⌘K / Ctrl+K anywhere, and "/" when not already typing somewhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close on an outside pointer.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Debounced remote search. The AbortController stops a slow response for
  // an old prefix from overwriting the results for what is typed now.
  useEffect(() => {
    if (trimmed.length < MIN_REMOTE_QUERY || scope === "notes") {
      setRemote({ books: [], authors: [] });
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/torah/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!controller.signal.aborted) {
          setRemote({
            books: Array.isArray(data.books) ? data.books : [],
            authors: Array.isArray(data.authors) ? data.authors : [],
          });
        }
      } catch {
        // Aborted or offline: the local results and the add actions still work.
        if (!controller.signal.aborted) setRemote({ books: [], authors: [] });
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, scope]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  /** Runs an item's action with a per-row spinner and a Hebrew error on failure. */
  const runItem = useCallback(async (item: CommandItem) => {
    setRunning(item.key);
    setError(null);
    try {
      await item.run();
    } catch {
      setError("הפעולה נכשלה. נסה שוב.");
    } finally {
      setRunning(null);
    }
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = [];
    const wantBooks = scope === "all" || scope === "books";
    const wantRabbis = scope === "all" || scope === "rabbis";
    const wantNotes = scope === "all" || scope === "notes";

    if (!trimmed) {
      for (const node of recent) {
        if ((node.type === "book" && !wantBooks) || (node.type === "rabbi" && !wantRabbis)) continue;
        result.push({
          key: `recent:${node.type}:${node.id}`,
          group: "recent",
          icon: node.type === "book" ? BookOpen : GraduationCap,
          tone: "muted",
          title: node.label,
          subtitle: node.type === "book" ? "ספר" : "רב",
          hint: "פתח",
          run: () => go(torahHref(node)),
        });
      }
      if (wantBooks) {
        const shelf = new Set(books.map((b) => normalizeTerm(b.hebrewTitle ?? b.title)));
        for (const sefer of SEFORIM_CATALOG.filter((s) => !shelf.has(normalizeTerm(s.title))).slice(0, 6)) {
          result.push({
            key: `pick:${sefer.title}`,
            group: "picks",
            icon: Library,
            tone: "gold",
            title: sefer.title,
            subtitle: sefer.category,
            hint: "הוסף ופתח",
            run: async () => {
              const book = await addBookFromProvider({ title: sefer.title });
              go(`/areas/torah/books/${book.id}`);
            },
          });
        }
      }
      return result;
    }

    const matches = (value?: string) => Boolean(value && normalizeTerm(value).includes(folded));

    // — The user's own library, instant.
    if (wantBooks) {
      for (const book of books.filter((b) => matches(b.title) || matches(b.hebrewTitle) || matches(b.author)).slice(0, 5)) {
        result.push({
          key: `book:${book.id}`,
          group: "library",
          icon: BookOpen,
          tone: "faith",
          title: book.hebrewTitle ?? book.title,
          // Hebrew fields only — a row stored before the Hebrew-at-source fix
          // can still hold an English author until its page is opened.
          subtitle: [hebrewOnly(book.author), hebrewOnly(book.category)].filter(Boolean).join(" · ") || "ספר בספרייה",
          badge: "בספרייה",
          coverUrl: book.coverImageUrl,
          hint: "פתח",
          run: () => go(`/areas/torah/books/${book.id}`),
        });
      }
    }
    if (wantRabbis) {
      const key = rabbiNameKey(trimmed);
      for (const rabbi of rabbis
        .filter((r) => matches(r.name) || matches(r.hebrewName) || matches(r.title) || rabbiNameKey(r.name).includes(key))
        .slice(0, 4)) {
        result.push({
          key: `rabbi:${rabbi.id}`,
          group: "library",
          icon: GraduationCap,
          tone: "learning",
          title: rabbi.hebrewName ?? rabbi.name,
          subtitle: [rabbi.title, rabbi.era].filter(Boolean).join(" · ") || "רב בספרייה",
          badge: "בספרייה",
          hint: "פתח",
          run: () => go(`/areas/torah/rabbis/${rabbi.id}`),
        });
      }
    }
    if (wantNotes) {
      for (const summary of summaries
        .filter((s) => (s.kind ?? "summary") === "summary" && (matches(s.title) || matches(s.content)))
        .slice(0, scope === "notes" ? 8 : 3)) {
        const href =
          summary.entityType === "book" || summary.entityType === "rabbi"
            ? `/areas/torah/${summary.entityType === "book" ? "books" : "rabbis"}/${summary.entityId}`
            : "/areas/torah?tab=summaries";
        result.push({
          key: `summary:${summary.id}`,
          group: "library",
          icon: NotebookPen,
          tone: "knowledge",
          title: summary.title,
          subtitle: summary.content.replace(/\s+/g, " ").slice(0, 80) || "סיכום",
          badge: "סיכום",
          hint: "פתח",
          run: () => go(href),
        });
      }
    }

    // — Sefaria & Google Books, skipping what is already on the shelf.
    if (wantBooks) {
      const shelf = new Set(books.flatMap((b) => [b.title, b.hebrewTitle].filter(Boolean).map((t) => normalizeTerm(t!))));
      for (const book of remote.books.filter((b) => !shelf.has(normalizeTerm(b.hebrewTitle ?? b.title))).slice(0, 6)) {
        result.push({
          key: `remote:${book.provider}:${book.externalId}`,
          group: "books",
          icon: BookPlus,
          tone: "faith",
          title: book.hebrewTitle ?? book.title,
          subtitle:
            [book.author, book.publishedYear, book.categories?.[0]].filter(Boolean).join(" · ") ||
            (book.provider === "sefaria" ? "מתוך הספרייה של ספריא" : "מתוך Google Books"),
          badge: book.provider === "sefaria" ? "ספריא" : "Google",
          coverUrl: book.coverImageUrl,
          hint: "הוסף ופתח",
          run: async () => {
            const created = await addBookFromProvider({
              title: book.hebrewTitle ?? book.title,
              provider: book.provider,
              sefariaTitle: book.provider === "sefaria" ? book.externalId : undefined,
            });
            go(`/areas/torah/books/${created.id}`);
          },
        });
      }
    }
    if (wantRabbis) {
      for (const author of remote.authors.slice(0, 4)) {
        result.push({
          key: `author:${author.slug}`,
          group: "authors",
          icon: GraduationCap,
          tone: "learning",
          title: author.name,
          subtitle: "מחבר בספריא · פרופיל, ספרים ושושלת",
          badge: "ספריא",
          hint: "פתח פרופיל",
          run: async () => {
            const rabbi = await openOrCreateRabbi({ name: author.name, sefariaSlug: author.slug });
            go(`/areas/torah/rabbis/${rabbi.id}`);
          },
        });
      }
    }

    // — Always possible: add exactly what was typed.
    if (wantBooks) {
      result.push({
        key: "action:add-book",
        group: "actions",
        icon: BookPlus,
        tone: "gold",
        title: `הוסף את «${trimmed}» כספר חדש`,
        subtitle: "גם אם הוא לא נמצא במאגרים",
        hint: "הוסף",
        run: async () => {
          const book = await addBook({ title: trimmed });
          go(`/areas/torah/books/${book.id}`);
        },
      });
    }
    if (wantRabbis) {
      result.push({
        key: "action:add-rabbi",
        group: "actions",
        icon: UserPlus,
        tone: "gold",
        title: `הוסף את «${trimmed}» כרב חדש`,
        subtitle: "ייפתח דף פרופיל שאפשר להעשיר",
        hint: "הוסף",
        run: async () => {
          const rabbi = await addRabbi({ name: trimmed });
          go(`/areas/torah/rabbis/${rabbi.id}`);
        },
      });
    }

    return result;
  }, [
    trimmed,
    folded,
    scope,
    recent,
    books,
    rabbis,
    summaries,
    remote,
    go,
    addBook,
    addBookFromProvider,
    addRabbi,
    openOrCreateRabbi,
  ]);

  useEffect(() => setHighlighted(0), [trimmed, scope, items.length]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (query) setQuery("");
      else setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (items.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((i) => (i + delta + items.length) % items.length);
      return;
    }
    if (event.key === "Enter") {
      const item = items[highlighted];
      if (item && running === null) {
        event.preventDefault();
        void runItem(item);
      }
      return;
    }
    if (event.key === "Tab" && open && !event.shiftKey) {
      // Tab cycles scope while the panel is open — a fast way to narrow
      // without leaving the keyboard.
      event.preventDefault();
      const index = SCOPES.findIndex((s) => s.key === scope);
      setScope(SCOPES[(index + 1) % SCOPES.length].key);
    }
  }

  const grouped = useMemo(() => {
    const groups: { key: GroupKey; items: { item: CommandItem; index: number }[] }[] = [];
    items.forEach((item, index) => {
      const last = groups[groups.length - 1];
      if (last?.key === item.group) last.items.push({ item, index });
      else groups.push({ key: item.group, items: [{ item, index }] });
    });
    return groups;
  }, [items]);

  const active = open;
  const activeId = items[highlighted] ? `${listId}-option-${highlighted}` : undefined;

  return (
    <div ref={containerRef} className={cn("relative z-30", className)}>
      <div className="torah-command" data-active={active}>
        <div className="flex items-center gap-3 px-3.5 py-3 sm:px-4">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
              active ? "bg-gold text-white" : "bg-gold-soft text-gold-ink"
            )}
            aria-hidden
          >
            {searching || running ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
          </span>

          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setError(null);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={open ? activeId : undefined}
              aria-autocomplete="list"
              aria-label="חיפוש במרחב תורה — ספרים, רבנים וסיכומים"
              className="peer w-full bg-transparent text-[0.95rem] text-foreground outline-none"
            />
            {!query && (
              <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center gap-1 truncate text-[0.95rem] text-muted">
                חפש ספר, רב או נושא — למשל:
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={EXAMPLES[exampleIndex]}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="font-medium text-gold-ink"
                  >
                    {EXAMPLES[exampleIndex]}
                  </motion.span>
                </AnimatePresence>
              </span>
            )}
          </div>

          <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
            <kbd className="torah-command-kbd ltr">⌘</kbd>
            <kbd className="torah-command-kbd ltr">K</kbd>
          </span>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div
                role="radiogroup"
                aria-label="היקף החיפוש"
                className="flex gap-1.5 overflow-x-auto border-t border-hairline-card px-3.5 py-2 sm:px-4"
              >
                {SCOPES.map((option) => {
                  const Icon = option.icon;
                  const selected = option.key === scope;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setScope(option.key);
                        inputRef.current?.focus();
                      }}
                      className={cn(
                        "focus-ring flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
                        selected
                          ? "bg-foreground text-background"
                          : "bg-fill-subtle text-muted hover:bg-fill hover:text-foreground"
                      )}
                    >
                      <Icon size={12} aria-hidden />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open && (items.length > 0 || trimmed) && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="glass-panel absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl shadow-2xl"
          >
            <div ref={listRef} id={listId} role="listbox" aria-label="תוצאות" className="max-h-[min(28rem,62vh)] overflow-y-auto p-2">
              {grouped.map((group) => (
                <div key={group.key} role="group" aria-label={GROUP_LABELS[group.key]} className="mb-1 last:mb-0">
                  <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[0.7rem] font-medium tracking-wide text-muted">
                    {group.key === "recent" && <Clock3 size={11} aria-hidden />}
                    {group.key === "picks" && <Sparkles size={11} aria-hidden />}
                    {GROUP_LABELS[group.key]}
                    {group.key === "books" && searching && <Loader2 size={11} className="animate-spin" aria-hidden />}
                  </p>
                  {group.items.map(({ item, index }) => (
                    <CommandRow
                      key={item.key}
                      id={`${listId}-option-${index}`}
                      index={index}
                      item={item}
                      highlighted={index === highlighted}
                      running={running === item.key}
                      disabled={running !== null}
                      onHover={() => setHighlighted(index)}
                      onRun={() => void runItem(item)}
                    />
                  ))}
                </div>
              ))}

              {trimmed && searching && remote.books.length === 0 && scope !== "notes" && (
                <div className="flex flex-col gap-2 px-2.5 py-2" aria-hidden>
                  {[0, 1].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="h-11 w-8 animate-pulse rounded-md bg-fill" />
                      <span className="flex flex-1 flex-col gap-1.5">
                        <span className="h-3 w-2/5 animate-pulse rounded bg-fill" />
                        <span className="h-2.5 w-1/4 animate-pulse rounded bg-fill-subtle" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="border-t border-hairline-card px-4 py-2 text-xs text-accent-family">{error}</p>}

            <div className="flex items-center justify-between gap-3 border-t border-hairline-card bg-surface-sunken/60 px-4 py-2 text-[0.68rem] text-muted">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="torah-command-kbd">↑</kbd>
                  <kbd className="torah-command-kbd">↓</kbd>
                  ניווט
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="torah-command-kbd">
                    <CornerDownLeft size={10} aria-hidden />
                  </kbd>
                  בחירה
                </span>
                <span className="hidden items-center gap-1 sm:flex">
                  <kbd className="torah-command-kbd">Tab</kbd>
                  היקף
                </span>
                <span className="hidden items-center gap-1 sm:flex">
                  <kbd className="torah-command-kbd">Esc</kbd>
                  סגירה
                </span>
              </span>
              <span className="truncate">מקורות: ספריא · Google Books</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CommandRowProps {
  id: string;
  index: number;
  item: CommandItem;
  highlighted: boolean;
  running: boolean;
  disabled: boolean;
  onHover: () => void;
  onRun: () => void;
}

function CommandRow({ id, index, item, highlighted, running, disabled, onHover, onRun }: CommandRowProps) {
  const Icon = item.icon;
  return (
    <div
      id={id}
      role="option"
      aria-selected={highlighted}
      aria-disabled={disabled}
      data-index={index}
      onMouseMove={onHover}
      // mousedown keeps focus in the input (so the panel does not blur shut
      // mid-click); the action itself runs on click, which is also what a
      // screen reader's virtual cursor dispatches.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!disabled) onRun();
      }}
      className={cn(
        "group relative flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
        highlighted ? "bg-gold-soft" : "hover:bg-fill-subtle",
        disabled && !running && "opacity-60"
      )}
    >
      {highlighted && (
        <motion.span
          layoutId="torah-command-highlight"
          className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-gold"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          aria-hidden
        />
      )}

      {item.coverUrl ? (
        <Image
          src={item.coverUrl}
          alt=""
          width={32}
          height={44}
          className="h-11 w-8 shrink-0 rounded-md object-cover shadow-sm ring-1 ring-hairline-card"
          aria-hidden
          unoptimized
        />
      ) : (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONE_CLASSES[item.tone])} aria-hidden>
          <Icon size={16} />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
          {item.badge && (
            <span className="shrink-0 rounded-full border border-hairline-card px-1.5 py-px text-[0.6rem] text-muted">
              {item.badge}
            </span>
          )}
        </span>
        {item.subtitle && <span className="mt-0.5 block truncate text-xs text-muted">{item.subtitle}</span>}
      </span>

      {running ? (
        <Loader2 size={14} className="shrink-0 animate-spin text-gold-ink" aria-hidden />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-[0.68rem] font-medium transition-opacity",
            highlighted ? "text-gold-ink opacity-100" : "opacity-0 group-hover:opacity-60"
          )}
          aria-hidden
        >
          {item.hint}
          <ArrowUpLeft size={12} />
        </span>
      )}
    </div>
  );
}
