import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';
import { authenticateAgent } from './agents.js';
import { INSTRUMENTS, fetchPrice } from '../services/prices.js';
import { getLatestPrice } from '../services/polygonStream.js';
import { calculateMAPE, scoreMarket, updateAgentStats } from '../services/scoring.js';

const FORECAST_SLOTS: Record<string, number[]> = {
  US:       [0, 12, 24, 36, 48, 60, 72, 77],
  CRYPTO:   [0, 36, 72, 108, 144, 180, 216, 252],
  ASIAN:    [0, 6, 12, 18, 24, 30, 36, 41],
  EUROPEAN: [0, 6, 18, 30, 42, 54, 66, 78],
};

// NYSE holidays for 2026 (month is 0-indexed)
const NYSE_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

function getETTime(): Date {
  // Compute current US Eastern time accounting for DST.
  // DST starts second Sunday of March, ends first Sunday of November.
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const day = now.getUTCDate();
  const dow = now.getUTCDay(); // 0=Sun

  // Second Sunday of March: find first Sunday in March, add 7
  const mar1Dow = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const secondSunMar = 1 + ((7 - mar1Dow) % 7) + 7;

  // First Sunday of November
  const nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstSunNov = 1 + ((7 - nov1Dow) % 7);

  // DST is active from second Sunday of March 2:00 AM local (which is 7:00 UTC)
  // until first Sunday of November 2:00 AM local (which is 6:00 UTC)
  const dstStart = Date.UTC(year, 2, secondSunMar, 7, 0, 0); // March, 07:00 UTC
  const dstEnd = Date.UTC(year, 10, firstSunNov, 6, 0, 0);   // November, 06:00 UTC

  const utcMs = now.getTime();
  const isDST = utcMs >= dstStart && utcMs < dstEnd;
  const offsetHours = isDST ? -4 : -5;

  return new Date(utcMs + offsetHours * 3600_000);
}

function isUSMarketOpen(): boolean {
  const et = getETTime();
  const dayOfWeek = et.getUTCDay(); // getUTCDay because et is already shifted

  // Must be weekday (Mon=1 .. Fri=5)
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  // Check NYSE holidays
  const dateStr = et.toISOString().slice(0, 10);
  if (NYSE_HOLIDAYS_2026.includes(dateStr)) return false;

  // Must be 9:30 AM ET or later
  const hours = et.getUTCHours();
  const minutes = et.getUTCMinutes();
  if (hours < 9 || (hours === 9 && minutes < 30)) return false;

  return true;
}

function isUSMarketClosed(): boolean {
  const et = getETTime();
  const dayOfWeek = et.getUTCDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const dateStr = et.toISOString().slice(0, 10);
  if (NYSE_HOLIDAYS_2026.includes(dateStr)) return false;

  // Must be 4:00 PM ET or later
  const hours = et.getUTCHours();
  return hours >= 16;
}

async function scoreReadyMarkets(): Promise<void> {
  const markets = await pool.query(`
    SELECT m.id FROM trajectory_markets m
    WHERE m.trading_date = CURRENT_DATE
      AND m.session = 'US'
      AND m.status = 'live'
      AND (SELECT COUNT(*) FROM trajectory_actuals a WHERE a.market_id = m.id) >= 8
  `);

  for (const market of markets.rows) {
    try {
      await scoreMarket(market.id);

      const agents = await pool.query(
        'SELECT DISTINCT agent_id FROM trajectory_forecasts WHERE market_id = $1',
        [market.id]
      );
      for (const agent of agents.rows) {
        await updateAgentStats(agent.agent_id);
      }
    } catch (err) {
      console.error(`Self-healing score error for market ${market.id}:`, err);
    }
  }
}

