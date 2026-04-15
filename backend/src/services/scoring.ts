import { pool } from '../db.js';

export function calculateMAPE(
  predicted: number[],
  actual: number[]
): number {
  if (predicted.length !== actual.length || actual.length === 0) {
    throw new Error('Predicted and actual arrays must have same non-zero length');
  }

  let totalError = 0;
  let validPoints = 0;

  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 0) continue;
    totalError += Math.abs((actual[i] - predicted[i]) / actual[i]);
    validPoints++;
  }

  if (validPoints === 0) return 0;
  return (totalError / validPoints) * 100;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

const FORECAST_SLOTS: Record<string, number[]> = {
  US:       [0, 12, 24, 36, 48, 60, 72, 77],
  CRYPTO:   [0, 36, 72, 108, 144, 180, 216, 252],
  ASIAN:    [0, 6, 12, 18, 24, 30, 36, 41],
  EUROPEAN: [0, 6, 18, 30, 42, 54, 66, 78],
};

export async function scoreMarket(marketId: string): Promise<void> {
  const marketResult = await pool.query(
    `SELECT session FROM trajectory_markets WHERE id = $1`,
    [marketId]
  );
  if (marketResult.rows.length === 0) return;
  const session: string = marketResult.rows[0].session;
  const slots = FORECAST_SLOTS[session] ?? FORECAST_SLOTS.US;

  const actuals = await pool.query(
    `SELECT slot_index, actual_price FROM trajectory_actuals
     WHERE market_id = $1 ORDER BY slot_index`,
    [marketId]
  );

  // Lowered from 78 → 60 so a few missed WS slots don't block scoring.
  // Any forecast slot whose 5-min bar is missing is skipped per-forecast in
  // the scoring loop below, so partial coverage still produces a fair MAPE.
  const MIN_ACTUALS_TO_SCORE = 60;
  if (actuals.rows.length < MIN_ACTUALS_TO_SCORE) {
    console.warn(
      `[scoreMarket] Skipping market ${marketId}: only ${actuals.rows.length}/${MIN_ACTUALS_TO_SCORE} actuals collected`
    );
    return;
  }

  const actualsBySlot = new Map<number, number>(
    actuals.rows.map((r: any) => [r.slot_index, parseFloat(r.actual_price)])
  );

  const forecasts = await pool.query(
    `SELECT id, agent_id, price_points FROM trajectory_forecasts
     WHERE market_id = $1`,
    [marketId]
  );

  if (forecasts.rows.length === 0) return;

  const scored = forecasts.rows.map((f: any) => {
    const pricePoints = f.price_points as number[];
    const predicted: number[] = [];
    const matched: number[] = [];
    for (let i = 0; i < pricePoints.length; i++) {
      const actual = actualsBySlot.get(slots[i]);
      if (actual != null) {
        predicted.push(pricePoints[i]);
        matched.push(actual);
      }
    }
    const mape = matched.length > 0 ? calculateMAPE(predicted, matched) : Infinity;
    return { id: f.id, agent_id: f.agent_id, mape };
  });

  scored.sort((a, b) => a.mape - b.mape);

  // Consensus deviation: std dev of each agent's predicted closing price (final slot)
  const closingPredictions = forecasts.rows
    .map((f: any) => {
      const pp = f.price_points as number[];
      return pp[pp.length - 1];
    })
    .filter((v: any) => typeof v === 'number' && !isNaN(v));
  const consensusDeviation = stdDev(closingPredictions);

  // Realised volatility: std dev of the 78 actual price bars
  const actualPrices = actuals.rows
    .map((r: any) => parseFloat(r.actual_price))
    .filter((v: number) => !isNaN(v));
  const realisedVolatility = stdDev(actualPrices);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < scored.length; i++) {
      const rank = i + 1;

      await client.query(
        `UPDATE trajectory_forecasts
         SET mape_score = $1, rank = $2
         WHERE id = $3`,
        [scored[i].mape, rank, scored[i].id]
      );
    }

    await client.query(
      `UPDATE trajectory_markets
       SET status = 'scored', consensus_deviation = $2
       WHERE id = $1`,
      [marketId, consensusDeviation]
    );

    await client.query(
      `INSERT INTO market_context (market_id, realised_volatility_at_close)
       VALUES ($1, $2)
       ON CONFLICT (market_id) DO UPDATE SET realised_volatility_at_close = EXCLUDED.realised_volatility_at_close`,
      [marketId, realisedVolatility]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateAgentStats(agentId: string): Promise<void> {
  await pool.query(`
    INSERT INTO agent_trajectory_stats (agent_id, total_forecasts, avg_mape_7d, avg_mape_30d, best_mape, best_instrument, updated_at)
    SELECT
      f.agent_id,
      COUNT(*)::INTEGER,
      AVG(CASE WHEN m.trading_date >= CURRENT_DATE - INTERVAL '7 days' THEN f.mape_score END),
      AVG(CASE WHEN m.trading_date >= CURRENT_DATE - INTERVAL '30 days' THEN f.mape_score END),
      MIN(f.mape_score),
      (SELECT m2.instrument FROM trajectory_forecasts f2
       JOIN trajectory_markets m2 ON m2.id = f2.market_id
       WHERE f2.agent_id = $1 AND f2.mape_score IS NOT NULL
       ORDER BY f2.mape_score ASC LIMIT 1),
      NOW()
    FROM trajectory_forecasts f
    JOIN trajectory_markets m ON m.id = f.market_id
    WHERE f.agent_id = $1 AND f.mape_score IS NOT NULL
    GROUP BY f.agent_id
    ON CONFLICT (agent_id) DO UPDATE SET
      total_forecasts = EXCLUDED.total_forecasts,
      avg_mape_7d = EXCLUDED.avg_mape_7d,
      avg_mape_30d = EXCLUDED.avg_mape_30d,
      best_mape = EXCLUDED.best_mape,
      best_instrument = EXCLUDED.best_instrument,
      updated_at = NOW()
  `, [agentId]);
}
