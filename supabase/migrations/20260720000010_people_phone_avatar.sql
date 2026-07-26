-- Family CRM upgrade (docs/ATLAS_ARCHITECTURE_VISION.md): two small,
-- additive columns for the two genuinely missing pieces — quick
-- communication (call/WhatsApp need a real phone number on file) and
-- profile pictures.
--
-- avatar_url stores a data: URL (a client-side-resized, compressed JPEG),
-- not a Supabase Storage object path — deliberately: this app has no file
-- storage bucket/policy set up anywhere yet, and provisioning one for a
-- single small profile picture per person would be new infrastructure
-- disproportionate to the actual need. A data URL needs zero new
-- infrastructure and lives in the same row as everything else about the
-- person. Revisit only if a real need for larger/shared media ever
-- justifies standing up real object storage.

alter table people
  add column phone text,
  add column avatar_url text;
