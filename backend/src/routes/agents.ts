import { FastifyPluginAsync } from 'fastify';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { pool } from '../db.js';

if (!process.env.HMAC_SECRET) {
  throw new Error('HMAC_SECRET env var is required');
}
const HMAC_SECRET = process.env.HMAC_SECRET;

function hashApiKey(key: string): string {
  return createHmac('sha256', HMAC_SECRET).update(key).digest('hex');
}

export function authenticateAgent(apiKey: string): string {
  return hashApiKey(apiKey);
}

// Constant-time hex-hash comparison. Both inputs are expected to be 64-char
// SHA-256 hex strings; a length mismatch returns false without calling into
// timingSafeEqual (which would throw).
function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ── Name validation ───────────────────────────────────────────────────────

const BLOCKED_TERMS = [
  'fuck', 'fuk', 'fck', 'fuq', 'fux', 'phuck', 'phuk',
  'shit', 'sht', 'sh1t',
  'cunt', 'kunt',
  'nigger', 'nigga', 'nigg3r', 'n1gger', 'n1gga',
  'faggot', 'fag', 'f4g',
  'retard', 'r3tard',
  'bitch', 'b1tch', 'btch',
  'asshole', 'a55hole',
  'dick', 'd1ck',
  'pussy', 'puss1',
  'whore', 'wh0re',
  'slut', 'sl0t',
  'cock', 'c0ck',
  'twat', 'tw4t',
  'wank', 'w4nk',
  // Platform + vendor impersonation
  'robull', 'admin', 'system', 'official',
  'anthropic', 'openai', 'mistral', 'google', 'xai', 'meta',
];

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateAgentName(name: string): string | null {
  if (name.length < 2) return 'Agent name must be at least 2 characters.';
  if (name.length > 30) return 'Agent name must be 30 characters or fewer.';
  if (!NAME_PATTERN.test(name)) return 'Agent name may only contain letters, numbers, hyphens and underscores.';
  if (/^[0-9]+$/.test(name)) return 'Agent name cannot be all numbers.';
  if (/^[-_]/.test(name) || /[-_]$/.test(name)) return 'Agent name cannot start or end with a hyphen or underscore.';

  const lower = name.toLowerCase();
  for (const term of BLOCKED_TERMS) {
    if (lower.includes(term)) {
      return 'Agent name is not permitted. Please choose a different name.';
    }
  }

  return null;
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

    const nameError = validateAgentName(name);
    if (nameError) {
      return reply.status(400).send({ error: nameError });
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
    if (!hashesEqual(providedHash, recovery_token_hash)) {
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
      WITH agent_activity AS (
        SELECT
          f.agent_id,
          COUNT(DISTINCT m.trading_date)::int AS total_days,
          COUNT(DISTINCT m.trading_date) FILTER (
            WHERE m.trading_date >= CURRENT_DATE - INTERVAL '9 days'
          )::int AS recent_days
        FROM trajectory_forecasts f
        JOIN trajectory_markets m ON m.id = f.market_id
        GROUP BY f.agent_id
      )
      SELECT
        a.id, a.name, a.model, a.org, a.country_code,
        a.twitter_handle, a.verified_at,
        s.total_forecasts, s.avg_mape_7d, s.avg_mape_30d, s.best_mape, s.best_instrument,
        COALESCE(act.total_days, 0)  AS total_days,
        COALESCE(act.recent_days, 0) AS recent_days,
        CASE
          WHEN COALESCE(act.recent_days, 0) >= 7 AND a.twitter_handle IS NOT NULL THEN 'verified'
          WHEN COALESCE(act.total_days, 0)  >= 3 THEN 'active'
          ELSE 'new'
        END AS verification_badge
      FROM agents a
      LEFT JOIN agent_trajectory_stats s ON s.agent_id = a.id
      LEFT JOIN agent_activity act       ON act.agent_id = a.id
      WHERE LOWER(a.name) = LOWER($1)
    `, [name]);

    if (agentResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];

    const hitRateResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE f.direction IN ('bullish','bearish')) AS direction_total,
        COUNT(*) FILTER (
          WHERE (f.direction = 'bullish' AND close.actual_price > m.open_price)
             OR (f.direction = 'bearish' AND close.actual_price < m.open_price)
        ) AS direction_hits
      FROM trajectory_forecasts f
      JOIN trajectory_markets m ON m.id = f.market_id
      LEFT JOIN LATERAL (
        SELECT actual_price FROM trajectory_actuals
        WHERE market_id = m.id ORDER BY slot_index DESC LIMIT 1
      ) close ON true
      WHERE f.agent_id = $1
        AND m.status = 'scored'
        AND m.open_price IS NOT NULL
        AND close.actual_price IS NOT NULL
    `, [agent.id]);

    const hr = hitRateResult.rows[0];
    const directionTotal = parseInt(hr.direction_total, 10);
    const directionHits = parseInt(hr.direction_hits, 10);
    const directionHitRate =
      directionTotal > 0 ? Math.round((1000 * directionHits) / directionTotal) / 10 : null;

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
        direction_hit_rate: directionHitRate,
        twitter_handle: agent.twitter_handle,
        verified_at: agent.verified_at,
        verification_badge: agent.verification_badge as 'new' | 'active' | 'verified',
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

  // PATCH /v1/agents/:id/twitter — set or clear the agent's Twitter handle.
  // Auth: Bearer aim_<key> belonging to the agent being patched.
  app.patch('/:id/twitter', async (request, reply) => {
    const { id } = request.params as { id: string };
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer aim_')) {
      return reply.status(401).send({ error: 'Missing or invalid API key' });
    }

    const apiKey = authHeader.slice(7);
    const keyHash = hashApiKey(apiKey);

    const agent = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND api_key_hash = $2',
      [id, keyHash]
    );
    if (agent.rows.length === 0) {
      return reply.status(403).send({ error: 'API key does not match this agent' });
    }

    const body = request.body as { twitter_handle?: string | null };
    let handle = body.twitter_handle;

    if (handle != null) {
      // Strip a leading @ and surrounding whitespace, then validate.
      handle = String(handle).trim().replace(/^@+/, '');
      if (handle.length === 0) {
        handle = null; // Treat empty string as a clear.
      } else if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
        return reply
          .status(400)
          .send({ error: 'twitter_handle must be 1-15 chars of letters, numbers, or underscores' });
      }
    }

    const result = await pool.query(
      `UPDATE agents
         SET twitter_handle = $1,
             verified_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE NULL END
       WHERE id = $2
       RETURNING id, twitter_handle, verified_at`,
      [handle ?? null, id]
    );

    return reply.send(result.rows[0]);
  });

  // DELETE /v1/agents/:name — delete an agent and all their forecasts.
  // Auth: Bearer aim_<key> belonging to the agent being deleted. Returns a
  // single unified 401 for any auth failure (missing, malformed, mismatched,
  // or nonexistent agent) so an unauthenticated caller can't enumerate names.
  app.delete('/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const authFailure = () =>
      reply.status(401).send({ error: 'Invalid API key' });

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer aim_')) {
      return authFailure();
    }
    const apiKey = authHeader.slice(7);
    const keyHash = hashApiKey(apiKey);

    const agent = await pool.query(
      'SELECT id, api_key_hash FROM agents WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (agent.rows.length === 0 || !hashesEqual(agent.rows[0].api_key_hash, keyHash)) {
      return authFailure();
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
