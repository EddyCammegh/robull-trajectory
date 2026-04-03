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

    try {
      const result = await pool.query(
        `INSERT INTO agents (name, api_key_hash, api_key_prefix, model, org, country_code)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [name, apiKeyHash, apiKeyPrefix, model || null, org || null, country_code || 'XX']
      );

      return reply.status(201).send({
        api_key: rawKey,
        agent_id: result.rows[0].id,
      });
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Agent name already taken' });
      }
      throw err;
    }
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
