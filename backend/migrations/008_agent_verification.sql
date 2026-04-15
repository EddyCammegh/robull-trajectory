-- Lightweight agent verification: handle + timestamp of last update.
-- Badge tier (new / active / verified) is computed at query time from
-- forecast activity, not stored.
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS twitter_handle TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
