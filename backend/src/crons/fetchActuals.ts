import { pool } from '../db.js';
import { fetchPrice, getMarketStatus } from '../services/prices.js';

export async function fetchActualPrices(): Promise<void> {
  const { isOpen } = getMarketStatus();
  if (!isOpen) return;

  const markets = await pool.query(
    `SELECT id, instrument, created_at FROM trajectory_markets
     WHERE trading_date = CURRENT_DATE AND status = 'live'`
  );

  for (const market of markets.rows) {
    try {
      const createdAt = new Date(market.created_at);
      const now = new Date();
      const hoursElapsed = Math.floor(
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
      );

      // Fetch for each hour that has elapsed (0-6)
      for (let h = 0; h <= Math.min(hoursElapsed, 6); h++) {
        const existing = await pool.query(
          'SELECT id FROM trajectory_actuals WHERE market_id = $1 AND hour_index = $2',
          [market.id, h]
        );

        if (existing.rows.length > 0) continue;

        const price = await fetchPrice(market.instrument);

        await pool.query(
          `INSERT INTO trajectory_actuals (market_id, hour_index, actual_price)
           VALUES ($1, $2, $3)
           ON CONFLICT (market_id, hour_index) DO NOTHING`,
          [market.id, h, price]
        );

        console.log(`Fetched actual price for ${market.instrument} hour ${h}: ${price}`);
      }
    } catch (err) {
      console.error(`Error fetching actuals for ${market.instrument}:`, err);
    }
  }
}
