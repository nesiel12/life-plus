import { encodeQr, qrViewBox } from "@/lib/intelligence/crossModule/shabbatQr";

interface QrCodeSvgProps {
  /** ASCII text to encode — for the Shabbat sheet, a lesson URL. */
  value: string;
  /** What the code opens, for screen readers ("קוד QR: פתיחת השיעור …"). */
  label: string;
  className?: string;
}

/**
 * A QR code as inline SVG, drawn from the module matrix.
 *
 * A server component with no client code: the sheet is printed, and a vector
 * code stays sharp at any print size and needs no image request. The colours
 * are fixed rather than themed — a code has to be dark on light to scan, and
 * printing must not depend on the app's dark mode.
 */
export function QrCodeSvg({ value, label, className }: QrCodeSvgProps) {
  const code = encodeQr(value);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={qrViewBox(code)}
      className={className}
      // Crisp module edges: anti-aliasing between modules blurs a scan.
      shapeRendering="crispEdges"
    >
      <rect x={-code.quietZone} y={-code.quietZone} width={code.size + code.quietZone * 2} height={code.size + code.quietZone * 2} fill="#ffffff" />
      <path d={code.path} fill="#1a1614" />
    </svg>
  );
}
