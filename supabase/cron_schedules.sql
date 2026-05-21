-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SalesIQ · Supabase Cron Schedules
-- Run this in Supabase SQL Editor
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Enable pg_cron and pg_net extensions (needed for scheduled HTTP calls)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 1. Sync Calendly every 6 hours ──
select cron.schedule(
  'sync-calendly',
  '0 */6 * * *',   -- Every 6 hours (00:00, 06:00, 12:00, 18:00)
  $$
  select net.http_post(
    url := 'https://ieoojycxxmsaneuoxvxc.supabase.co/functions/v1/sync-calendly',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── 2. Sync Granola every 6 hours ──
select cron.schedule(
  'sync-granola',
  '30 */6 * * *',  -- Every 6 hours, offset by 30 min (00:30, 06:30, 12:30, 18:30)
  $$
  select net.http_post(
    url := 'https://ieoojycxxmsaneuoxvxc.supabase.co/functions/v1/sync-granola',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── 3. Run AI coach analysis every night at midnight IST (18:30 UTC) ──
select cron.schedule(
  'ai-coach-update',
  '30 18 * * *',   -- 18:30 UTC = 00:00 IST
  $$
  select net.http_post(
    url := 'https://ieoojycxxmsaneuoxvxc.supabase.co/functions/v1/ai-coach-update',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── View scheduled jobs ──
-- select * from cron.job;

-- ── Remove a job if needed ──
-- select cron.unschedule('sync-calendly');

-- ── Add coaching_tip column to calls table (needed by ai-coach-update) ──
alter table calls add column if not exists coaching_tip text;
alter table calls add column if not exists summary text;

-- ── Add unique constraint on follow_ups to prevent duplicates ──
alter table follow_ups 
  add column if not exists unique_key text 
  generated always as (lead_email || '::' || left(action, 100)) stored;

create unique index if not exists follow_ups_unique_key 
  on follow_ups(unique_key);
