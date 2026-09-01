interface LogoProps {
  size?: number;
  className?: string;
}

// Interim LIFE PLUS mark — an interwoven double-loop knot in the logo's gold,
// echoing the woven-ribbon brain without reproducing the full illustration.
// Replace with the real logo asset (drop a file in public/ and swap this for
// an <img>/inline <svg>) — nothing else references the mark's internals.
export function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="lp-gold" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8a6a2f" />
          <stop offset="0.45" stopColor="#c6a15b" />
          <stop offset="0.65" stopColor="#e7d3a4" />
          <stop offset="1" stopColor="#a9843f" />
        </linearGradient>
      </defs>

      {/* two interlaced ellipses — a woven knot */}
      <g
        stroke="url(#lp-gold)"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      >
        <ellipse cx="24" cy="24" rx="16" ry="8.5" transform="rotate(38 24 24)" />
        <ellipse cx="24" cy="24" rx="16" ry="8.5" transform="rotate(-38 24 24)" />
      </g>

      {/* centre node */}
      <circle cx="24" cy="24" r="3.1" fill="url(#lp-gold)" />
    </svg>
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
