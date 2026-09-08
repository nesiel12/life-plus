import { redirect } from "next/navigation";

// Time & Tasks was merged into the Smart Calendar. next.config.ts also
// redirects this path; this keeps the behaviour if that entry is ever
// removed, and documents the move at the route itself.
export default function TimeSpaceRedirect(): never {
  redirect("/calendar");
}
