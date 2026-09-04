-- Family & Friends WhatsApp overhaul: gender-aware Hebrew, role templates.
--
-- `gender` is nullable on purpose and has no default. Hebrew conjugates the
-- second person by gender, so a message cannot be written correctly without
-- it — but defaulting it would silently pick one for every existing contact,
-- and addressing someone in the wrong gender is exactly the small insult
-- that makes a person abandon the feature. NULL means "not set", and
-- lib/family/whatsapp.ts renders genuinely neutral phrasing for that case
-- rather than guessing.
--
-- `role` is distinct from the existing free-text `relation` column rather
-- than replacing it: relation holds whatever the user typed and is shown in
-- the UI, while role is a closed set that selects a message template.
-- Collapsing them would either constrain what the user may write or make
-- template selection depend on matching free text.

alter table people add column if not exists gender text
  check (gender is null or gender in ('male', 'female'));

alter table people add column if not exists role text
  check (role is null or role in ('mother', 'father', 'grandfather', 'grandmother', 'friend', 'other'));

alter table people add column if not exists message_template text;
