import { pool } from '../db.js';
import { fetchPrice, getMarketStatus } from '../services/prices.js';

// Capture the official opening price for every US market once they transition
// to 'live'. Uses Polygon's snapshot endpoint which exposes `day.o` (today's
// official open), with fallbacks to the latest minute bar and last trade for
// the rare case the day open hasn't published yet.
export async function captureOpenPrices(): Promise<void> {
  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) {
    console.warn('POLYGON_API_KEY not set, skipping open price capture');
    return;
  }

  const markets = await pool.query(
    `SELECT id, instrument FROM trajectory_markets
     WHERE trading_date = CURRENT_DATE
       AND session = 'US'
       AND open_price IS NULL`
  );

  for (let i = 0; i < markets.rows.length; i++) {
    const m = markets.rows[i];
    // Polygon free tier: 5 req/min. Stagger calls.
    if (i > 0) await new Promise((r) => setTimeout(r, 15000));

    try {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${m.instrument}?apiKey=${polygonKey}`;
      const res = await fetch(url);
      const data = await res.json();
      const snap = data?.ticker;
      const price: number | null =
        snap?.day?.o || snap?.min?.o || snap?.lastTrade?.p || null;

      if (price == null || price <= 0) {
        console.error(
          `[Open price] No price from Polygon for ${m.instrument}: ${JSON.stringify(data).slice(0, 200)}`
        );
        continue;
      }

      await pool.query(
        `UPDATE trajectory_markets SET open_price = $1 WHERE id = $2`,
        [price, m.id]
      );
      console.log(`[Open price] ${m.instrument} = $${price}`);
    } catch (err) {
      console.error(`[Open price] Failed for ${m.instrument}:`, err);
    }
  }
}

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
