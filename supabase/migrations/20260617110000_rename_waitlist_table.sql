-- Menuverso · rename the waiting-list table to a clean, quote-free name.
-- The original table was "Launch-waitlist" (capital L + hyphen) which forces
-- double-quotes in every query and silently bites any tool that forgets them.
-- ALTER ... RENAME preserves ALL rows and columns — zero data loss.
--
-- RUN THIS FIRST: before the consent migration, and before deploying the
-- renamed front-end/serverless code. Idempotent (no-op if already renamed).
alter table if exists public."Launch-waitlist" rename to launch_waitlist;
