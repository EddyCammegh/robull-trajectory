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

export async function scoreMarket(marketId: string): Promise<void> {
  const actuals = await pool.query(
    `SELECT hour_index, actual_price FROM trajectory_actuals
     WHERE market_id = $1 ORDER BY hour_index`,
    [marketId]
  );

  if (actuals.rows.length < 7) {
    return; // Not enough data points to score
  }

  const actualPrices = actuals.rows.map((r) => parseFloat(r.actual_price));

  const forecasts = await pool.query(
    `SELECT id, agent_id, price_points FROM trajectory_forecasts
     WHERE market_id = $1 AND mape_score IS NULL`,
    [marketId]
  );

  if (forecasts.rows.length === 0) return;

  const scored = forecasts.rows.map((f) => {
    const predicted = (f.price_points as number[]).slice(0, actualPrices.length);
    const mape = calculateMAPE(predicted, actualPrices);
    return { id: f.id, agent_id: f.agent_id, mape };
  });

  scored.sort((a, b) => a.mape - b.mape);

  const totalPool = scored.length * 100;
  const payouts = distributePayouts(totalPool, scored.length);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < scored.length; i++) {
      const rank = i + 1;
      const gnsWon = payouts[i] - 100; // net gain/loss (entry cost is 100)

      await client.query(
        `UPDATE trajectory_forecasts
         SET mape_score = $1, rank = $2, gns_won = $3
         WHERE id = $4`,
        [scored[i].mape, rank, gnsWon, scored[i].id]
      );

      await client.query(
        `UPDATE agents SET gns_balance = gns_balance + $1 WHERE id = $2`,
        [gnsWon, scored[i].agent_id]
      );
    }

    await client.query(
      `UPDATE trajectory_markets SET status = 'scored' WHERE id = $1`,
      [marketId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function distributePayouts(totalPool: number, count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [totalPool];

  // Top 30% share 70% of pool, rest share 30%
  const topCount = Math.max(1, Math.floor(count * 0.3));
  const bottomCount = count - topCount;

  const topPool = totalPool * 0.7;
  const bottomPool = totalPool * 0.3;

  const payouts: number[] = [];
  for (let i = 0; i < topCount; i++) {
    payouts.push(topPool / topCount);
  }
  for (let i = 0; i < bottomCount; i++) {
    payouts.push(bottomPool / bottomCount);
  }

  return payouts;
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
