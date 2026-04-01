-- Drop the old unique constraint on (market_id, hour_index)
ALTER TABLE trajectory_actuals DROP CONSTRAINT IF EXISTS trajectory_actuals_market_id_hour_index_key;

-- Rename hour_index to slot_index
ALTER TABLE trajectory_actuals RENAME COLUMN hour_index TO slot_index;

-- Add new unique constraint on (market_id, slot_index)
ALTER TABLE trajectory_actuals ADD CONSTRAINT trajectory_actuals_market_id_slot_index_key UNIQUE (market_id, slot_index);
