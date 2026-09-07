import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllCalendarsWindow,
  fetchCalendarWindow,
  listCalendarSources,
} from "@/lib/googleCalendar/fetchWindow";

const FROM = new Date("2026-03-01T00:00:00Z");
const TO = new Date("2026-03-08T00:00:00Z");

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function errorResponse(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    text: async () => body,
    json: async () => ({}),
  } as Response;
}

/** One timed event, in Google's raw events.list shape. */
function rawEvent(id: string, start = "2026-03-02T09:00:00Z") {
  return {
    id,
    summary: `Event ${id}`,
    start: { dateTime: start },
    end: { dateTime: "2026-03-02T10:00:00Z" },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchCalendarWindow", () => {
  it("follows nextPageToken until the calendar is exhausted", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("a")], nextPageToken: "p2" }))
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("b")], nextPageToken: "p3" }))
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("c")] }));

    const events = await fetchCalendarWindow("token", FROM, TO);

    expect(events.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The token has to actually travel on the follow-up requests, or the
    // loop silently re-reads page one forever.
    expect(fetchMock.mock.calls[1][0]).toContain("pageToken=p2");
    expect(fetchMock.mock.calls[2][0]).toContain("pageToken=p3");
  });

  it("stops paginating at the page cap rather than looping forever", async () => {
    // A server that always claims there is another page.
    fetchMock.mockResolvedValue(jsonResponse({ items: [rawEvent("x")], nextPageToken: "next" }));

    const events = await fetchCalendarWindow("token", FROM, TO);

    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(events).toHaveLength(10);
  });

  it("tags every event with the calendar it came from", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [rawEvent("a")] }));

    const events = await fetchCalendarWindow("token", FROM, TO, "work@group.calendar.google.com", false);

    expect(events[0].calendarId).toBe("work@group.calendar.google.com");
    expect(events[0].canEdit).toBe(false);
  });

  it("marks a bare-date event as all-day", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [{ id: "bd", summary: "יום הולדת", start: { date: "2026-03-04" }, end: { date: "2026-03-05" } }],
      })
    );

    const [event] = await fetchCalendarWindow("token", FROM, TO);

    expect(event.isAllDay).toBe(true);
    expect(event.start).toBe("2026-03-04");
  });

  it("surfaces Google's status and body on failure", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(403, "insufficient scope"));

    await expect(fetchCalendarWindow("token", FROM, TO)).rejects.toThrow(/403/);
  });
});

describe("listCalendarSources", () => {
  it("degrades to primary-only when the calendarlist scope is missing", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(403, "insufficient scope"));

    const sources = await listCalendarSources("token");

    // A grant made before the calendarlist scope existed must keep working.
    expect(sources).toEqual([{ id: "primary", title: "היומן הראשי", primary: true, canEdit: true }]);
  });

  it("skips deleted calendars and ones the user has unchecked", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          { id: "me@example.com", summary: "Personal", primary: true, accessRole: "owner" },
          { id: "work", summary: "Work", accessRole: "writer", selected: true },
          { id: "hidden", summary: "Hidden", accessRole: "reader", selected: false },
          { id: "gone", summary: "Gone", accessRole: "owner", deleted: true },
        ],
      })
    );

    const sources = await listCalendarSources("token");

    expect(sources.map((s) => s.id)).toEqual(["me@example.com", "work"]);
  });

  it("keeps the primary calendar even when it is unselected, and puts it first", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          { id: "work", summary: "Work", accessRole: "writer", selected: true },
          { id: "me@example.com", summary: "Personal", primary: true, accessRole: "owner", selected: false },
        ],
      })
    );

    const sources = await listCalendarSources("token");

    expect(sources[0].id).toBe("me@example.com");
    expect(sources[0].primary).toBe(true);
  });

  it("marks reader-access calendars as non-editable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          { id: "me@example.com", primary: true, accessRole: "owner" },
          { id: "holidays", summary: "Holidays", accessRole: "reader", selected: true },
        ],
      })
    );

    const sources = await listCalendarSources("token");

    expect(sources.find((s) => s.id === "holidays")?.canEdit).toBe(false);
  });
});

describe("fetchAllCalendarsWindow", () => {
  it("merges every calendar and sorts the result by start time", async () => {
    fetchMock
      // calendarList.list
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: "me@example.com", primary: true, accessRole: "owner" },
            { id: "work", summary: "Work", accessRole: "writer", selected: true },
          ],
        })
      )
      // The two calendars are fetched in parallel; resolve both.
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("late", "2026-03-02T15:00:00Z")] }))
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("early", "2026-03-02T08:00:00Z")] }));

    const events = await fetchAllCalendarsWindow("token", FROM, TO);

    expect(events.map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("keeps the calendars that succeeded when one of them fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: "me@example.com", primary: true, accessRole: "owner" },
            { id: "broken", summary: "Broken", accessRole: "reader", selected: true },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("ok")] }))
      .mockResolvedValueOnce(errorResponse(404, "not found"));

    const events = await fetchAllCalendarsWindow("token", FROM, TO);

    // One broken subscribed feed must not blank the whole grid.
    expect(events.map((e) => e.id)).toEqual(["ok"]);
  });

  it("throws when every calendar fails, rather than reporting an empty calendar", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "me@example.com", primary: true, accessRole: "owner" }] }))
      .mockResolvedValueOnce(errorResponse(401, "invalid credentials"));

    // A revoked token has to reach the route's catch block, which renders
    // "not connected". Returning [] here would render "you have nothing on".
    await expect(fetchAllCalendarsWindow("token", FROM, TO)).rejects.toThrow(/401/);
  });

  it("collapses an event that appears identically on the same calendar twice", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "me@example.com", primary: true, accessRole: "owner" }] }))
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("dup"), rawEvent("dup")] }));

    const events = await fetchAllCalendarsWindow("token", FROM, TO);

    expect(events).toHaveLength(1);
  });

  it("keeps the same event id when it genuinely exists on two calendars", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: "me@example.com", primary: true, accessRole: "owner" },
            { id: "work", summary: "Work", accessRole: "writer", selected: true },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("shared")] }))
      .mockResolvedValueOnce(jsonResponse({ items: [rawEvent("shared")] }));

    const events = await fetchAllCalendarsWindow("token", FROM, TO);

    // Deliberately kept: deleting one copy should not silently remove the
    // other, so both have to be addressable.
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.calendarId))).toEqual(new Set(["me@example.com", "work"]));
  });
});
