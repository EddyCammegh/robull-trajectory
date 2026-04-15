import { pool } from '../db.js';
import { INSTRUMENTS } from '../services/prices.js';

const NYSE_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
];

const POLYGON_BASE = 'https://api.polygon.io';

// Fetches yesterday's close from Polygon. Returns null on any failure so the
// caller can still create the market row with a null previous_close.
async function fetchPolygonPrevClose(
  ticker: string,
  apiKey: string
): Promise<number | null> {
  try {
    const url = `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const price = data?.results?.[0]?.c;
    return typeof price === 'number' ? price : null;
  } catch (err) {
    console.error(`[createMarkets] Polygon prev close fetch failed for ${ticker}:`, err);
    return null;
  }
}

export async function createDailyMarkets(): Promise<void> {
  const now = new Date();
  const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  const etDay = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();

  if (etDay === 0 || etDay === 6 || NYSE_HOLIDAYS_2026.includes(etDate)) {
    console.log('Not a trading day, skipping market creation');
    return;
  }

  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) {
    console.warn('POLYGON_API_KEY not set — markets will be created with null previous_close');
  }

  const today = etDate;
  const instrumentKeys = Object.keys(INSTRUMENTS);

  for (let i = 0; i < instrumentKeys.length; i++) {
    const key = instrumentKeys[i];

    // Polygon free tier: 5 req/min. Stagger calls 15s apart to stay under it.
    if (i > 0) await new Promise((r) => setTimeout(r, 15000));

    try {
      const existing = await pool.query(
        'SELECT id, previous_close FROM trajectory_markets WHERE instrument = $1 AND trading_date = $2',
        [key, today]
      );

      const previousClose = polygonKey
        ? await fetchPolygonPrevClose(key, polygonKey)
        : null;

      if (existing.rows.length > 0) {
        // Market row already exists — only patch previous_close if it's missing
        // and we successfully fetched a value. Avoids overwriting good data.
        if (existing.rows[0].previous_close == null && previousClose != null) {
          await pool.query(
            `UPDATE trajectory_markets SET previous_close = $1 WHERE id = $2`,
            [previousClose, existing.rows[0].id]
          );
          console.log(`[createMarkets] Backfilled previous_close for ${key}: $${previousClose}`);
        }
        continue;
      }

      await pool.query(
        `INSERT INTO trajectory_markets (instrument, trading_date, previous_close, status)
         VALUES ($1, $2, $3, 'accepting')`,
        [key, today, previousClose]
      );

      console.log(
        `[createMarkets] Created ${key} for ${today}` +
          (previousClose != null ? ` (prev_close $${previousClose})` : ' (prev_close NULL — fetch failed)')
      );
    } catch (err) {
      console.error(`[createMarkets] Error creating market for ${key}:`, err);
    }
  }
}
