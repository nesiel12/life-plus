import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={32} />
      <p className="text-lg font-medium text-foreground">הדף הזה לא נמצא.</p>
      <p className="text-sm text-muted">ייתכן שהקישור שגוי או שהדף הוסר.</p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-opacity hover:opacity-80"
      >
        חזרה לדף הבית
      </Link>
    </div>
  );
}
