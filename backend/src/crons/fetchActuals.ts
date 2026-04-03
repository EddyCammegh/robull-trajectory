import { pool } from '../db.js';
import { fetchPrice, getMarketStatus } from '../services/prices.js';

export async function fetchActualPrices(): Promise<void> {
  const { isOpen } = getMarketStatus();
  if (!isOpen) return;

  const markets = await pool.query(
    `SELECT id, instrument FROM trajectory_markets
     WHERE trading_date = CURRENT_DATE AND status IN ('accepting', 'live')`
  );

  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const etMinutes = et.getHours() * 60 + et.getMinutes();
  const marketOpen = 9 * 60 + 30;
  const slotIndex = Math.min(Math.floor((etMinutes - marketOpen) / 5), 77);

  if (slotIndex < 0) return;

  for (const market of markets.rows) {
    try {
      // Only fetch if this slot is missing — don't overwrite Polygon WebSocket data
      const existing = await pool.query(
        'SELECT 1 FROM trajectory_actuals WHERE market_id = $1 AND slot_index = $2',
        [market.id, slotIndex]
      );

      if (existing.rows.length > 0) {
        continue;
      }

      const price = await fetchPrice(market.instrument);

      await pool.query(
        `INSERT INTO trajectory_actuals (market_id, slot_index, actual_price)
         VALUES ($1, $2, $3)
         ON CONFLICT (market_id, slot_index) DO NOTHING`,
        [market.id, slotIndex, price]
      );

      console.log(`Backfilled actual price for ${market.instrument} slot ${slotIndex}: ${price}`);
    } catch (err) {
      console.error(`Error fetching actuals for ${market.instrument}:`, err);
    }
  }
}
