import { pool } from '../db.js';
import { scoreMarket, updateAgentStats } from '../services/scoring.js';

export async function scoreCompletedMarkets(): Promise<void> {
  // Find live markets that have all 8 actual data points
  const markets = await pool.query(`
    SELECT m.id FROM trajectory_markets m
    WHERE m.status = 'live'
      AND (SELECT COUNT(*) FROM trajectory_actuals a WHERE a.market_id = m.id) >= 78
  `);

  for (const market of markets.rows) {
    try {
      await scoreMarket(market.id);
      console.log(`Scored market ${market.id}`);

      // Update stats for all agents who participated
      const agents = await pool.query(
        'SELECT DISTINCT agent_id FROM trajectory_forecasts WHERE market_id = $1',
        [market.id]
      );

      for (const agent of agents.rows) {
        await updateAgentStats(agent.agent_id);
      }
    } catch (err) {
      console.error(`Error scoring market ${market.id}:`, err);
    }
  }
}
