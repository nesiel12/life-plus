"use client"

// Adapted from MagicUI (magicui.design) — Option B: hand-integrated into the
// LIFE PLUS token system. No shadcn. Verified byte-identical to the upstream
// registry payload (magicui.design/r/kinetic-text.json), so `shadcn add
// @magicui/kinetic-text` would produce this same file — and it can't be run
// here anyway: there's no components.json, so it would trigger `shadcn init`
// and rewrite globals.css over the Luxe token layer.
//
// One addition on top of upstream: `animateOnLoad` stages the letters in with
// a framer-motion stagger. Upstream is hover-only, and the brand lockup needs
// to announce itself on arrival. The per-letter <span> siblings are preserved
// exactly (motion.span still renders a <span>) so the hover CSS — which leans
// on `has-[+span:hover]` / `[:hover+&]` adjacency — keeps working untouched.

import React from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"

import { cn } from "@/lib/utils"
import { textDirection } from "@/lib/textDirection"

type As = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span"

type KineticTextProps = React.HTMLAttributes<HTMLElement> & {
  text: string
  as?: As
  /** Stagger the letters in on mount. */
  animateOnLoad?: boolean
  /** Seconds before the first letter lands. */
  delay?: number
  /** Classes applied to each letter span. A `background-clip: text` gradient
   *  MUST live here rather than on the container when `animateOnLoad` is set:
   *  framer-motion's per-letter transform/opacity promotes each letter to its
   *  own layer, and an ancestor's clipped background then paints nothing —
   *  the glyphs render with no fill and the word looks blank. */
  letterClassName?: string
  /** Keep words intact when the line wraps. The container is a wrapping flex
   *  row, so a bare per-letter split lets a long heading break in the middle
   *  of a word — fine for a short lockup, wrong for a sentence. Grouping by
   *  word confines the hover neighbour effect to within each word, which is
   *  the sane reading anyway. */
  wordSafe?: boolean
}

const LETTER_CLASS =
  "[will-change:font-weight,-webkit-text-stroke-width,padding] [-webkit-text-stroke-color:transparent] [-webkit-text-stroke-width:var(--text-stroke-width)] [transition:font-weight_0.4s,_-webkit-text-stroke-color_0.4s,_padding_0.4s] hover:[padding-inline:var(--hover-padding)] hover:font-[900] hover:[-webkit-text-stroke-color:currentcolor] hover:[-webkit-text-stroke-width:calc(var(--text-stroke-width)*2)] has-[+span+span:hover]:font-[400] has-[+span:hover]:[padding-inline:var(--hover-padding)] has-[+span:hover]:font-[600] [:hover+&]:[padding-inline:var(--hover-padding)] [:hover+&]:font-[600] [:hover+span+&]:font-[400]"

// Carries no animation of its own — it exists so framer-motion's variant
// propagation reaches the letters nested inside each word.
const WORD_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}

const LETTER_VARIANTS: Variants = {
  hidden: { opacity: 0, y: "0.4em", filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
}

export function KineticText({
  text,
  as: Tag = "h1",
  className = "",
  style,
  animateOnLoad = false,
  delay = 0,
  wordSafe = false,
  letterClassName,
  ...rest
}: KineticTextProps) {
  const reduce = useReducedMotion()
  const animate = animateOnLoad && !reduce

  const mergedStyle = {
    "--hover-padding": "calc(1em / 12)",
    "--text-stroke-width": "calc(1em * 125 / 6000)",
    ...(style as React.CSSProperties | undefined),
  } as React.CSSProperties

  const renderLetter = (letter: string, key: string) => {
    const content = letter === " " ? "\u00A0" : letter
    return animate ? (
      <motion.span
        key={key}
        aria-hidden="true"
        variants={LETTER_VARIANTS}
        className={cn(LETTER_CLASS, letterClassName)}
      >
        {content}
      </motion.span>
    ) : (
      <span key={key} aria-hidden="true" className={cn(LETTER_CLASS, letterClassName)}>
        {content}
      </span>
    )
  }

  const letters = wordSafe
    ? // Split on spaces but keep them, so the gaps stay real characters.
      text.split(/(\s+)/).map((chunk, w) =>
        /^\s+$/.test(chunk) ? (
          renderLetter(" ", `s${w}`)
        ) : animate ? (
          <motion.span
            key={`w${w}`}
            variants={WORD_VARIANTS}
            className="inline-flex whitespace-nowrap"
          >
            {chunk.split("").map((letter, i) => renderLetter(letter, `w${w}-${i}`))}
          </motion.span>
        ) : (
          <span key={`w${w}`} className="inline-flex whitespace-nowrap">
            {chunk.split("").map((letter, i) => renderLetter(letter, `w${w}-${i}`))}
          </span>
        )
      )
    : text.split("").map((letter, i) => renderLetter(letter, String(i)))

  const shared = {
    // A flex row lays its children out in the row's direction, so without an
    // explicit dir an English string in an RTL page renders letter-reversed
    // ("thgin doog"). Derive it from the text unless the caller set one.
    dir: (rest.dir as "rtl" | "ltr" | undefined) ?? textDirection(text),
    ...rest,
    className: cn("flex flex-wrap font-[300]", className),
    style: mergedStyle,
  }

  if (!animate) {
    return (
      <Tag {...shared}>
        {letters}
        <span className="sr-only">{text}</span>
      </Tag>
    )
  }

  const MotionTag = motion[Tag] as React.ElementType

  return (
    <MotionTag
      {...shared}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: delay } } }}
    >
      {letters}
      <span className="sr-only">{text}</span>
    </MotionTag>
  )
}
