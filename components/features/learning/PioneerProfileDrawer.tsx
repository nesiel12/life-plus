"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { ExternalLink, PartyPopper, Quote, Sparkles, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmbeddedArticleReader } from "@/components/features/learning/EmbeddedArticleReader";
import { useLab, originOf } from "@/components/features/learning/lab/LabContext";
import { getPioneerEasterEggClaimsAction, claimPioneerEasterEggAction } from "@/app/actions/masterclassProgress";
import { PIONEER_EASTER_EGG_XP, easterEggCelebrationFor } from "@/lib/learning/masterclassXp";
import type { PioneerProfile, TeachingMode, UserAgeGroup } from "@/types/learning";

interface PioneerProfileDrawerProps {
  pioneer: PioneerProfile;
  topicId: string;
  stepId: string;
  userAgeGroup: UserAgeGroup;
  teachingMode: TeachingMode;
  onClose: () => void;
}

const DRAWER_Z_INDEX = "z-[132]";

/**
 * The full pioneer profile, opened from PioneerCard's click. Presents only
 * what PioneerProfile actually carries (bio, quote, one unusual fact) — no
 * fabricated multi-entry "achievements timeline," since the schema has no
 * such structure to draw one from.
 *
 * The avatar is the easter egg: clicking it reveals the unusual fact/quote
 * as a "did you know" beat and awards +10 XP once, persisted via
 * pioneer_easter_egg_claims so a later reopen shows the same reveal without
 * re-celebrating (lib/learning/masterclassXp.ts's easterEggCelebrationFor).
 */
export function PioneerProfileDrawer({ pioneer, topicId, stepId, userAgeGroup, teachingMode, onClose }: PioneerProfileDrawerProps) {
  const lab = useLab();
  const [claimed, setClaimed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [articleUrl, setArticleUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPioneerEasterEggClaimsAction(topicId, stepId, userAgeGroup, teachingMode).then((ids) => {
      if (!cancelled && ids.includes(pioneer.id)) setClaimed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [topicId, stepId, userAgeGroup, teachingMode, pioneer.id]);

  async function revealAvatar(e: MouseEvent<HTMLButtonElement>) {
    setRevealed(true);
    if (claimed) return;
    const origin = originOf(e.currentTarget);
    try {
      const { claimed: wasNew } = await claimPioneerEasterEggAction(topicId, stepId, pioneer.id, userAgeGroup, teachingMode);
      setClaimed(true);
      if (easterEggCelebrationFor({ alreadyClaimed: !wasNew }) === "claimed") {
        lab.celebrate("milestone", PIONEER_EASTER_EGG_XP, origin, "גילית משהו!");
        lab.audio.play("chime");
      }
    } catch {
      // The reveal itself already happened locally — a failed claim write
      // just means the bonus won't be remembered next time, not that this
      // click did nothing.
    }
  }

  return (
    <>
      <Modal open onClose={onClose} align="center" zIndex={DRAWER_Z_INDEX} label={`פרופיל: ${pioneer.name}`} panelClassName="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden p-5">
        <div dir="rtl" className="flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => void revealAvatar(e)}
                aria-label="גלה עובדה מפתיעה"
                className="focus-ring relative grid size-14 shrink-0 place-items-center rounded-full bg-accent-learning/15 text-lg font-semibold text-accent-learning transition-transform hover:scale-105 active:scale-95"
              >
                {pioneer.name.charAt(0)}
                {!claimed && (
                  <span aria-hidden className="absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-gold text-background">
                    <Sparkles size={9} aria-hidden />
                  </span>
                )}
              </button>
              <div>
                <h2 className="text-base font-semibold text-foreground">{pioneer.name}</h2>
                <p className="text-xs text-muted">
                  {pioneer.role} · {pioneer.historicalEra}
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="סגור" className="focus-ring grid size-9 shrink-0 place-items-center rounded-full bg-fill-subtle text-muted transition-colors hover:text-foreground">
              <X size={18} aria-hidden />
            </button>
          </div>

          {revealed && (
            <div className="flex items-start gap-2 rounded-2xl bg-gold/10 p-3 text-sm text-foreground">
              <PartyPopper size={15} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
              <span>{pioneer.unusualFact || pioneer.famousQuote}</span>
            </div>
          )}

          <p className="text-sm leading-relaxed text-foreground/90">{pioneer.bio}</p>

          {pioneer.famousQuote && (
            <div className="masterclass-prose">
              <blockquote className="flex items-start gap-1.5 italic">
                <Quote size={12} className="mt-1 shrink-0 text-accent-learning" aria-hidden />
                <span>&ldquo;{pioneer.famousQuote}&rdquo;</span>
              </blockquote>
            </div>
          )}

          {pioneer.externalLinks.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted">מקורות</h3>
              <div className="flex flex-col gap-1.5">
                {pioneer.externalLinks.map((link, i) =>
                  link.type === "article" ? (
                    <button
                      key={i}
                      onClick={() => setArticleUrl(link.url)}
                      className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-2.5 py-1.5 text-start text-xs text-foreground transition-colors hover:bg-fill-subtle"
                    >
                      {link.title}
                    </button>
                  ) : (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-fill-subtle"
                    >
                      {link.title}
                      <ExternalLink size={11} className="text-muted" aria-hidden />
                    </a>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {articleUrl && <EmbeddedArticleReader url={articleUrl} title={pioneer.name} onClose={() => setArticleUrl(null)} />}
    </>
  );
}
