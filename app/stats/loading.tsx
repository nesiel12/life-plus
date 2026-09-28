// /stats is the one async Server Component page in the app — every other
// route is a client component that mounts instantly and fetches its own
// data after (see MomentumDashboard's own comment). Without this boundary,
// navigating here would block on getMomentumDashboard's DB round-trip
// before anything painted at all. Plain CSS (.glass-card + animate-pulse),
// no framer-motion: a loading skeleton has nothing to animate in from, and
// this shape only exists for the instant it takes the real page to stream.
function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`glass-card animate-pulse rounded-2xl bg-fill-subtle/40 ${className ?? ""}`} />;
}

export default function StatsLoading() {
  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <div className="mb-6 h-6 w-24 animate-pulse rounded-lg bg-fill-subtle/40" />
      <div className="mb-1 h-8 w-72 animate-pulse rounded-lg bg-fill-subtle/40" />
      <div className="mb-6 h-5 w-96 max-w-full animate-pulse rounded-lg bg-fill-subtle/40" />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-48" />
        </div>
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-56" />
      </div>
    </main>
  );
}
