import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';
import { authenticateAgent } from './agents.js';
import { INSTRUMENTS, fetchPrice } from '../services/prices.js';
import { getLatestPrice } from '../services/polygonStream.js';
import { calculateMAPE } from '../services/scoring.js';

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

  // DELETE /v1/trajectory/markets/today — reset all of today's markets
  app.delete('/markets/today', async (_request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const markets = await client.query(
        `SELECT id FROM trajectory_markets WHERE trading_date = CURRENT_DATE`
      );
      const marketIds = markets.rows.map((r: any) => r.id);

      if (marketIds.length > 0) {
        await client.query(
          `DELETE FROM trajectory_actuals WHERE market_id = ANY($1)`,
          [marketIds]
        );
        await client.query(
          `DELETE FROM trajectory_forecasts WHERE market_id = ANY($1)`,
          [marketIds]
        );
        await client.query(
          `DELETE FROM trajectory_markets WHERE id = ANY($1)`,
          [marketIds]
        );
      }

      await client.query('COMMIT');
      return reply.send({ deleted: marketIds.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /v1/trajectory/markets — today's open markets
  app.get('/markets', async (_request, reply) => {
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
    const { market_id, price_points, reasoning, catalyst, direction, risk, confidence } =
      request.body as {
        market_id: string;
        price_points: number[];
        reasoning?: string;
        catalyst?: string;
        direction?: string;
        risk?: string;
        confidence?: number;
      };

    if (!market_id || !price_points) {
      return reply.status(400).send({ error: 'market_id and price_points are required' });
    }

    if (!Array.isArray(price_points) || price_points.length !== 7) {
      return reply.status(400).send({ error: 'price_points must be an array of exactly 7 prices' });
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
           (market_id, agent_id, price_points, reasoning, catalyst, direction, risk, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        a.model,
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
      `SELECT hour_index, actual_price, fetched_at
       FROM trajectory_actuals
       WHERE market_id = $1
       ORDER BY hour_index`,
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

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/hour/${date}/${date}?adjusted=true&sort=asc&apiKey=${polygonKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return reply.status(404).send({ error: 'No hourly data from Polygon', raw: data });
    }

    const marketOpen = 9 * 60 + 30; // 9:30 AM ET
    const stored: Array<{ hour_index: number; actual_price: number }> = [];

    for (const bar of data.results) {
      // bar.t is epoch ms — convert to ET hour
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

      const hourIndex = Math.floor((etMinutes - marketOpen) / 60);
      if (hourIndex < 0 || hourIndex > 6) continue;

      await pool.query(
        `INSERT INTO trajectory_actuals (market_id, hour_index, actual_price)
         VALUES ($1, $2, $3)
         ON CONFLICT (market_id, hour_index) DO UPDATE SET actual_price = $3, fetched_at = NOW()`,
        [id, hourIndex, bar.c]
      );

      stored.push({ hour_index: hourIndex, actual_price: bar.c });
    }

    return reply.send({ market_id: id, instrument, date, stored });
  });

  // GET /v1/trajectory/markets/:id/live — live market view with current MAPE rankings
  app.get('/markets/:id/live', async (request, reply) => {
    const { id } = request.params as { id: string };

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
        a.model,
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
      `SELECT hour_index, actual_price, fetched_at
       FROM trajectory_actuals
       WHERE market_id = $1
       ORDER BY hour_index`,
      [id]
    );

    const actuals = actualsResult.rows;
    const actualPrices = actuals.map((a: any) => parseFloat(a.actual_price));

    // Calculate live MAPE for each forecast against available actuals
    const forecasts = forecastsResult.rows.map((f: any) => {
      let live_mape: number | null = null;

      if (actualPrices.length > 0) {
        const predicted = (f.price_points as number[]).slice(0, actualPrices.length);
        try {
          live_mape = calculateMAPE(predicted, actualPrices);
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
