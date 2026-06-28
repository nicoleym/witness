-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- NOTE: the table structure changed — each checkbox option is now its own
-- column holding 'YES' when checked (NULL otherwise), instead of a single
-- `selections` array. If you already created the old table, drop it first
-- (this discards existing rows — fine during development):
--
--   drop table if exists public.submissions;

create table if not exists public.submissions (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  -- One column per checkbox option. 'YES' when checked, NULL when not.
  know_garrett        text,
  know_niket          text,
  know_kathleen       text,
  saw_tape            text,
  saw_data            text,
  saw_abuse           text,
  saw_damages         text,
  me_too              text,
  willing_to_testify  text,
  know_how_it_works   text,

  full_name           text,
  email               text,
  user_agent          text
);

-- Enable Row Level Security. The site writes through a serverless function using
-- the service-role key, which bypasses RLS — so with NO policies defined, the
-- table is completely locked down to the public/anon API. That is what we want.
alter table public.submissions enable row level security;

-- Helpful index for reviewing who is willing to testify.
create index if not exists submissions_testify_idx
  on public.submissions (willing_to_testify, created_at desc);

-- One transcript row per submission (the written/voice statement). Written
-- through the serverless function with the service-role key; locked to the
-- public/anon API via RLS with no policies.
create table if not exists public.transcriptions (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions (id) on delete cascade,
  text           text,
  created_at     timestamptz not null default now()
);

alter table public.transcriptions enable row level security;

create index if not exists transcriptions_submission_idx
  on public.transcriptions (submission_id);
