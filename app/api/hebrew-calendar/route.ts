import { NextResponse } from "next/server";
import { HDate, HebrewCalendar, flags } from "@hebcal/core";

// Hebrew date + the next few Jewish holidays, computed offline with
// @hebcal/core (no external API, no key). Cached for the hour: the answer
// only changes at the Hebrew-date boundary and this route is polled on every
// dashboard mount.
export const runtime = "nodejs";
export const revalidate = 3600;

interface UpcomingHoliday {
  name: string;
  hebrewName: string;
  gregorianDate: string;
  daysUntil: number;
  major: boolean;
}

export interface HebrewCalendarResponse {
  hebrewDate: string;
  hebrewDateGematriya: string;
  todayHolidays: string[];
  upcoming: UpcomingHoliday[];
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export async function GET() {
  const today = startOfDay(new Date());
  const hToday = new HDate(today);

  const events = HebrewCalendar.calendar({
    start: new HDate(today),
    end: new HDate(new Date(today.getTime() + 400 * 24 * 60 * 60 * 1000)),
    sedrot: false,
    candlelighting: false,
    noRoshChodesh: true,
  });

  const todayHolidays: string[] = [];
  const upcoming: UpcomingHoliday[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    const evDate = startOfDay(ev.getDate().greg());
    const daysUntil = Math.round((evDate.getTime() - today.getTime()) / 86_400_000);
    const major = Boolean(ev.getFlags() & (flags.CHAG | flags.MAJOR_FAST | flags.SPECIAL_SHABBAT));
    const enName = ev.render("en");

    if (daysUntil === 0) {
      todayHolidays.push(ev.render("he"));
      continue;
    }
    const key = enName.replace(/\s+(\d{4}|[IVX]+)$/, "").trim();
    if (seen.has(key)) continue;
    seen.add(key);

    upcoming.push({
      name: enName,
      hebrewName: ev.render("he"),
      gregorianDate: evDate.toISOString().slice(0, 10),
      daysUntil,
      major,
    });
    if (upcoming.length >= 6) break;
  }

  const payload: HebrewCalendarResponse = {
    hebrewDate: hToday.render("he"),
    hebrewDateGematriya: hToday.renderGematriya(),
    todayHolidays,
    upcoming,
  };
  return NextResponse.json(payload);
}
