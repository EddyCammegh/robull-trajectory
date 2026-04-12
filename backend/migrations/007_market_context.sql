-- Market context: per-day per-instrument environmental data for research corpus

CREATE TABLE market_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES trajectory_markets(id) UNIQUE,
  vix_at_submission NUMERIC,
  vix_at_close NUMERIC,
  sp_futures_direction TEXT,
  xlk_premarket_change_pct NUMERIC,
  premarket_volume BIGINT,
  opening_gap_pct NUMERIC,
  realised_volatility_at_close NUMERIC,
  volume_vs_30day_avg NUMERIC,
  market_regime TEXT,
  news_headline_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_market_context_market_id ON market_context(market_id);

-- Forecast metadata
ALTER TABLE trajectory_forecasts
  ADD COLUMN IF NOT EXISTS submitted_at_ms BIGINT,
  ADD COLUMN IF NOT EXISTS reasoning_word_count INTEGER;

-- Consensus spread for scored markets
ALTER TABLE trajectory_markets
  ADD COLUMN IF NOT EXISTS consensus_deviation NUMERIC;
