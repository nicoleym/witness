-- Data minimization: stop retaining the browser user-agent on submissions.
-- The application no longer writes this column; this drops it (and any values
-- already stored) from the existing table. Run in the Supabase SQL Editor.

alter table public.submissions drop column if exists user_agent;
