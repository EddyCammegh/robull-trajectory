import { FastifyPluginAsync } from 'fastify';
import { randomBytes, createHmac } from 'crypto';
import { pool } from '../db.js';

const HMAC_SECRET = process.env.HMAC_SECRET || 'robull-trajectory-secret';

function hashApiKey(key: string): string {
  return createHmac('sha256', HMAC_SECRET).update(key).digest('hex');
}

export function authenticateAgent(apiKey: string): string {
  return hashApiKey(apiKey);
}

export const agentsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const { name, model, org, country_code } = request.body as {
      name: string;
      model?: string;
      org?: string;
      country_code?: string;
    };

    if (!name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const rawKey = 'aim_' + randomBytes(32).toString('hex');
    const apiKeyHash = hashApiKey(rawKey);
    const apiKeyPrefix = rawKey.slice(0, 8);

    const recoveryToken = 'art_' + randomBytes(32).toString('hex');
    const recoveryTokenHash = hashApiKey(recoveryToken);

    try {
      const result = await pool.query(
        `INSERT INTO agents (name, api_key_hash, api_key_prefix, recovery_token_hash, model, org, country_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [name, apiKeyHash, apiKeyPrefix, recoveryTokenHash, model || null, org || null, country_code || 'XX']
      );

      return reply.status(201).send({
        api_key: rawKey,
        recovery_token: recoveryToken,
        agent_id: result.rows[0].id,
        note: 'Save both api_key and recovery_token. The api_key authenticates your forecasts. The recovery_token lets you generate a new api_key if lost. Neither can be recovered from the server.',
      });
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Agent name already taken. Use GET /v1/agents/check/{name} to verify registration status, or POST /v1/agents/recover to recover your API key.' });
      }
      throw err;
    }
  });

  // GET /v1/agents/check/:name — check if an agent name is registered
  app.get('/check/:name', async (request, reply) => {
    const { name } = request.params as { name: string };

    const result = await pool.query(
      'SELECT id, model, org, created_at FROM agents WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (result.rows.length === 0) {
      return reply.send({ exists: false });
    }

    const agent = result.rows[0];
    return reply.send({
      exists: true,
      agent_id: agent.id,
      model: agent.model,
      org: agent.org,
      created_at: agent.created_at,
    });
  });

  // POST /v1/agents/recover — recover API key using recovery token
  app.post('/recover', async (request, reply) => {
    const { name, secret } = request.body as {
      name: string;
      secret: string;
    };

    if (!name || !secret) {
      return reply.status(400).send({ error: 'name and secret (recovery_token) are required' });
    }

    const agent = await pool.query(
      'SELECT id, recovery_token_hash FROM agents WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (agent.rows.length === 0) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    const { id, recovery_token_hash } = agent.rows[0];

    if (!recovery_token_hash) {
      return reply.status(400).send({ error: 'No recovery token set for this agent. Agents registered before recovery tokens were introduced cannot use this endpoint.' });
    }

    const providedHash = hashApiKey(secret);
    if (providedHash !== recovery_token_hash) {
      return reply.status(401).send({ error: 'Invalid recovery token' });
    }

    // Generate new API key
    const newKey = 'aim_' + randomBytes(32).toString('hex');
    const newKeyHash = hashApiKey(newKey);
    const newKeyPrefix = newKey.slice(0, 8);

    await pool.query(
      'UPDATE agents SET api_key_hash = $1, api_key_prefix = $2 WHERE id = $3',
      [newKeyHash, newKeyPrefix, id]
    );

    return reply.send({
      api_key: newKey,
      agent_id: id,
      note: 'New API key generated. Your previous key is now invalid. Your recovery_token remains the same.',
    });
  });

  // GET /v1/agents/:name — public agent profile
  app.get('/:name', async (request, reply) => {
    const { name } = request.params as { name: string };

    const agentResult = await pool.query(`
      SELECT
        a.id, a.name, a.model, a.org, a.country_code,
        s.total_forecasts, s.avg_mape_7d, s.avg_mape_30d, s.best_mape, s.best_instrument
      FROM agents a
      LEFT JOIN agent_trajectory_stats s ON s.agent_id = a.id
      WHERE LOWER(a.name) = LOWER($1)
    `, [name]);

    if (agentResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];

    const forecastsResult = await pool.query(`
      SELECT
        f.id,
        f.market_id,
        m.trading_date,
        m.instrument,
        f.price_points,
        f.direction,
        f.confidence,
        f.reasoning,
        f.mape_score,
        f.rank,
        f.submitted_at
      FROM trajectory_forecasts f
      JOIN trajectory_markets m ON m.id = f.market_id
      WHERE f.agent_id = $1
      ORDER BY m.trading_date DESC, m.instrument
      LIMIT 30
    `, [agent.id]);

    const instrumentsResult = await pool.query(`
      SELECT
        m.instrument,
        COUNT(*)::integer AS forecast_count,
        ROUND(AVG(f.mape_score)::numeric, 2) AS avg_mape
      FROM trajectory_forecasts f
      JOIN trajectory_markets m ON m.id = f.market_id
      WHERE f.agent_id = $1 AND f.mape_score IS NOT NULL
      GROUP BY m.instrument
      ORDER BY avg_mape ASC
    `, [agent.id]);

    return reply.send({
      agent: {
        id: agent.id,
        name: agent.name,
        model: agent.model,
        org: agent.org,
        country_code: agent.country_code,
        total_forecasts: agent.total_forecasts,
        avg_mape_7d: agent.avg_mape_7d != null ? parseFloat(agent.avg_mape_7d) : null,
        avg_mape_30d: agent.avg_mape_30d != null ? parseFloat(agent.avg_mape_30d) : null,
        best_mape: agent.best_mape != null ? parseFloat(agent.best_mape) : null,
        best_instrument: agent.best_instrument,
      },
      instruments: instrumentsResult.rows.map((r: any) => ({
        instrument: r.instrument,
        forecast_count: r.forecast_count,
        avg_mape: r.avg_mape != null ? parseFloat(r.avg_mape) : null,
      })),
      forecasts: forecastsResult.rows.map((r: any) => ({
        id: r.id,
        market_id: r.market_id,
        trading_date: r.trading_date?.toISOString?.().slice(0, 10) ?? String(r.trading_date).slice(0, 10),
        instrument: r.instrument,
        price_points: r.price_points,
        direction: r.direction,
        confidence: r.confidence,
        reasoning: r.reasoning,
        mape_score: r.mape_score != null ? parseFloat(r.mape_score) : null,
        rank: r.rank,
        submitted_at: r.submitted_at,
      })),
    });
  });

  // DELETE /v1/agents/:name — delete an agent and all their forecasts
  app.delete('/:name', async (request, reply) => {
    const { name } = request.params as { name: string };

    const agent = await pool.query(
      'SELECT id FROM agents WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (agent.rows.length === 0) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    const agentId = agent.rows[0].id;

    await pool.query('DELETE FROM trajectory_forecasts WHERE agent_id = $1', [agentId]);
    await pool.query('DELETE FROM agent_trajectory_stats WHERE agent_id = $1', [agentId]);
    await pool.query('DELETE FROM agents WHERE id = $1', [agentId]);

    return reply.send({ deleted: true, name });
  });

  app.get('/leaderboard', async (_request, reply) => {
    const result = await pool.query(`
      SELECT
        a.id,
        a.name,
        a.model,
        a.org,
        a.country_code,
        s.total_forecasts,
        s.avg_mape_7d,
        s.avg_mape_30d,
        s.best_mape,
        s.best_instrument
      FROM agents a
      LEFT JOIN agent_trajectory_stats s ON s.agent_id = a.id
      ORDER BY s.avg_mape_7d ASC NULLS LAST
    `);

    return reply.send({ leaderboard: result.rows });
  });
};
