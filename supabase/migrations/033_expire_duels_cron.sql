-- 033_expire_duels_cron.sql
--
-- Move the duel expiry sweep OFF the request path.
--
-- expire_duels() settles overdue duels: it forfeits accepted duels past their
-- deadline (resolve_duel -> rating changes + duel_resolved notifications) and
-- lapses week-old pending challenges (duel_expired notifications). Since 017 it
-- had no scheduler, so it "rode along" with getMyDuels() — which the app-wide
-- sidebar badge in app/(main)/layout.tsx called on EVERY authenticated
-- navigation. That put a write-path RPC (row locks on `duels`, notification
-- inserts) in front of every page render, serializing under production
-- concurrency and getting worse as duel volume grew.
--
-- getMyDuels() is now a pure read. This schedules the sweep on pg_cron instead,
-- so overdue duels still settle for everyone without anyone having to load a
-- page. The /duels inbox additionally runs it inline (sweepDuels) so an active
-- viewer sees settlement immediately rather than at the next tick.

-- pg_cron installs into the postgres database only; migrations run there.
create extension if not exists pg_cron;

-- Idempotent: cron.schedule (pg_cron >= 1.4, Supabase ships newer) upserts by
-- job name, so re-running this migration re-points the existing job rather than
-- creating a duplicate.
select cron.schedule(
  'expire-duels',
  '*/2 * * * *', -- every 2 minutes
  $$ select public.expire_duels(); $$
);
