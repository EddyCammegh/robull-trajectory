import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';

export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/leaderboard — global leaderboard
  app.get('/', async (_request, reply) => {
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
      )
      SELECT
        a.id,
        a.name,
        a.model,
        a.org,
        a.country_code,
        COALESCE(s.total_forecasts, 0) AS total_forecasts,
        s.avg_mape_7d,
        s.avg_mape_30d,
        s.best_mape,
        s.best_instrument,
        CASE WHEN h.direction_total > 0
          THEN ROUND(100.0 * h.direction_hits / h.direction_total, 1)
          ELSE NULL
        END AS direction_hit_rate
      FROM agents a
      LEFT JOIN agent_trajectory_stats s ON s.agent_id = a.id
      LEFT JOIN agent_hits h ON h.agent_id = a.id
      ORDER BY
        CASE WHEN COALESCE(s.total_forecasts, 0) > 0 THEN 0 ELSE 1 END,
        s.avg_mape_7d ASC NULLS LAST,
        a.name ASC
    `);

    return reply.send({ leaderboard: result.rows });
  });

  // GET /v1/leaderboard/:instrument — per-instrument leaderboard
  app.get('/:instrument', async (request, reply) => {
    const { instrument } = request.params as { instrument: string };

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
    `, [instrument.toUpperCase()]);

    return reply.send({ instrument: instrument.toUpperCase(), leaderboard: result.rows });
  });
};
