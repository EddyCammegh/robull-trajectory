'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getMarketLive, type MarketLive } from '@/lib/api';

const TIME_LABELS = ['10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm'];
const FORECAST_COLORS = [
  '#f5e642', '#60a5fa', '#34d399', '#f472b6',
  '#a78bfa', '#fb923c', '#94a3b8', '#e879f9',
  '#38bdf8', '#fbbf24', '#4ade80', '#f87171',
];

// 78 five-minute slots from 9:30am to 4pm ET
const TOTAL_SLOTS = 78;
// Slots per hour (for mapping forecast hour indices to slot positions)
const SLOTS_PER_HOUR = 12;
// Forecast hours map to slot positions: hour 0 → slot 6 (10am), hour 1 → slot 18 (11am), etc.
function forecastHourToSlot(hourIndex: number): number {
  return (hourIndex + 1) * SLOTS_PER_HOUR;
}
// X-axis label positions in slot space
const LABEL_SLOTS = TIME_LABELS.map((_, i) => forecastHourToSlot(i));

export default function ArenaPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<MarketLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    getMarketLive(params.id)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <div className="p-8 text-zinc-500">Loading arena...</div>;
  if (error && !data) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!data) return null;

  const { market, actuals, forecasts } = data;
  const rankedForecasts = [...forecasts]
    .filter((f) => f.mape_score != null)
    .sort((a, b) => (a.mape_score ?? Infinity) - (b.mape_score ?? Infinity));

  return (
    <main className="min-h-screen bg-black">
      <div className="max-w-[1400px] mx-auto p-6">
        {/* Header */}
        <header className="flex items-center gap-4 mb-6">
          <Link
            href="/"
            className="text-3xl font-bold text-accent"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            Rb.
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{market.instrument}</h1>
              <StatusBadge status={market.status} />
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">
              {market.trading_date} · {market.session} session · {forecasts.length} forecast{forecasts.length !== 1 ? 's' : ''}
            </p>
          </div>
          {market.previous_close != null && (
            <div className="text-right">
              <div className="text-xs text-zinc-500">Prev Close</div>
              <div className="text-lg font-semibold">${Number(market.previous_close).toFixed(2)}</div>
            </div>
          )}
          {market.live_price != null && (
            <div className="text-right">
              <div className="text-xs text-green-400">Live</div>
              <div className="text-lg font-semibold text-green-400">${Number(market.live_price).toFixed(2)}</div>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Chart + forecasts — 3 cols */}
          <div className="lg:col-span-3 space-y-5">
            {/* Trajectory chart */}
            <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5">
              <TrajectoryChart
                forecasts={forecasts}
                actuals={actuals}
                previousClose={market.previous_close != null ? Number(market.previous_close) : null}
                livePrice={market.live_price != null ? Number(market.live_price) : null}
              />
            </div>

            {/* Agent forecast cards */}
            <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5">
              <h2 className="text-sm font-medium text-zinc-400 mb-4">
                Agent Forecasts ({forecasts.length})
              </h2>
              {forecasts.length === 0 ? (
                <p className="text-zinc-600 text-sm py-4 text-center">No forecasts submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {forecasts.map((f, fi) => (
                    <div
                      key={f.id}
                      className="border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: FORECAST_COLORS[fi % FORECAST_COLORS.length] }}
                          />
                          <span className="font-medium">{f.agent_name}</span>
                          {f.model && (
                            <span className="text-xs text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">
                              {f.model}
                            </span>
                          )}
                          {f.org && (
                            <span className="text-xs text-zinc-500">· {f.org}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          {f.direction && (
                            <span className={
                              f.direction === 'bullish' ? 'text-green-400' :
                              f.direction === 'bearish' ? 'text-red-400' :
                              'text-zinc-400'
                            }>
                              {f.direction}
                            </span>
                          )}
                          {f.confidence != null && (
                            <span className="text-zinc-500">{f.confidence}%</span>
                          )}
                          {f.mape_score != null && (
                            <span className="text-accent font-medium">
                              {Number(f.mape_score).toFixed(2)}% MAPE
                            </span>
                          )}
                          {f.rank != null && (
                            <span className="text-zinc-400 font-medium">#{f.rank}</span>
                          )}
                        </div>
                      </div>
                      {/* Price points row */}
                      <div className="flex gap-1.5 mb-2 flex-wrap">
                        {f.price_points.map((p: number, i: number) => (
                          <span
                            key={i}
                            className="text-xs bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded font-mono"
                          >
                            {TIME_LABELS[i]}: ${p.toFixed(2)}
                          </span>
                        ))}
                      </div>
                      {f.reasoning && (
                        <p className="text-sm text-zinc-400 leading-relaxed">{f.reasoning}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Market info */}
            <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5">
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Market Info</h2>
              <dl className="space-y-2 text-sm">
                <InfoRow label="Previous Close" value={
                  market.previous_close != null ? `$${Number(market.previous_close).toFixed(2)}` : '—'
                } />
                <InfoRow label="Open Price" value={
                  market.open_price != null ? `$${Number(market.open_price).toFixed(2)}` : '—'
                } />
                <InfoRow label="Forecasts" value={String(forecasts.length)} />
                <InfoRow label="Data Points" value={`${actuals.length} / ${TOTAL_SLOTS}`} />
              </dl>
            </div>

            {/* Live leaderboard */}
            <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5">
              <h2 className="text-sm font-medium text-zinc-400 mb-3">
                Live Leaderboard
              </h2>
              {rankedForecasts.length === 0 ? (
                <p className="text-zinc-600 text-sm py-2">Rankings appear after scoring.</p>
              ) : (
                <div className="space-y-1.5">
                  {rankedForecasts.map((f, i) => (
                    <div
                      key={f.id}
                      className={`flex items-center justify-between text-sm py-1.5 px-2 rounded ${
                        i === 0 ? 'bg-accent/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-bold w-5 text-right flex-shrink-0 ${
                          i === 0 ? 'text-accent' : 'text-zinc-500'
                        }`}>
                          {i + 1}
                        </span>
                        <span className="truncate">{f.agent_name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-zinc-400 font-mono text-xs">
                          {Number(f.mape_score).toFixed(2)}%
                        </span>
                        {f.gns_won != null && (
                          <span className={`text-xs font-medium ${
                            Number(f.gns_won) >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {Number(f.gns_won) >= 0 ? '+' : ''}{Number(f.gns_won).toFixed(0)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actual prices — show latest price per hour */}
            {actuals.length > 0 && (
              <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5">
                <h2 className="text-sm font-medium text-zinc-400 mb-3">Latest Prices</h2>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Slots filled</span>
                    <span className="font-mono">{actuals.length} / {TOTAL_SLOTS}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Latest</span>
                    <span className="font-mono">
                      ${Number(actuals[actuals.length - 1].actual_price).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    accepting: 'bg-green-500/15 text-green-400 border-green-500/30',
    live: 'bg-accent/15 text-accent border-accent/30',
    scored: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border uppercase ${styles[status] || ''}`}>
      {status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// ── Trajectory Chart ──

const CHART_W = 800;
const CHART_H = 340;
const PAD = { top: 20, right: 20, bottom: 35, left: 65 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

function slotToX(slot: number): number {
  return PAD.left + (slot / (TOTAL_SLOTS - 1)) * PLOT_W;
}

// Build a smooth cubic bezier SVG path through an array of {x, y} points
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
  }

  const tension = 0.3;
  let d = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`;
  }

  return d;
}

function TrajectoryChart({
  forecasts,
  actuals,
  previousClose,
  livePrice,
}: {
  forecasts: MarketLive['forecasts'];
  actuals: MarketLive['actuals'];
  previousClose: number | null;
  livePrice: number | null;
}) {
  // Collect all prices for Y range
  const allPrices: number[] = [];
  forecasts.forEach((f) => f.price_points.forEach((p: number) => allPrices.push(p)));
  actuals.forEach((a) => allPrices.push(Number(a.actual_price)));
  if (previousClose != null) allPrices.push(previousClose);

  if (allPrices.length === 0) {
    return <p className="text-zinc-600 text-sm text-center py-12">No data to display.</p>;
  }

  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const range = rawMax - rawMin || 1;
  const minY = rawMin - range * 0.02;
  const maxY = rawMax + range * 0.02;

  function toY(p: number) {
    return PAD.top + PLOT_H - ((p - minY) / (maxY - minY)) * PLOT_H;
  }

  const yTicks = generateTicks(minY, maxY, 5);

  // Sort actuals by slot_index
  const sortedActuals = [...actuals].sort((a, b) => a.slot_index - b.slot_index);
  const lastActual = sortedActuals.length > 0 ? sortedActuals[sortedActuals.length - 1] : null;
  const lastActualSlot = lastActual?.slot_index ?? -1;

  // Build actual line points (starting from previous_close at slot 0)
  const actualPoints: { x: number; y: number }[] = [];
  if (previousClose != null) {
    actualPoints.push({ x: slotToX(0), y: toY(previousClose) });
  }
  sortedActuals.forEach((a) => {
    actualPoints.push({ x: slotToX(a.slot_index), y: toY(Number(a.actual_price)) });
  });

  // Pulse dot position
  const dotX = lastActual ? slotToX(lastActual.slot_index) : 0;
  const dotY = lastActual ? toY(Number(lastActual.actual_price)) : 0;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Horizontal grid lines */}
      {yTicks.map((tick) => (
        <line
          key={tick}
          x1={PAD.left}
          y1={toY(tick)}
          x2={CHART_W - PAD.right}
          y2={toY(tick)}
          stroke="#27272a"
          strokeWidth="1"
        />
      ))}
      {/* Vertical grid lines at hour marks */}
      {LABEL_SLOTS.map((slot, i) => (
        <line
          key={i}
          x1={slotToX(slot)}
          y1={PAD.top}
          x2={slotToX(slot)}
          y2={PAD.top + PLOT_H}
          stroke="#27272a"
          strokeWidth="1"
        />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((tick) => (
        <text
          key={tick}
          x={PAD.left - 8}
          y={toY(tick) + 4}
          textAnchor="end"
          fill="#71717a"
          fontSize="11"
          fontFamily="monospace"
        >
          ${tick.toFixed(2)}
        </text>
      ))}

      {/* X-axis labels */}
      {TIME_LABELS.map((label, i) => (
        <text
          key={i}
          x={slotToX(LABEL_SLOTS[i])}
          y={CHART_H - 8}
          textAnchor="middle"
          fill="#71717a"
          fontSize="11"
        >
          {label}
        </text>
      ))}

      {/* Previous close reference line */}
      {previousClose != null && (
        <>
          <line
            x1={PAD.left}
            y1={toY(previousClose)}
            x2={CHART_W - PAD.right}
            y2={toY(previousClose)}
            stroke="#52525b"
            strokeWidth="1"
            strokeDasharray="6 4"
          />
          <text
            x={CHART_W - PAD.right + 4}
            y={toY(previousClose) + 4}
            fill="#52525b"
            fontSize="10"
            fontFamily="monospace"
          >
            PC
          </text>
        </>
      )}

      {/* Forecast lines — straight dashed polylines */}
      {forecasts.map((f, fi) => {
        const color = FORECAST_COLORS[fi % FORECAST_COLORS.length];
        const allPts = f.price_points.map((p: number, i: number) =>
          `${slotToX(forecastHourToSlot(i))},${toY(p)}`
        );

        if (lastActualSlot < 0) {
          return (
            <polyline
              key={f.id}
              points={allPts.join(' ')}
              fill="none"
              stroke={color}
              strokeWidth="1"
              strokeDasharray="5 3"
              opacity="0.55"
            />
          );
        }

        const forecastSlots = f.price_points.map((_: number, i: number) => forecastHourToSlot(i));
        const coveredPts = allPts.filter((_, i) => forecastSlots[i] <= lastActualSlot);
        const aheadPts = allPts.filter((_, i) => forecastSlots[i] >= lastActualSlot);

        return (
          <g key={f.id}>
            {coveredPts.length >= 2 && (
              <polyline
                points={coveredPts.join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="1"
                strokeDasharray="5 3"
                opacity="0.2"
              />
            )}
            {aheadPts.length >= 2 && (
              <polyline
                points={aheadPts.join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="1"
                strokeDasharray="5 3"
                opacity="0.55"
              />
            )}
          </g>
        );
      })}

      {/* Actual price line — smooth cubic bezier, solid white */}
      {actualPoints.length >= 2 && (
        <path
          d={smoothPath(actualPoints)}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Pulsing dot at leading edge of actual line */}
      {lastActual && (
        <g>
          {/* Pulse ring — translated to dot center so scale animates from correct origin */}
          <g transform={`translate(${dotX},${dotY})`}>
            <circle cx="0" cy="0" r="4" fill="none" stroke="#4ade80" strokeWidth="1.5">
              <animate attributeName="opacity" values="0.8;0" dur="1.5s" repeatCount="indefinite" />
              <animateTransform
                attributeName="transform"
                type="scale"
                values="1;2.2"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
          {/* Solid center dot */}
          <circle cx={dotX} cy={dotY} r="2.5" fill="#4ade80" />
        </g>
      )}
    </svg>
  );
}

function generateTicks(min: number, max: number, count: number): number[] {
  const range = max - min;
  const step = range / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) {
    ticks.push(min + step * i);
  }
  return ticks;
}
