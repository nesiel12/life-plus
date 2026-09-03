import "server-only";

// Google Photos Picker API client.
//
// Shapes here were verified against the live reference on 2026-09-03 (see
// docs/GOOGLE_PHOTOS_CONSTRAINTS.md). The API surface is deliberately tiny:
// two resources, four methods. There is no albums resource, no webhook, and no
// way to look a media item up by id — everything is scoped to a session.

const PICKER_BASE = "https://photospicker.googleapis.com/v1";

/** The only scope this app requests for Photos. Read-only, picker-scoped. */
export const PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

export interface PollingConfig {
  /** Recommended wait between sessions.get calls, e.g. "5s". */
  pollInterval?: string;
  /** How long to keep polling before giving up, e.g. "1800s". */
  timeoutIn?: string;
}

export interface PickingSession {
  id: string;
  pickerUri: string;
  /** Absent once mediaItemsSet is true — callers must not assume it exists. */
  pollingConfig?: PollingConfig;
  expireTime?: string;
  mediaItemsSet?: boolean;
}

export interface PickedMediaItem {
  id: string;
  /** When the photo was taken, NOT when it was uploaded. */
  createTime: string;
  type: "TYPE_UNSPECIFIED" | "PHOTO" | "VIDEO";
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename?: string;
  };
}

export class PickerApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "PickerApiError";
  }
}

async function pickerFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PICKER_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.error?.message ?? detail;
    } catch {
      // non-JSON error body; the status is enough
    }
    throw new PickerApiError(detail, res.status);
  }

  return (await res.json()) as T;
}

export function createPickingSession(
  accessToken: string,
  options: { maxItemCount?: number } = {}
): Promise<PickingSession> {
  const body = options.maxItemCount
    ? { pickingConfig: { maxItemCount: String(options.maxItemCount) } }
    : {};
  return pickerFetch<PickingSession>("/sessions", accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getPickingSession(accessToken: string, sessionId: string): Promise<PickingSession> {
  return pickerFetch<PickingSession>(`/sessions/${encodeURIComponent(sessionId)}`, accessToken);
}

/** Recommended after ingest — sessions count against an undocumented cap. */
export async function deletePickingSession(accessToken: string, sessionId: string): Promise<void> {
  await fetch(`${PICKER_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function listPickedMediaItems(
  accessToken: string,
  sessionId: string
): Promise<PickedMediaItem[]> {
  const items: PickedMediaItem[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ sessionId, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await pickerFetch<{
      mediaItems?: PickedMediaItem[];
      nextPageToken?: string;
    }>(`/mediaItems?${params}`, accessToken);

    items.push(...(page.mediaItems ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * Downloads the actual bytes for a picked item.
 *
 * Two things make this unlike a normal image fetch, and both are easy to get
 * wrong: the baseUrl requires an Authorization header (so it can never be used
 * as an <img src>), and it requires a size suffix or it returns an error rather
 * than a default rendition. `=w{n}-h{n}` asks Google to do the first resize
 * server-side, so we transfer far less than the original.
 */
export async function downloadPickedMedia(
  accessToken: string,
  item: PickedMediaItem,
  maxEdge: number
): Promise<Uint8Array> {
  const url = `${item.mediaFile.baseUrl}=w${maxEdge}-h${maxEdge}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!res.ok) {
    throw new PickerApiError(
      `Failed to download media ${item.id}: ${res.status} ${res.statusText}`,
      res.status
    );
  }

  return new Uint8Array(await res.arrayBuffer());
}

/** "5s" -> 5000. Falls back when the field is absent or unparseable. */
export function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match) return fallbackMs;
  const ms = Number(match[1]) * 1000;
  return Number.isFinite(ms) && ms > 0 ? ms : fallbackMs;
}
