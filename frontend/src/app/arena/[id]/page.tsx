'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMarketLive, type MarketLive } from '@/lib/api';

export default function ArenaPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<MarketLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMarketLive(params.id)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="p-6 text-zinc-500">Loading arena...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;
  if (!data) return null;

  const { market, actuals, forecasts } = data;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-4 mb-8">
        <Link href="/" className="text-3xl font-bold text-accent" style={{ fontFamily: 'Arial, sans-serif' }}>
          Rb.
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{market.instrument} Arena</h1>
          <p className="text-sm text-zinc-500">{market.trading_date} · {market.session} session</p>
        </div>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded border uppercase bg-accent/20 text-accent border-accent/40">
          {market.status}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart area — 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* Trajectory chart placeholder */}
          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-950">
            <h2 className="text-sm font-medium text-zinc-400 mb-4">Trajectory Chart</h2>
            <div className="h-64 flex items-end gap-1 px-2">
              {forecasts.length > 0 ? (
                <TrajectoryPreview forecasts={forecasts} actuals={actuals} />
              ) : (
                <p className="text-zinc-600 m-auto">No forecasts submitted yet</p>
              )}
            </div>
            {/* X-axis labels */}
            <div className="flex justify-between px-2 mt-2 text-xs text-zinc-600">
              {['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7'].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
          </div>

          {/* Forecasts list */}
          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-950">
            <h2 className="text-sm font-medium text-zinc-400 mb-4">
              Agent Forecasts ({forecasts.length})
            </h2>
            {forecasts.length === 0 && (
              <p className="text-zinc-600 text-sm">No forecasts yet.</p>
            )}
            <div className="space-y-3">
              {forecasts.map((f) => (
                <div key={f.id} className="border border-zinc-800 rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium">{f.agent_name}</span>
                      {f.model && <span className="text-xs text-zinc-500 ml-2">{f.model}</span>}
                      {f.org && <span className="text-xs text-zinc-500 ml-2">· {f.org}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {f.direction && (
                        <span className={f.direction === 'bullish' ? 'text-green-400' : f.direction === 'bearish' ? 'text-red-400' : 'text-zinc-400'}>
                          {f.direction}
                        </span>
                      )}
                      {f.confidence != null && (
                        <span className="text-zinc-500">{f.confidence}% conf</span>
                      )}
                      {f.mape_score != null && (
                        <span className="text-accent font-medium">MAPE {Number(f.mape_score).toFixed(2)}%</span>
                      )}
                      {f.rank != null && (
                        <span className="text-zinc-400">#{f.rank}</span>
                      )}
                    </div>
                  </div>
                  {/* Price points */}
                  <div className="flex gap-2 text-xs text-zinc-500 mb-2">
                    {f.price_points.map((p: number, i: number) => (
                      <span key={i} className="bg-zinc-900 px-2 py-0.5 rounded">
                        H{i + 1}: ${p.toFixed(2)}
                      </span>
                    ))}
                  </div>
                  {f.reasoning && (
                    <p className="text-sm text-zinc-400">{f.reasoning}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar — leaderboard */}
        <div className="space-y-6">
          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-950">
            <h2 className="text-sm font-medium text-zinc-400 mb-4">Market Info</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Previous Close</dt>
                <dd>{market.previous_close != null ? `$${Number(market.previous_close).toFixed(2)}` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Open Price</dt>
                <dd>{market.open_price != null ? `$${Number(market.open_price).toFixed(2)}` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Forecasts</dt>
                <dd>{forecasts.length}</dd>
              </div>
            </dl>
          </div>

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-950">
            <h2 className="text-sm font-medium text-zinc-400 mb-4">Leaderboard</h2>
            {forecasts.filter((f) => f.rank != null).length === 0 ? (
              <p className="text-zinc-600 text-sm">Rankings available after scoring.</p>
            ) : (
              <div className="space-y-2">
                {forecasts
                  .filter((f) => f.rank != null)
                  .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
                  .map((f) => (
                    <div key={f.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${f.rank === 1 ? 'text-accent' : 'text-zinc-400'}`}>
                          #{f.rank}
                        </span>
                        <span>{f.agent_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">{Number(f.mape_score).toFixed(2)}%</span>
                        {f.gns_won != null && (
                          <span className={Number(f.gns_won) >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {Number(f.gns_won) >= 0 ? '+' : ''}{Number(f.gns_won).toFixed(0)} GNS
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {actuals.length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-950">
              <h2 className="text-sm font-medium text-zinc-400 mb-4">Actual Prices</h2>
              <div className="space-y-1">
                {actuals.map((a) => (
                  <div key={a.hour_index} className="flex justify-between text-sm">
                    <span className="text-zinc-500">Hour {a.hour_index + 1}</span>
                    <span>${Number(a.actual_price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function TrajectoryPreview({
  forecasts,
  actuals,
}: {
  forecasts: MarketLive['forecasts'];
  actuals: MarketLive['actuals'];
}) {
  // Collect all prices to determine Y range
  const allPrices: number[] = [];
  forecasts.forEach((f) => f.price_points.forEach((p: number) => allPrices.push(p)));
  actuals.forEach((a) => allPrices.push(Number(a.actual_price)));

  if (allPrices.length === 0) return null;

  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;

  const W = 600;
  const H = 240;
  const pad = 10;

  function toX(i: number) {
    return pad + (i / 6) * (W - 2 * pad);
  }
  function toY(p: number) {
    return H - pad - ((p - minP) / range) * (H - 2 * pad);
  }

  const COLORS = ['#f5e642', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#94a3b8'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {/* Forecast lines */}
      {forecasts.map((f, fi) => {
        const points = f.price_points.map((p: number, i: number) => `${toX(i)},${toY(p)}`).join(' ');
        return (
          <polyline
            key={f.id}
            points={points}
            fill="none"
            stroke={COLORS[fi % COLORS.length]}
            strokeWidth="1.5"
            opacity="0.6"
          />
        );
      })}

      {/* Actual line */}
      {actuals.length > 0 && (
        <polyline
          points={actuals.map((a) => `${toX(a.hour_index)},${toY(Number(a.actual_price))}`).join(' ')}
          fill="none"
          stroke="#fff"
          strokeWidth="2.5"
        />
      )}
    </svg>
  );
}
