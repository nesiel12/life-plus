alter table notification_preferences
  add column email_muted_kinds text[] not null default '{}'::text[];
