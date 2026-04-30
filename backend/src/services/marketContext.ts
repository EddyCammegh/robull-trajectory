import { pool } from '../db.js';
import { INSTRUMENTS } from './prices.js';

const POLYGON_BASE = 'https://api.polygon.io';
const VIX_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX';

const SYMBOL_MAP: Record<string, string> = {
  AAPL: 'AAPL', NVDA: 'NVDA', META: 'META', MSFT: 'MSFT', SPY: 'SPY',
};

async function fetchVix(): Promise<number | null> {
  try {
    const res = await fetch(VIX_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(`[ctx] VIX fetch HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price !== 'number') {
      console.error('[ctx] VIX response missing regularMarketPrice', JSON.stringify(data).slice(0, 300));
      return null;
    }
    return price;
  } catch (err) {
    console.error('[ctx] VIX fetch failed:', err);
    return null;
  }
}

async function fetchNewsHeadlineCount(ticker: string, key: string): Promise<number | null> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url = `${POLYGON_BASE}/v2/reference/news?ticker=${ticker}&published_utc.gte=${since}&limit=50`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[ctx] Polygon news HTTP ${res.status} for ${ticker}: ${await res.text().catch(() => '')}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results.length : null;
  } catch (err) {
    console.error(`[ctx] Polygon news fetch failed for ${ticker}:`, err);
    return null;
  }
}

async function fetchPolygonPrevClose(ticker: string, key: string): Promise<number | null> {
  try {
    const url = `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/prev?adjusted=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[ctx] Polygon prev close HTTP ${res.status} for ${ticker}: ${await res.text().catch(() => '')}`);
      return null;
    }
    const data = await res.json();
    return data?.results?.[0]?.c ?? null;
  } catch (err) {
    console.error(`[ctx] Polygon prev close failed for ${ticker}:`, err);
    return null;
  }
}

// Fetch 1-minute bars for `date` (YYYY-MM-DD) and return only those before 9:30 ET.
// Returns { lastPrice, totalVolume } from the premarket window (4:00-9:30 ET).
async function fetchPremarketBars(
  ticker: string,
  date: string,
  key: string
): Promise<{ lastPrice: number | null; totalVolume: number }> {
  try {
    const url = `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/1/minute/${date}/${date}?adjusted=false&sort=asc&limit=50000`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[ctx] Polygon premarket bars HTTP ${res.status} for ${ticker}: ${await res.text().catch(() => '')}`);
      return { lastPrice: null, totalVolume: 0 };
    }
    const data = await res.json();
    const bars = data?.results ?? [];

    const marketOpen = 9 * 60 + 30;
    let totalVolume = 0;
    let lastPrice: number | null = null;

    for (const bar of bars) {
      const barDate = new Date(bar.t);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(barDate);
      const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
      const m = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
      const minutes = h * 60 + m;
      if (minutes < marketOpen) {
        totalVolume += bar.v ?? 0;
        lastPrice = bar.c ?? lastPrice;
      }
    }

    return { lastPrice, totalVolume };
  } catch (err) {
    console.error(`Polygon premarket bars failed for ${ticker}:`, err);
    return { lastPrice: null, totalVolume: 0 };
  }
}

