-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

create table if not exists public.submissions (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  selections          text[] not null,
  willing_to_testify  boolean not null default false,
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
