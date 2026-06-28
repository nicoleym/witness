-- Rate limiting backed by Supabase. Run in the Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- Creates a counter table and an atomic "hit" function. The serverless
-- functions call rate_limit_hit() via the service-role key on each request.

create table if not exists public.rate_limits (
  bucket        text primary key,
  count         int not null default 0,
  window_start  timestamptz not null default now()
);

-- Only the service role touches this table; lock out the public/anon API.
alter table public.rate_limits enable row level security;

-- Atomically increments the counter for a bucket (e.g. "submit:1.2.3.4"),
-- resetting it when the current window has elapsed. Returns whether the
-- request is allowed and, if not, how many seconds until the window resets.
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_max int,
  p_window_seconds int
)
returns table(allowed boolean, retry_after int)
language plpgsql
as $$
declare
  v_now    timestamptz := now();
  v_count  int;
  v_start  timestamptz;
begin
  insert into public.rate_limits as rl (bucket, count, window_start)
  values (p_bucket, 1, v_now)
  on conflict (bucket) do update
    set
      count = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds)
          then 1
        else rl.count + 1
      end,
      window_start = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds)
          then v_now
        else rl.window_start
      end
  returning rl.count, rl.window_start into v_count, v_start;

  if v_count <= p_max then
    return query select true, 0;
  else
    return query select
      false,
      greatest(
        0,
        ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::int
      );
  end if;
end;
$$;

-- Optional housekeeping: prune stale buckets. Safe to run periodically.
-- delete from public.rate_limits where window_start < now() - interval '1 day';
