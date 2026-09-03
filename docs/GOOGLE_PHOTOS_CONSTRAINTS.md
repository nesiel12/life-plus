# Google Photos: what is and isn't possible

Researched 2026-09-03 against live Google documentation, with each load-bearing
claim independently re-verified. Written down because three requirements in the
Sprint 3 brief are **not buildable**, and the reasons are non-obvious enough
that someone will otherwise try again in six months.

## The hard constraint

On **2025-03-31** Google removed the `photoslibrary.readonly`,
`photoslibrary.sharing` and `photoslibrary` scopes. Calls relying on them now
return `403 PERMISSION_DENIED`. What remains — `photoslibrary.appendonly`,
`photoslibrary.readonly.appcreateddata`, `photoslibrary.edit.appcreateddata` —
only reaches **media the app itself created**.

A photo the user picked was not created by us, so it is permanently outside the
Library API's reach.

## Consequences for the brief

| Requirement | Verdict |
| --- | --- |
| "AI pulls photos from exactly a year ago" | **Impossible.** Scanning the library by date needs `photoslibrary.readonly`. `mediaItems.search` date filters now only match app-created media. |
| "or specific albums" | **Impossible.** The Picker API exposes exactly two resources — `sessions` and `mediaItems` — and four methods. There is no albums resource at all. |
| "Do NOT download. Save only reference URLs/IDs." | **Does not survive.** See below. |

## Why "store only IDs" breaks

Four independent facts, each confirmed against Google's own reference:

1. `mediaFile.baseUrl` is valid for **~60 minutes**, sooner if consent is revoked.
2. The Picker API's `mediaItems` resource has **only a `list` method, and it
   requires a `sessionId`**. There is no `get` and no `batchGet` taking a media
   item ID. A stored ID is an opaque string with no lookup function.
3. `PickingSession.expireTime` is documented as the time when access to the
   session *and its picked media* expires. Access is session-scoped, not
   ID-scoped. Google documents no concrete session lifetime.
4. The historical escape hatch — resolving an ID via Library API
   `mediaItems.get` — closed on 2025-03-31.

Plus a mechanical one: fetching a `baseUrl` requires an `Authorization: Bearer`
header and a size suffix (`=w2048-h1024`, `=d`). It cannot go in an `<img src>`
at all; every render needs a server-side proxy.

**Storing IDs indefinitely is explicitly permitted** by Google's own
best-practices page. IDs just aren't independently resolvable, which makes that
permission useless on its own.

## The policy judgement, stated rather than hidden

Google's "don't cache media beyond 60 minutes" guidance is scoped **on its own
page** to the Library API, so its binding force on Picker-obtained content is
genuinely ambiguous. The Photos API policy separately steers Picker toward
"limited set of content for a limited time period" use cases.

This is a real judgement call, not a settled question. It is **not** a decision
to make silently on the user's behalf — see OPEN DECISION below.

## What is buildable

- **CRM avatar picking** — yes, straightforwardly, via the Picker API.
- **Anniversary matching** — yes, over *our own* corpus. `lib/memories/anniversary.ts`
  is deliberately source-agnostic and needs no Google dependency.
- **Historical backfill** — only via Google Takeout, which the user runs
  manually. Takeout's per-photo sidecar JSON carries `photoTakenTime`, exactly
  the field the matcher needs. There is no API to trigger Takeout, and
  Incremental Takeout's finest granularity is every two months.

## Auth note

Do **not** add a Photos scope to `GOOGLE_SCOPES` in `lib/auth.ts`. That array is
the sign-in scope set; adding a sensitive Photos scope there forces every user
to re-consent merely to log in, and drags the whole app into a heavier
verification posture. Use incremental authorization — a separate opt-in flow
with its own token row — so sign-in stays light and a stalled Photos review
doesn't block the rest of the app.

## OPEN DECISION (blocks the connector)

Storing downscaled derivatives is the only approach that actually works. It is
also the thing the brief explicitly said not to do. That conflict is the user's
to resolve, not ours.

## Human-only steps

Enabling the Photos Picker API in Google Cloud Console, adding the scope to the
OAuth consent screen, and running Takeout all require the account owner. No
agent can do these.

## Sources

- https://developers.google.com/photos/support/updates
- https://developers.google.com/photos/picker/reference/rest
- https://developers.google.com/photos/picker/reference/rest/v1/sessions
- https://developers.google.com/photos/picker/reference/rest/v1/mediaItems
- https://developers.google.com/photos/overview/best-practices
- https://developers.google.com/photos/support/api-policy
