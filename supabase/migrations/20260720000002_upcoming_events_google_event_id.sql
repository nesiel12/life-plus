-- Accepting a schedule suggestion now creates a real Google Calendar event
-- (app/api/calendar/events), not just a local row. Track the resulting
-- event id so a future "unaccept"/sync feature has something to act on, and
-- so it's visible which upcoming_events rows are actually calendar-backed.

alter table upcoming_events add column google_event_id text;
