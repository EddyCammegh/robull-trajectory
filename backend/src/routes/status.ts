import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db.js';

// 60s in-memory TTL cache. The status payload is small and the DB query set is
// non-trivial (4 parallel queries including an agent-join aggregate); caching
// for a minute protects against thundering-herd during launch-day traffic.
const CACHE_TTL_MS = 60_000;
let statusCache: { payload: unknown; expiresAt: number } | null = null;

export const statusRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/status — public session summary for today
  app.get('/', async (_request, reply) => {
    const now = Date.now();
    if (statusCache && statusCache.expiresAt > now) {
      return reply.send(statusCache.payload);
    }

    // One query per shape: keeps each result set easy to project. All five are
    // small (bounded by the 5 US instruments or a LIMIT 5), so the extra round
    // trips cost is negligible compared to a giant UNION ALL.
    const [marketsRes, sentimentRes, topAgentsRes, dateRes] = await Promise.all([
      pool.query(`
        SELECT
          m.id,
          m.instrument,
          m.status,
          m.previous_close,
          m.open_price,
          (SELECT COUNT(*) FROM trajectory_forecasts f WHERE f.market_id = m.id)::int AS forecast_count,
          (SELECT ROUND(AVG(f.confidence)::numeric, 1)
             FROM trajectory_forecasts f
             WHERE f.market_id = m.id AND f.confidence IS NOT NULL) AS avg_confidence
        FROM trajectory_markets m
        WHERE m.trading_date = CURRENT_DATE
        ORDER BY m.instrument
      `),
      pool.query(`
        SELECT
          m.instrument,
          COUNT(*) FILTER (WHERE f.direction = 'bullish')::int  AS bullish,
          COUNT(*) FILTER (WHERE f.direction = 'bearish')::int  AS bearish,
          COUNT(*) FILTER (WHERE f.direction = 'neutral')::int  AS neutral
        FROM trajectory_markets m
        LEFT JOIN trajectory_forecasts f ON f.market_id = m.id
        WHERE m.trading_date = CURRENT_DATE
        GROUP BY m.instrument
      `),
      pool.query(`
        SELECT
          a.id,
          a.name,
          a.model,
          a.org,
          COUNT(*)::int AS forecast_count
        FROM trajectory_forecasts f
        JOIN trajectory_markets m ON m.id = f.market_id
        JOIN agents a ON a.id = f.agent_id
        WHERE m.trading_date = CURRENT_DATE
        GROUP BY a.id, a.name, a.model, a.org
        ORDER BY forecast_count DESC, a.name ASC
        LIMIT 5
      `),
      pool.query(`SELECT CURRENT_DATE AS trading_date`),
    ]);

    const tradingDate: string =
      dateRes.rows[0].trading_date?.toISOString?.().slice(0, 10) ??
      String(dateRes.rows[0].trading_date).slice(0, 10);

    // Index sentiment by instrument for O(1) lookup when building the market list.
    const sentimentByInstrument = new Map<
      string,
      { bullish: number; bearish: number; neutral: number }
    >();
    for (const row of sentimentRes.rows) {
      sentimentByInstrument.set(row.instrument, {
        bullish: row.bullish,
        bearish: row.bearish,
        neutral: row.neutral,
      });
    }

    const markets = marketsRes.rows.map((m: any) => {
      const sentiment = sentimentByInstrument.get(m.instrument) ?? {
        bullish: 0,
        bearish: 0,
        neutral: 0,
      };
      return {
        id: m.id,
        instrument: m.instrument,
        status: m.status,
        previous_close: m.previous_close != null ? parseFloat(m.previous_close) : null,
        open_price: m.open_price != null ? parseFloat(m.open_price) : null,
        forecast_count: m.forecast_count,
        avg_confidence: m.avg_confidence != null ? parseFloat(m.avg_confidence) : null,
        sentiment,
      };
    });

    const totalForecasts = markets.reduce((sum, m) => sum + m.forecast_count, 0);

    const payload = {
      trading_date: tradingDate,
      total_forecasts: totalForecasts,
      markets,
      top_agents: topAgentsRes.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        model: r.model,
        org: r.org,
        forecast_count: r.forecast_count,
      })),
    };

    statusCache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return reply.send(payload);
  });
};
