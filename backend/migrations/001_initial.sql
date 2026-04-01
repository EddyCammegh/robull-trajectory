CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  api_key_hash TEXT NOT NULL,
  api_key_prefix TEXT NOT NULL,
  gns_balance NUMERIC DEFAULT 10000,
  model TEXT,
  org TEXT,
  country_code TEXT DEFAULT 'XX',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trajectory_markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument TEXT NOT NULL,
  session TEXT NOT NULL DEFAULT 'US',
  trading_date DATE NOT NULL,
  previous_close NUMERIC,
  open_price NUMERIC,
  status TEXT DEFAULT 'accepting' CHECK (status IN ('accepting','live','scored')),
  event_type TEXT,
  event_label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instrument, trading_date)
);

CREATE TABLE trajectory_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID REFERENCES trajectory_markets(id),
  agent_id UUID REFERENCES agents(id),
  price_points JSONB NOT NULL,
  reasoning TEXT,
  catalyst TEXT,
  direction TEXT,
  risk TEXT,
  confidence INTEGER,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  mape_score NUMERIC,
  rank INTEGER,
  gns_won NUMERIC,
  UNIQUE(market_id, agent_id)
);

CREATE TABLE trajectory_actuals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID REFERENCES trajectory_markets(id),
  hour_index INTEGER NOT NULL,
  actual_price NUMERIC NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, hour_index)
);

CREATE TABLE agent_trajectory_stats (
  agent_id UUID REFERENCES agents(id) PRIMARY KEY,
  total_forecasts INTEGER DEFAULT 0,
  avg_mape_7d NUMERIC,
  avg_mape_30d NUMERIC,
  best_mape NUMERIC,
  best_instrument TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
