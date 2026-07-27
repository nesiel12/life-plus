-- AI Companion message management (Phase 10): pinning needs a real column.
-- Delete-message and clear-chat need no schema change at all — chat_messages
-- already has (id, user_id), and createUserScopedRepo's generic remove()
-- already works against it.
--
-- pinned_at is a nullable timestamp, not a plain boolean — the same
-- "null = not done yet" convention knowledge_entries.last_reviewed_at and
-- habit_logs already use — so pinned messages can be ordered by when they
-- were pinned (most-recently-pinned first) instead of arbitrary insertion
-- order, the same reasoning that shaped every other nullable-timestamp
-- column in this schema.

alter table chat_messages add column pinned_at timestamptz;
