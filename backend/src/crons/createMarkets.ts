import { pool } from '../db.js';
import { INSTRUMENTS, fetchPrice, getMarketStatus } from '../services/prices.js';

export async function createDailyMarkets(): Promise<void> {
  const { isOpen } = getMarketStatus();
  if (!isOpen) {
    console.log('Market is closed, skipping market creation');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [key, config] of Object.entries(INSTRUMENTS)) {
    try {
      const existing = await pool.query(
        'SELECT id FROM trajectory_markets WHERE instrument = $1 AND trading_date = $2',
        [key, today]
      );

      if (existing.rows.length > 0) continue;

      let previousClose: number | null = null;
      try {
        previousClose = await fetchPrice(key);
      } catch (err) {
        console.error(`Failed to fetch previous close for ${key}:`, err);
      }

      await pool.query(
        `INSERT INTO trajectory_markets (instrument, trading_date, previous_close, status)
         VALUES ($1, $2, $3, 'accepting')`,
        [key, today, previousClose]
      );

      console.log(`Created market for ${key} on ${today}`);
    } catch (err) {
      console.error(`Error creating market for ${key}:`, err);
    }
  }
}
