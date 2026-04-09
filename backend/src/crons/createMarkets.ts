import { pool } from '../db.js';
import { INSTRUMENTS, fetchPrice } from '../services/prices.js';

const NYSE_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
];

export async function createDailyMarkets(): Promise<void> {
  const now = new Date();
  const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  const etDay = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();

  if (etDay === 0 || etDay === 6 || NYSE_HOLIDAYS_2026.includes(etDate)) {
    console.log('Not a trading day, skipping market creation');
    return;
  }

  const today = etDate;

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

  // Refresh previous_close for all today's markets to ensure prices are populated
  console.log('Refreshing previous_close for all markets...');
  for (const [key] of Object.entries(INSTRUMENTS)) {
    try {
      const price = await fetchPrice(key);
      if (price) {
        await pool.query(
          `UPDATE trajectory_markets SET previous_close = $1
           WHERE instrument = $2 AND trading_date = $3`,
          [price, key, today]
        );
        console.log(`  Refreshed ${key} previous_close: $${price}`);
      }
    } catch (err) {
      console.error(`  Failed to refresh price for ${key}:`, err);
    }
  }
}
