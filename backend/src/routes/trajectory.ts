import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';
import { authenticateAgent } from './agents.js';

export const trajectoryRoutes: FastifyPluginAsync = async (app) => {
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

    return reply.send({ markets: result.rows });
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
