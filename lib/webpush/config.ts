import "server-only";
import webpush from "web-push";

// VAPID identity for Web Push. Generate a keypair once with
//   npx web-push generate-vapid-keys
// and set VAPID_PRIVATE_KEY / VAPID_SUBJECT (a mailto: or https: URL the push
// services can reach you at) plus NEXT_PUBLIC_VAPID_PUBLIC_KEY — the public
// half also needs the NEXT_PUBLIC_ prefix since the browser reads it directly
// for pushManager.subscribe(). Read here through PUBLIC_KEY rather than a
// second, easy-to-desync bare VAPID_PUBLIC_KEY.

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

/** Lazily hand `web-push` its VAPID details, once. Returns the library, or
 *  null when push isn't configured on this deployment. */
export function getWebPush(): typeof webpush | null {
  if (!isPushConfigured()) return null;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return webpush;
}
