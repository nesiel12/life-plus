interface LogoProps {
  size?: number;
  className?: string;
}

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
        <linearGradient id="atlas-ring" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d4af7a" />
          <stop offset="1" stopColor="#7ba7d4" />
        </linearGradient>
        <radialGradient id="atlas-sphere" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f2f2f0" stopOpacity="0.9" />
          <stop offset="1" stopColor="#3a3a3d" stopOpacity="0.6" />
        </radialGradient>
      </defs>

      {/* Incomplete ring — the invisible force holding the sphere */}
      <circle
        cx="24"
        cy="24"
        r="19"
        stroke="url(#atlas-ring)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="82 36"
        transform="rotate(-45 24 24)"
      />

      {/* The sphere */}
      <circle cx="24" cy="24" r="10" fill="url(#atlas-sphere)" />

      {/* Compass point */}
      <circle cx="24" cy="6" r="1.4" fill="#d4af7a" />
    </svg>
  );
}
