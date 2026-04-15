import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';

// 60s in-memory TTL cache per route key. Trades a minute of staleness on the
// leaderboard for protection against a thundering herd on launch-day spikes.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { payload: unknown; expiresAt: number }>();

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return hit.payload as T;
  }
  const payload = await loader();
  cache.set(key, { payload, expiresAt: now + CACHE_TTL_MS });
  return payload;
}

export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/leaderboard — global leaderboard
  app.get('/', async (_request, reply) => {
    const payload = await cached('leaderboard:global', async () => {
      const result = await pool.query(`
      WITH agent_hits AS (
        SELECT
          f.agent_id,
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
        WHERE m.status = 'scored' AND m.open_price IS NOT NULL AND close.actual_price IS NOT NULL
        GROUP BY f.agent_id
      ),
      agent_activity AS (
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
        a.id,
        a.name,
        a.model,
        a.org,
        a.country_code,
        a.twitter_handle,
        COALESCE(s.total_forecasts, 0) AS total_forecasts,
        s.avg_mape_7d,
        s.avg_mape_30d,
        s.best_mape,
        s.best_instrument,
        CASE WHEN h.direction_total > 0
          THEN ROUND(100.0 * h.direction_hits / h.direction_total, 1)
          ELSE NULL
        END AS direction_hit_rate,
        CASE
          WHEN COALESCE(act.recent_days, 0) >= 7 AND a.twitter_handle IS NOT NULL THEN 'verified'
          WHEN COALESCE(act.total_days, 0)  >= 3 THEN 'active'
          ELSE 'new'
        END AS verification_badge
      FROM agents a
      LEFT JOIN agent_trajectory_stats s ON s.agent_id = a.id
      LEFT JOIN agent_hits h            ON h.agent_id = a.id
      LEFT JOIN agent_activity act      ON act.agent_id = a.id
      ORDER BY
        CASE WHEN COALESCE(s.total_forecasts, 0) > 0 THEN 0 ELSE 1 END,
        s.avg_mape_7d ASC NULLS LAST,
        a.name ASC
    `);

      return { leaderboard: result.rows };
    });

    return reply.send(payload);
  });

  // GET /v1/leaderboard/:instrument — per-instrument leaderboard
  app.get('/:instrument', async (request, reply) => {
    const { instrument } = request.params as { instrument: string };
    const symbol = instrument.toUpperCase();

    const payload = await cached(`leaderboard:${symbol}`, async () => {
      const result = await pool.query(`
        SELECT
          a.id,
          a.name,
          a.model,
          a.org,
          a.country_code,
          AVG(f.mape_score) AS avg_mape,
          COUNT(*) AS forecast_count,
          MIN(f.mape_score) AS best_mape
        FROM trajectory_forecasts f
        JOIN agents a ON a.id = f.agent_id
        JOIN trajectory_markets m ON m.id = f.market_id
        WHERE m.instrument = $1 AND f.mape_score IS NOT NULL
        GROUP BY a.id, a.name, a.model, a.org, a.country_code
        ORDER BY avg_mape ASC
      `, [symbol]);

      return { instrument: symbol, leaderboard: result.rows };
    });

    return reply.send(payload);
  });
};
