-- Enable pg_cron and pg_net for scheduled observation
-- These extensions must be created before scheduling jobs.

create extension if not exists pg_cron schema pg_catalog;
create extension if not exists pg_net schema extensions;

-- Schedule daily observation at 06:00 UTC
-- Calls the /observe edge function via pg_net HTTP POST
select cron.schedule(
    'daily-moltbook-observe',
    '0 6 * * *',
    $$
    select net.http_post(
        url := 'http://edge-runtime:8081/observe',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
    );
    $$
);

-- Useful queries:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select cron.unschedule('daily-moltbook-observe');
