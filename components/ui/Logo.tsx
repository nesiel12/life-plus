import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
}

// Renders /public/life-plus-mark.svg. That file is a stylized placeholder for
// the woven-ribbon brain — drop the final supplied artwork in at the same path
// and this component needs no change.
export function Logo({ size = 32, className }: LogoProps) {
  return (
    <Image
      src="/life-plus-mark.svg"
      alt=""
      width={size}
      height={size}
      className={className}
      priority
      aria-hidden
    />
  );
}

// The wordmark, set the way the logo has it: wide-tracked, uppercase, gold.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`text-gold-gradient font-semibold uppercase leading-none ${className ?? ""}`}
      style={{ letterSpacing: "0.22em" }}
    >
      LIFE&nbsp;PLUS
    </span>
  );
}