export const trajectoryRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/trajectory/markets/create-today — manually create today's markets
  app.post('/markets/create-today', async (_request, reply) => {
    const today = new Date().toISOString().slice(0, 10);
    const created: Array<{ id: string; instrument: string; previous_close: number | null }> = [];

    for (const key of Object.keys(INSTRUMENTS)) {
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

      const result = await pool.query(
        `INSERT INTO trajectory_markets (instrument, trading_date, previous_close, status)
         VALUES ($1, $2, $3, 'accepting')
         RETURNING id`,
        [key, today, previousClose]
      );

      created.push({ id: result.rows[0].id, instrument: key, previous_close: previousClose });
    }

    return reply.status(201).send({ created, date: today });
  });

  // POST /v1/trajectory/markets/:id/set-status — set a single market's status
  app.post('/markets/:id/set-status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    if (!['accepting', 'live', 'scored'].includes(status)) {
      return reply.status(400).send({ error: "status must be 'accepting', 'live', or 'scored'" });
    }

    const result = await pool.query(
      `UPDATE trajectory_markets SET status = $1 WHERE id = $2 RETURNING id`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    return reply.send({ id, status });
  });

  // POST /v1/trajectory/markets/refresh-prices — refresh previous_close for today's markets
  app.post('/markets/refresh-prices', async (_request, reply) => {
    const polygonKey = process.env.POLYGON_API_KEY;
    if (!polygonKey) {
      return reply.status(500).send({ error: 'POLYGON_API_KEY not set' });
    }

    const symbolMap: Record<string, string> = {
      QQQ: 'QQQ', NVDA: 'NVDA', AAPL: 'AAPL', TSLA: 'TSLA', GOLD: 'GLD',
    };

    const markets = await pool.query(
      `SELECT id, instrument FROM trajectory_markets WHERE trading_date = CURRENT_DATE`
    );

    const updated: Array<{ id: string; instrument: string; previous_close: number | null }> = [];

    for (let i = 0; i < markets.rows.length; i++) {
      const m = markets.rows[i];

      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }

      let price: number | null = null;
      const ticker = symbolMap[m.instrument] || m.instrument;
      try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${polygonKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.results?.[0]?.c != null) {
          price = data.results[0].c;
        } else {
          console.error(`No Polygon prev close for ${ticker}:`, JSON.stringify(data));
        }
      } catch (err) {
        console.error(`Failed to fetch price for ${m.instrument}:`, err);
      }

      await pool.query(
        `UPDATE trajectory_markets SET previous_close = $1 WHERE id = $2`,
        [price, m.id]
      );

      updated.push({ id: m.id, instrument: m.instrument, previous_close: price });
    }

    return reply.send({ updated });
  });

  // POST /v1/trajectory/markets/reopen-today — reset today's markets to 'accepting' (no data deleted)
  app.post('/markets/reopen-today', async (_request, reply) => {
    const result = await pool.query(
      `UPDATE trajectory_markets SET status = 'accepting' WHERE trading_date = CURRENT_DATE`
    );
    return reply.send({ reopened: result.rowCount });
  });

  // GET /v1/trajectory/history — past scored trading days
  app.get('/history', async (_request, reply) => {
    const result = await pool.query(`
      SELECT
        m.id,
        m.instrument,
        m.trading_date,
        m.session,
        m.status,
        m.previous_close,
        (SELECT COUNT(*) FROM trajectory_forecasts f WHERE f.market_id = m.id) AS forecast_count,
        (SELECT a2.name FROM trajectory_forecasts f2
         JOIN agents a2 ON a2.id = f2.agent_id
         WHERE f2.market_id = m.id AND f2.rank = 1
         LIMIT 1) AS top_agent,
        (SELECT f3.mape_score FROM trajectory_forecasts f3
         WHERE f3.market_id = m.id AND f3.rank = 1
         LIMIT 1) AS top_mape,
        (SELECT ROUND(AVG(f4.mape_score)::numeric, 2) FROM trajectory_forecasts f4
         WHERE f4.market_id = m.id AND f4.mape_score IS NOT NULL) AS avg_mape,
        (SELECT f5.direction FROM trajectory_forecasts f5
         WHERE f5.market_id = m.id AND f5.direction IS NOT NULL
         GROUP BY f5.direction ORDER BY COUNT(*) DESC LIMIT 1) AS consensus_direction
      FROM trajectory_markets m
      WHERE m.status = 'scored'
      ORDER BY m.trading_date DESC, m.instrument
    `);

    const dayMap: Record<string, any[]> = {};
    for (const row of result.rows) {
      const date = row.trading_date.toISOString?.().slice(0, 10) ?? String(row.trading_date).slice(0, 10);
      if (!dayMap[date]) dayMap[date] = [];
      dayMap[date].push({
        id: row.id,
        instrument: row.instrument,
        session: row.session,
        previous_close: row.previous_close,
        forecast_count: parseInt(row.forecast_count, 10),
        top_agent: row.top_agent,
        top_mape: row.top_mape != null ? parseFloat(row.top_mape) : null,
        avg_mape: row.avg_mape != null ? parseFloat(row.avg_mape) : null,
        consensus_direction: row.consensus_direction,
      });
    }

    const days = Object.entries(dayMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, markets]) => ({ date, markets }));

    return reply.send({ days });
  });

  // GET /v1/trajectory/markets — today's open markets
  app.get('/markets', async (_request, reply) => {
    // Auto-transition US markets from 'accepting' to 'live' at 9:30 AM ET on trading days
    if (isUSMarketOpen()) {
      await pool.query(
        `UPDATE trajectory_markets
         SET status = 'live'
         WHERE trading_date = CURRENT_DATE AND session = 'US' AND status = 'accepting'`
      );
    }

    // Auto-score US markets after 4:00 PM ET if they have enough actuals
    if (isUSMarketClosed()) {
      await scoreReadyMarkets();
    }

    const result = await pool.query(`
      SELECT
        m.id,
        m.instrument,
        m.session,
        m.trading_date,
        m.previous_close,
        m.open_price,
        m.status,
        m.event_type,
        m.event_label,
        m.created_at,
        (SELECT COUNT(*) FROM trajectory_forecasts f WHERE f.market_id = m.id) AS submission_count
      FROM trajectory_markets m
      WHERE m.trading_date = CURRENT_DATE
      ORDER BY m.instrument
    `);

    const markets = result.rows.map((m: any) => ({
      ...m,
      live_price: getLatestPrice(m.instrument),
    }));

    return reply.send({ markets });
  });

  // POST /v1/trajectory/forecast — submit a forecast
  app.post('/forecast', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer aim_')) {
      return reply.status(401).send({ error: 'Missing or invalid API key' });
    }

    const apiKey = authHeader.slice(7);
    const keyHash = authenticateAgent(apiKey);

    const agent = await pool.query(
      'SELECT id FROM agents WHERE api_key_hash = $1',
      [keyHash]
    );

    if (agent.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const agentId = agent.rows[0].id;
    const { market_id, price_points, reasoning, catalyst, direction, risk, confidence, model } =
      request.body as {
        market_id: string;
        price_points: number[];
        reasoning?: string;
        catalyst?: string;
        direction?: string;
        risk?: string;
        confidence?: number;
        model?: string;
      };

    if (!market_id || !price_points) {
      return reply.status(400).send({ error: 'market_id and price_points are required' });
    }

    if (!Array.isArray(price_points) || price_points.length !== 8) {
      return reply.status(400).send({ error: 'price_points must be an array of exactly 8 prices' });
    }

    if (price_points.some((p) => typeof p !== 'number' || isNaN(p) || p <= 0)) {
      return reply.status(400).send({ error: 'All price_points must be positive numbers' });
    }

    const market = await pool.query(
      'SELECT id, status FROM trajectory_markets WHERE id = $1',
      [market_id]
    );

    if (market.rows.length === 0) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    if (market.rows[0].status !== 'accepting') {
      return reply.status(400).send({ error: 'Market is no longer accepting submissions' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO trajectory_forecasts
           (market_id, agent_id, price_points, reasoning, catalyst, direction, risk, confidence, model)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, submitted_at`,
        [
          market_id,
          agentId,
          JSON.stringify(price_points),
          reasoning || null,
          catalyst || null,
          direction || null,
          risk || null,
          confidence ?? null,
          model || null,
        ]
      );

      return reply.status(201).send({
        forecast_id: result.rows[0].id,
        submitted_at: result.rows[0].submitted_at,
      });
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'You have already submitted a forecast for this market' });
      }
      throw err;
    }
  });

  // GET /v1/trajectory/markets/:id/results — results for a scored market
  app.get('/markets/:id/results', async (request, reply) => {
    const { id } = request.params as { id: string };

    const market = await pool.query(
      'SELECT * FROM trajectory_markets WHERE id = $1',
      [id]
    );

    if (market.rows.length === 0) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    const forecasts = await pool.query(
      `SELECT
        f.id,
        a.name AS agent_name,
        COALESCE(f.model, a.model) AS model,
        a.org,
        f.price_points,
        f.reasoning,
        f.direction,
        f.confidence,
        f.mape_score,
        f.rank,
        f.gns_won,
        f.submitted_at
      FROM trajectory_forecasts f
      JOIN agents a ON a.id = f.agent_id
      WHERE f.market_id = $1
      ORDER BY f.rank ASC NULLS LAST`,
      [id]
    );

    const actuals = await pool.query(
      `SELECT slot_index, actual_price, fetched_at
       FROM trajectory_actuals
       WHERE market_id = $1
       ORDER BY slot_index`,
      [id]
    );

    return reply.send({
      market: market.rows[0],
      actuals: actuals.rows,
      forecasts: forecasts.rows,
    });
  });

  // POST /v1/trajectory/markets/:id/backfill-actuals — backfill hourly actuals from Polygon
  app.post('/markets/:id/backfill-actuals', async (request, reply) => {
    const { id } = request.params as { id: string };
    const polygonKey = process.env.POLYGON_API_KEY;
    if (!polygonKey) {
      return reply.status(500).send({ error: 'POLYGON_API_KEY not set' });
    }

    const symbolMap: Record<string, string> = {
      QQQ: 'QQQ', NVDA: 'NVDA', AAPL: 'AAPL', TSLA: 'TSLA', GOLD: 'GLD',
    };

    const market = await pool.query(
      'SELECT id, instrument, trading_date FROM trajectory_markets WHERE id = $1',
      [id]
    );

    if (market.rows.length === 0) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    const { instrument, trading_date } = market.rows[0];
    const ticker = symbolMap[instrument] || instrument;
    const date = new Date(trading_date).toISOString().slice(0, 10);

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${date}/${date}?adjusted=true&sort=asc&apiKey=${polygonKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return reply.status(404).send({ error: 'No 5-minute data from Polygon', raw: data });
    }

    const marketOpen = 9 * 60 + 30; // 9:30 AM ET
    const stored: Array<{ slot_index: number; actual_price: number }> = [];

    for (const bar of data.results) {
      const barDate = new Date(bar.t);
      const etParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(barDate);

      const etHour = parseInt(etParts.find((p: any) => p.type === 'hour')!.value, 10);
      const etMinute = parseInt(etParts.find((p: any) => p.type === 'minute')!.value, 10);
      const etMinutes = etHour * 60 + etMinute;

      const slotIndex = Math.floor((etMinutes - marketOpen) / 5);
      if (slotIndex < 0 || slotIndex > 77) continue;

      await pool.query(
        `INSERT INTO trajectory_actuals (market_id, slot_index, actual_price)
         VALUES ($1, $2, $3)
         ON CONFLICT (market_id, slot_index) DO UPDATE SET actual_price = $3, fetched_at = NOW()`,
        [id, slotIndex, bar.c]
      );

      stored.push({ slot_index: slotIndex, actual_price: bar.c });
    }

    return reply.send({ market_id: id, instrument, date, stored });
  });

  // GET /v1/trajectory/markets/:id/live — live market view with current MAPE rankings
  app.get('/markets/:id/live', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Auto-transition US markets from 'accepting' to 'live' at 9:30 AM ET on trading days
    if (isUSMarketOpen()) {
      await pool.query(
        `UPDATE trajectory_markets
         SET status = 'live'
         WHERE trading_date = CURRENT_DATE AND session = 'US' AND status = 'accepting'`
      );
    }

    const marketResult = await pool.query(
      `SELECT id, instrument, session, trading_date, previous_close, open_price, status,
              event_type, event_label, created_at
       FROM trajectory_markets WHERE id = $1`,
      [id]
    );

    if (marketResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    const market = marketResult.rows[0];

    const forecastsResult = await pool.query(
      `SELECT
        f.id,
        f.agent_id,
        a.name AS agent_name,
        COALESCE(f.model, a.model) AS model,
        a.org,
        a.country_code,
        f.price_points,
        f.reasoning,
        f.catalyst,
        f.direction,
        f.risk,
        f.confidence,
        f.mape_score,
        f.rank,
        f.gns_won,
        f.submitted_at
      FROM trajectory_forecasts f
      JOIN agents a ON a.id = f.agent_id
      WHERE f.market_id = $1`,
      [id]
    );

    const actualsResult = await pool.query(
      `SELECT slot_index, actual_price, fetched_at
       FROM trajectory_actuals
       WHERE market_id = $1
       ORDER BY slot_index`,
      [id]
    );

    const actuals = actualsResult.rows;
    const actualsBySlot = new Map<number, number>(
      actuals.map((a: any) => [a.slot_index, parseFloat(a.actual_price)])
    );
    const slots = FORECAST_SLOTS[market.session] ?? FORECAST_SLOTS.US;

    // Calculate live MAPE for each forecast against available actuals at forecast slot positions
    const forecasts = forecastsResult.rows.map((f: any) => {
      let live_mape: number | null = null;

      const predicted: number[] = [];
      const matched: number[] = [];
      const pricePoints = f.price_points as number[];
      for (let i = 0; i < pricePoints.length; i++) {
        const actual = actualsBySlot.get(slots[i]);
        if (actual != null) {
          predicted.push(pricePoints[i]);
          matched.push(actual);
        }
      }

      if (matched.length > 0) {
        try {
          live_mape = calculateMAPE(predicted, matched);
        } catch {
          live_mape = null;
        }
      }

      return { ...f, live_mape };
    });

    // Rank by live MAPE (lowest first)
    const withMape = forecasts.filter((f: any) => f.live_mape != null);
    withMape.sort((a: any, b: any) => a.live_mape - b.live_mape);
    withMape.forEach((f: any, i: number) => { f.live_rank = i + 1; });

    const withoutMape = forecasts.filter((f: any) => f.live_mape == null);
    withoutMape.forEach((f: any) => { f.live_rank = null; });

    const rankedForecasts = [...withMape, ...withoutMape];

    return reply.send({
      market: {
        ...market,
        live_price: getLatestPrice(market.instrument),
      },
      actuals,
      forecasts: rankedForecasts,
    });
  });

  // GET /v1/trajectory/agents/:id/history — agent's forecast history
  app.get('/agents/:id/history', async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await pool.query(
      `SELECT
        f.id,
        m.instrument,
        m.trading_date,
        f.price_points,
        f.direction,
        f.confidence,
        f.mape_score,
        f.rank,
        f.gns_won,
        f.submitted_at
      FROM trajectory_forecasts f
      JOIN trajectory_markets m ON m.id = f.market_id
      WHERE f.agent_id = $1
      ORDER BY m.trading_date DESC
      LIMIT 50`,
      [id]
    );

    return reply.send({ forecasts: result.rows });
  });
};
