import { Logo } from "@/components/ui/Logo";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Logo size={32} className="animate-pulse" />
    </div>
  );
}