async function upsertMarketContext(
  marketId: string,
  fields: Record<string, number | string | null>
): Promise<void> {
  const keys = Object.keys(fields);
  const cols = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 2}`).join(', ');
  const updates = keys.map((k) => `${k} = EXCLUDED.${k}`).join(', ');
  const values = keys.map((k) => fields[k]);

  const sql = `INSERT INTO market_context (market_id, ${cols})
     VALUES ($1, ${placeholders})
     ON CONFLICT (market_id) DO UPDATE SET ${updates}`;

  try {
    const result = await pool.query(sql, [marketId, ...values]);
    console.log(`[ctx] upsert ok market_id=${marketId} rows=${result.rowCount} fields=${JSON.stringify(fields)}`);
  } catch (err) {
    console.error(
      `[ctx] upsert FAILED market_id=${marketId} fields=${JSON.stringify(fields)} sql=${sql}`,
      err
    );
    throw err;
  }
}

// Run at 7:00 AM ET. Captures VIX at submission window, XLK premarket change,
// and per-instrument premarket volume.
export async function collectPreMarketContext(): Promise<void> {
  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) {
    console.error('[ctx] POLYGON_API_KEY not set — skipping pre-market context');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log(`[ctx] collectPreMarketContext starting for date=${today}`);

  const vix = await fetchVix();
  const xlkPrev = await fetchPolygonPrevClose('XLK', polygonKey);
  const xlkPre = await fetchPremarketBars('XLK', today, polygonKey);
  const xlkPremarketChangePct =
    xlkPrev != null && xlkPre.lastPrice != null
      ? ((xlkPre.lastPrice - xlkPrev) / xlkPrev) * 100
      : null;
  console.log(
    `[ctx] vix=${vix} xlkPrev=${xlkPrev} xlkPreLast=${xlkPre.lastPrice} xlkChangePct=${xlkPremarketChangePct}`
  );

  const markets = await pool.query(
    `SELECT id, instrument FROM trajectory_markets
     WHERE trading_date = CURRENT_DATE AND session = 'US'`
  );

  if (markets.rows.length === 0) {
    // Most likely cause of empty market_context: no markets exist for today.
    // Could be createDailyMarkets failing, a session != 'US' mismatch, or a
    // CURRENT_DATE / trading_date timezone skew (DB likely UTC, trading_date is ET).
    const diag = await pool.query(
      `SELECT trading_date, session, COUNT(*) AS n
       FROM trajectory_markets
       WHERE trading_date >= CURRENT_DATE - INTERVAL '2 days'
       GROUP BY trading_date, session ORDER BY trading_date DESC`
    );
    console.error(
      `[ctx] preMarket: 0 markets matched trading_date=CURRENT_DATE session='US'. ` +
        `Recent rows: ${JSON.stringify(diag.rows)}`
    );
    return;
  }

  console.log(`[ctx] preMarket: processing ${markets.rows.length} markets`);
  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < markets.rows.length; i++) {
    const m = markets.rows[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 15000)); // Polygon free tier rate limit

    try {
      const ticker = SYMBOL_MAP[m.instrument] ?? m.instrument;
      const pre = await fetchPremarketBars(ticker, today, polygonKey);
      const newsCount = await fetchNewsHeadlineCount(ticker, polygonKey);

      await upsertMarketContext(m.id, {
        vix_at_submission: vix,
        xlk_premarket_change_pct: xlkPremarketChangePct,
        premarket_volume: pre.totalVolume || null,
        news_headline_count: newsCount,
      });
      okCount++;
    } catch (err) {
      failCount++;
      console.error(
        `[ctx] preMarket: FAILED for market_id=${m.id} instrument=${m.instrument}`,
        err
      );
    }
  }

  console.log(`[ctx] preMarket done: ok=${okCount} fail=${failCount} total=${markets.rows.length}`);
}

// VIX bands and trending threshold for regime classification.
const VIX_LOW = 13;
const VIX_HIGH = 25;
const TRENDING_RATIO = 1.5; // |return| > TRENDING_RATIO × intraday vol → trending

function classifyRegime(
  vix: number | null,
  openPrice: number | null,
  closePrice: number | null,
  realisedVolPct: number | null
): string | null {
  if (vix == null) return null;
  if (vix >= VIX_HIGH) return 'high_vol';
  if (vix <= VIX_LOW) return 'low_vol';

  if (openPrice != null && closePrice != null && openPrice !== 0 && realisedVolPct != null) {
    const returnPct = Math.abs((closePrice - openPrice) / openPrice) * 100;
    if (returnPct > TRENDING_RATIO * realisedVolPct && returnPct > 0.5) {
      return 'trending';
    }
  }

  return 'normal';
}

// Run at 4:00 PM ET. Captures VIX at close, opening gap %, and market regime.
export async function collectCloseContext(): Promise<void> {
  console.log('[ctx] collectCloseContext starting');
  const vix = await fetchVix();
  console.log(`[ctx] close vix=${vix}`);

  const markets = await pool.query(
    `SELECT id, instrument, previous_close, open_price
     FROM trajectory_markets
     WHERE trading_date = CURRENT_DATE AND session = 'US'`
  );

  if (markets.rows.length === 0) {
    const diag = await pool.query(
      `SELECT trading_date, session, COUNT(*) AS n
       FROM trajectory_markets
       WHERE trading_date >= CURRENT_DATE - INTERVAL '2 days'
       GROUP BY trading_date, session ORDER BY trading_date DESC`
    );
    console.error(
      `[ctx] close: 0 markets matched trading_date=CURRENT_DATE session='US'. ` +
        `Recent rows: ${JSON.stringify(diag.rows)}`
    );
    return;
  }

  console.log(`[ctx] close: processing ${markets.rows.length} markets`);
  let okCount = 0;
  let failCount = 0;

  for (const m of markets.rows) {
    try {
      const prev = m.previous_close != null ? parseFloat(m.previous_close) : null;
      const open = m.open_price != null ? parseFloat(m.open_price) : null;
      const openingGapPct =
        prev != null && open != null && prev !== 0
          ? ((open - prev) / prev) * 100
          : null;

      const actuals = await pool.query(
        `SELECT actual_price FROM trajectory_actuals
         WHERE market_id = $1 ORDER BY slot_index ASC`,
        [m.id]
      );
      const prices = actuals.rows
        .map((r: any) => parseFloat(r.actual_price))
        .filter((v: number) => !isNaN(v));

      let closePrice: number | null = null;
      let realisedVolPct: number | null = null;
      if (prices.length >= 2) {
        closePrice = prices[prices.length - 1];
        const mean = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
        const variance =
          prices.reduce((acc: number, v: number) => acc + (v - mean) ** 2, 0) /
          (prices.length - 1);
        const std = Math.sqrt(variance);
        realisedVolPct = mean !== 0 ? (std / mean) * 100 : null;
      } else {
        console.warn(
          `[ctx] close: only ${prices.length} actuals for market_id=${m.id} ` +
            `instrument=${m.instrument} — closePrice/realisedVol will be null`
        );
      }

      const regime = classifyRegime(vix, open, closePrice, realisedVolPct);

      await upsertMarketContext(m.id, {
        vix_at_close: vix,
        opening_gap_pct: openingGapPct,
        market_regime: regime,
      });
      okCount++;
    } catch (err) {
      failCount++;
      console.error(
        `[ctx] close: FAILED for market_id=${m.id} instrument=${m.instrument}`,
        err
      );
    }
  }

  console.log(`[ctx] close done: ok=${okCount} fail=${failCount} total=${markets.rows.length}`);
}
