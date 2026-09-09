import "server-only";
import webpush from "web-push";

// VAPID identity for Web Push. Generate a keypair once with
//   node -e "console.log(require('web-push').generateVAPIDKeys())"
// and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (a mailto: or
// https: URL the push services can reach you at). The public key is also
// exposed to the client as NEXT_PUBLIC_VAPID_PUBLIC_KEY for pushManager
// .subscribe().

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
  );
}

/** Lazily hand `web-push` its VAPID details, once. Returns the library, or
 *  null when push isn't configured on this deployment. */
export function getWebPush(): typeof webpush | null {
  if (!isPushConfigured()) return null;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    configured = true;
  }
  return webpush;
}
