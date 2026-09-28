import { BackToHome } from "@/components/layout/BackToHome";
import { MomentumDashboard } from "@/components/features/stats/MomentumDashboard";
import { getCurrentUserId } from "@/lib/currentUser";
import { getMomentumDashboard } from "@/lib/gamification/statsService";

// A Server Component page, deliberately — every other page in the app is
// "use client" and fetches through the Zustand store or a hook, but the
// Momentum Dashboard has nothing to mutate on first paint and no reason to
// pay a client-side fetch waterfall for read-only analytics. The four
// widgets underneath (components/features/stats/*) are themselves plain
// client components that just render the props they're handed.
export default async function StatsPage() {
  const userId = await getCurrentUserId();
  const data = await getMomentumDashboard(userId);

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      <h1 className="mb-1 text-2xl font-medium tracking-tight">מרכז הסטטיסטיקה והמומנטום</h1>
      <p className="mb-6 text-sm text-muted">
        רצף ההתמדה שלך, מפת החום היומית, מד המומנטום וההישגים — במקום אחד.
      </p>

      <MomentumDashboard data={data} />
    </main>
  );
}
