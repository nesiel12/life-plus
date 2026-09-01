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

type As = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span"

type KineticTextProps = React.HTMLAttributes<HTMLElement> & {
  text: string
  as?: As
  /** Stagger the letters in on mount. */
  animateOnLoad?: boolean
  /** Seconds before the first letter lands. */
  delay?: number
}

const LETTER_CLASS =
  "[will-change:font-weight,-webkit-text-stroke-width,padding] [-webkit-text-stroke-color:transparent] [-webkit-text-stroke-width:var(--text-stroke-width)] [transition:font-weight_0.4s,_-webkit-text-stroke-color_0.4s,_padding_0.4s] hover:[padding-inline:var(--hover-padding)] hover:font-[900] hover:[-webkit-text-stroke-color:currentcolor] hover:[-webkit-text-stroke-width:calc(var(--text-stroke-width)*2)] has-[+span+span:hover]:font-[400] has-[+span:hover]:[padding-inline:var(--hover-padding)] has-[+span:hover]:font-[600] [:hover+&]:[padding-inline:var(--hover-padding)] [:hover+&]:font-[600] [:hover+span+&]:font-[400]"

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
  ...rest
}: KineticTextProps) {
  const reduce = useReducedMotion()
  const animate = animateOnLoad && !reduce

  const mergedStyle = {
    "--hover-padding": "calc(1em / 12)",
    "--text-stroke-width": "calc(1em * 125 / 6000)",
    ...(style as React.CSSProperties | undefined),
  } as React.CSSProperties

  const letters = text.split("").map((letter, i) => {
    const content = letter === " " ? "\u00A0" : letter
    return animate ? (
      <motion.span key={i} aria-hidden="true" variants={LETTER_VARIANTS} className={LETTER_CLASS}>
        {content}
      </motion.span>
    ) : (
      <span key={i} aria-hidden="true" className={LETTER_CLASS}>
        {content}
      </span>
    )
  })

  const shared = {
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
