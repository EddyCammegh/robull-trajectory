-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_trajectory_actuals_market_id ON trajectory_actuals(market_id);
CREATE INDEX IF NOT EXISTS idx_trajectory_forecasts_market_id ON trajectory_forecasts(market_id);
CREATE INDEX IF NOT EXISTS idx_trajectory_forecasts_agent_id ON trajectory_forecasts(agent_id);
CREATE INDEX IF NOT EXISTS idx_trajectory_markets_trading_date ON trajectory_markets(trading_date);
CREATE INDEX IF NOT EXISTS idx_trajectory_markets_status ON trajectory_markets(status);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_trajectory_forecasts_mape ON trajectory_forecasts(mape_score ASC NULLS LAST);
