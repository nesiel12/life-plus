# Google OAuth setup — fixing `Error 400: redirect_uri_mismatch`

The app uses Google OAuth in **two** places, each with its own redirect URI:

| Flow | Redirect URI (path) | Where it's built |
|---|---|---|
| Sign-in (NextAuth) | `/api/auth/callback/google` | NextAuth, from `NEXTAUTH_URL` |
| Google Photos connect | `/api/photos/callback` | `lib/photos/auth.ts`, from `NEXTAUTH_URL` (`lib/appUrl.ts`) |

`redirect_uri_mismatch` means the full URI the app sent to Google is **not
byte-for-byte** in the OAuth client's *Authorized redirect URIs* list. It is
always a console/env problem, never a code bug — the string just has to match.

## 1. Decide the canonical origin

Pick the **one** origin the app is served from in production, e.g.
`https://life-plus-app.vercel.app` or `https://app.yourdomain.com`. No trailing
slash. Not a `*-git-*.vercel.app` preview URL, not `www.` if the app redirects
away from `www`.

## 2. Set it as `NEXTAUTH_URL`

Vercel → Project → Settings → Environment Variables → `NEXTAUTH_URL` =
that origin, for the **Production** environment. Redeploy.

The app derives every Google redirect URI from this value, so it must be
exactly the origin browsers actually use. (If `NEXTAUTH_URL` is unset in
production the app now falls back to `https://$VERCEL_PROJECT_PRODUCTION_URL`,
but setting it explicitly is still correct and required for a custom domain.)

## 3. Register both redirect URIs in Google Cloud Console

[console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
→ your **OAuth 2.0 Client ID** (the one whose id/secret are
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) → **Authorized redirect URIs** →
add **both**, exactly (replace the origin with yours):

```
https://YOUR-ORIGIN/api/auth/callback/google
https://YOUR-ORIGIN/api/photos/callback
```

Also add the local pair for development:

```
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/photos/callback
```

Under **Authorized JavaScript origins** add `https://YOUR-ORIGIN` and
`http://localhost:3000`.

Save. Google can take a few minutes to propagate.

## 4. Verify from inside the app

Settings → **חיבורי Google** shows the two redirect URIs the running
deployment is actually sending, with copy buttons — paste those verbatim into
the console. If what's shown there is a preview or localhost URL in
production, fix `NEXTAUTH_URL` (step 2) first.

`GET /api/auth/redirect-uris` (signed in) returns the same values as JSON.

## 5. Photos scope note

The Photos connect flow requests
`https://www.googleapis.com/auth/photospicker.mediaitems.readonly`. If the
OAuth consent screen is in *Testing*, the signing-in account must be listed
under **Test users**, or consent fails after the redirect URI is already
correct — a different error (`access_denied`), not `redirect_uri_mismatch`.
