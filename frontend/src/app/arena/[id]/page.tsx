'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getMarkets, getMarketLive, type Market, type MarketLive } from '@/lib/api';
import { Nav } from '@/components/Nav';

const FORECAST_COLORS = [
  '#f5e642', '#60a5fa', '#34d399', '#f472b6',
  '#a78bfa', '#fb923c', '#94a3b8', '#e879f9',
  '#38bdf8', '#fbbf24', '#4ade80', '#f87171',
];

const SESSIONS: Record<string, {
  labels: string[];
  totalSlots: number;
  forecastSlots: number[];
  openLabel: string;
}> = {
  US: {
    labels: ['9:30', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30', '4:00'],
    totalSlots: 78,
    forecastSlots: [0, 12, 24, 36, 48, 60, 72, 77],
    openLabel: '9:30am ET',
  },
  CRYPTO: {
    labels: ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm'],
    totalSlots: 288,
    forecastSlots: [36, 72, 108, 144, 180, 216, 252],
    openLabel: '24h UTC',
  },
  ASIAN: {
    labels: ['9:00', '10:00', '11:00', '12:00', '1:00', '2:00', '3:00'],
    totalSlots: 42,
    forecastSlots: [6, 12, 18, 24, 30, 36, 41],
    openLabel: '9:00am JST',
  },
  EUROPEAN: {
    labels: ['8:00', '9:00', '10:00', '11:00', '12:00', '1:00', '2:00', '3:00', '4:30'],
    totalSlots: 102,
    forecastSlots: [6, 18, 30, 42, 54, 66, 78],
    openLabel: '8:00am GMT',
  },
};

export default function ArenaPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<MarketLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConsensus, setShowConsensus] = useState(false);
  const [allMarkets, setAllMarkets] = useState<Market[]>([]);
  const [selectedForecastId, setSelectedForecastId] = useState<string | null>(null);

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

  useEffect(() => {
    getMarkets().then((d) => setAllMarkets(d.markets)).catch(() => {});
  }, []);

  if (loading) return <div className="p-8 text-zinc-500">Loading arena...</div>;
  if (error && !data) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!data) return null;

  const { market, actuals, forecasts } = data;
  const session = SESSIONS[market.session] ?? SESSIONS.US;
  const rankedForecasts = [...forecasts]
    .filter((f) => f.mape_score != null)
    .sort((a, b) => (a.mape_score ?? Infinity) - (b.mape_score ?? Infinity));

  // Consensus computations
  const dirs: Record<string, number> = {};
  forecasts.forEach((f) => {
    const d = f.direction ?? 'neutral';
    dirs[d] = (dirs[d] || 0) + 1;
  });
  const topDir = forecasts.length > 0
    ? Object.entries(dirs).sort((a, b) => b[1] - a[1])[0]
    : null;

  const closePrices = forecasts.map((f) => f.price_points[f.price_points.length - 1]);
  const minClose = closePrices.length > 0 ? Math.min(...closePrices) : null;
  const maxClose = closePrices.length > 0 ? Math.max(...closePrices) : null;

  // Contrarian detection
  const isContrarian = (f: typeof forecasts[0]) => {
    if (!topDir || forecasts.length < 3) return false;
    const minorityCount = forecasts.length - topDir[1];
    return minorityCount > 0 && minorityCount <= 3 && f.direction !== topDir[0] && f.direction != null;
  };

  // Biggest bear / bull
  const bearForecasts = forecasts.filter((f) => f.direction === 'bearish');
  const bullForecasts = forecasts.filter((f) => f.direction === 'bullish');
  const biggestBear = bearForecasts.length > 0
    ? bearForecasts.reduce((lowest, f) =>
        f.price_points[f.price_points.length - 1] < lowest.price_points[lowest.price_points.length - 1] ? f : lowest
      )
    : null;
  const biggestBull = bullForecasts.length > 0
    ? bullForecasts.reduce((highest, f) =>
        f.price_points[f.price_points.length - 1] > highest.price_points[highest.price_points.length - 1] ? f : highest
      )
    : null;

  return (
    <main className="min-h-screen bg-black">
      <div className="max-w-[1400px] mx-auto p-6">
        <Nav />

        {/* Instrument header */}
        <header className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{market.instrument}</h1>
              <StatusBadge status={market.status} />
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">
              {market.trading_date} · {market.session} session
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

        {/* Instrument switcher */}
        {allMarkets.length > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {allMarkets.map((m) => (
              <Link key={m.id} href={`/arena/${m.id}`}>
                <span
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    m.id === params.id
                      ? 'bg-accent/15 text-accent border-accent/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200'
                  }`}
                >
                  {m.instrument}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Context bar */}
        {forecasts.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mb-5 px-1">
            <span className="text-white font-medium">{forecasts.length} forecast{forecasts.length !== 1 ? 's' : ''}</span>
            {topDir && (
              <>
                <span className="text-zinc-700">·</span>
                <span className={
                  topDir[0] === 'bullish' ? 'text-green-400' :
                  topDir[0] === 'bearish' ? 'text-red-400' :
                  'text-zinc-400'
                }>
                  {topDir[1]}/{forecasts.length} {topDir[0]}
                </span>
              </>
            )}
            {minClose != null && maxClose != null && (
              <>
                <span className="text-zinc-700">·</span>
                <span>
                  Close range: <span className="text-white font-mono">${minClose.toFixed(2)}</span>
                  {' – '}
                  <span className="text-white font-mono">${maxClose.toFixed(2)}</span>
                </span>
              </>
            )}
            <span className="text-zinc-700">·</span>
            <StatusBadge status={market.status} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Chart + forecasts — 3 cols */}
          <div className="lg:col-span-3 space-y-5">
            {/* Trajectory chart */}
            <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5">
              <div className="flex items-center justify-end mb-3">
                <div className="inline-flex border border-zinc-800 rounded-lg overflow-hidden text-xs">
                  <button
                    onClick={() => setShowConsensus(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      !showConsensus ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 3h10M1 6h10M1 9h10" />
                    </svg>
                    Individual
                  </button>
                  <button
                    onClick={() => setShowConsensus(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-zinc-800 ${
                      showConsensus ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 6h10" />
                    </svg>
                    Consensus
                  </button>
                </div>
              </div>
              <TrajectoryChart
                forecasts={forecasts}
                actuals={actuals}
                previousClose={market.previous_close != null ? Number(market.previous_close) : null}
                livePrice={market.live_price != null ? Number(market.live_price) : null}
                session={session}
                showConsensus={showConsensus}
                selectedForecastId={selectedForecastId}
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
                      onClick={() => setSelectedForecastId(selectedForecastId === f.id ? null : f.id)}
                      className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                        selectedForecastId === f.id
                          ? 'border-accent/50 bg-accent/[0.03]'
                          : 'border-zinc-800 hover:border-zinc-700'
                      }`}
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
                            {session.labels[i] ?? `H${i}`}: ${p.toFixed(2)}
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
                <InfoRow label="Data Points" value={`${actuals.length} / ${session.totalSlots}`} />
              </dl>
            </div>

            {/* Live leaderboard */}
            <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5">
              <h2 className="text-sm font-medium text-zinc-400 mb-3">
                Live Leaderboard
              </h2>
              {forecasts.length > 0 ? (
                <>
                  {/* Consensus summary */}
                  {(() => {
                    const avgClose = forecasts.reduce((sum, f) => sum + f.price_points[f.price_points.length - 1], 0) / forecasts.length;
                    return (
                      <div className="text-xs text-zinc-400 mb-3 pb-2 border-b border-zinc-800">
                        {topDir && (
                          <span className={
                            topDir[0] === 'bullish' ? 'text-green-400' :
                            topDir[0] === 'bearish' ? 'text-red-400' :
                            'text-zinc-400'
                          }>
                            {topDir[1]}/{forecasts.length} {topDir[0]}
                          </span>
                        )}
                        {' · avg close '}
                        <span className="text-white font-mono">${avgClose.toFixed(2)}</span>
                      </div>
                    );
                  })()}

                  {/* Column header */}
                  <div className="flex items-center justify-between text-[10px] text-zinc-600 uppercase tracking-wider px-2 mb-1">
                    <span>Agent</span>
                    <span>MAPE</span>
                  </div>

                  <div className="space-y-0.5">
                    {(rankedForecasts.length > 0
                      ? rankedForecasts
                      : [...forecasts].sort((a, b) => a.agent_name.localeCompare(b.agent_name))
                    ).map((f, i) => {
                      const hasScores = rankedForecasts.length > 0;
                      const isFirst = hasScores && i === 0;
                      const dirTint =
                        f.direction === 'bearish' ? 'bg-red-500/5' :
                        f.direction === 'bullish' ? 'bg-green-500/5' :
                        '';
                      const openPrice = f.price_points[0];
                      const closePrice = f.price_points[f.price_points.length - 1];
                      const contrarian = isContrarian(f);

                      return (
                        <div
                          key={f.id}
                          className={`py-2 px-2 rounded ${dirTint} ${isFirst ? 'ring-1 ring-accent/30' : ''}`}
                        >
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`font-bold w-5 text-right flex-shrink-0 ${
                                isFirst ? 'text-accent' : 'text-zinc-500'
                              }`}>
                                {i + 1}
                              </span>
                              <span>{f.agent_name}</span>
                              {contrarian && (
                                <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1 py-0.5 rounded flex-shrink-0">
                                  contrarian
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {f.direction && (
                                <span className={`text-xs ${
                                  f.direction === 'bullish' ? 'text-green-400' :
                                  f.direction === 'bearish' ? 'text-red-400' :
                                  'text-zinc-400'
                                }`}>
                                  {f.direction}
                                </span>
                              )}
                              <span className={`font-mono text-xs font-bold w-14 text-right ${
                                f.mape_score != null ? 'text-accent' : 'text-zinc-500'
                              }`}>
                                {f.mape_score != null ? `${Number(f.mape_score).toFixed(2)}%` : '—'}
                              </span>
                            </div>
                          </div>
                          <div className="text-[10px] text-zinc-600 font-mono mt-0.5 pl-7">
                            ${openPrice.toFixed(2)} → ${closePrice.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-zinc-600 text-sm py-2">No forecasts yet.</p>
              )}
            </div>

            {/* Biggest Bear / Biggest Bull */}
            {(biggestBear || biggestBull) && (
              <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5 space-y-3">
                {biggestBear && (
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Biggest Bear</div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-red-400 font-medium">{biggestBear.agent_name}</span>
                      <span className="text-red-400 font-mono text-xs">
                        ${biggestBear.price_points[biggestBear.price_points.length - 1].toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                {biggestBull && (
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Biggest Bull</div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-400 font-medium">{biggestBull.agent_name}</span>
                      <span className="text-green-400 font-mono text-xs">
                        ${biggestBull.price_points[biggestBull.price_points.length - 1].toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actual prices — show latest price per hour */}
            {actuals.length > 0 && (
              <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-5">
                <h2 className="text-sm font-medium text-zinc-400 mb-3">Latest Prices</h2>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Slots filled</span>
                    <span className="font-mono">{actuals.length} / {session.totalSlots}</span>
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

type SessionConfig = typeof SESSIONS[keyof typeof SESSIONS];

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
  session,
  showConsensus = false,
  selectedForecastId = null,
}: {
  forecasts: MarketLive['forecasts'];
  actuals: MarketLive['actuals'];
  previousClose: number | null;
  livePrice: number | null;
  session: SessionConfig;
  showConsensus?: boolean;
  selectedForecastId?: string | null;
}) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const check = () => setIsLight(document.documentElement.getAttribute('data-theme') === 'light');
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const actualLineColor = isLight ? '#000000' : '#ffffff';
  const gridColor = isLight ? '#e4e4e7' : '#27272a';
  const labelColor = isLight ? '#52525b' : '#71717a';
  const mutedColor = isLight ? '#a1a1aa' : '#52525b';
  const defaultForecastOpacity = isLight ? 0.8 : 0.6;

  const { totalSlots, forecastSlots, labels } = session;

  function slotToX(slot: number): number {
    return PAD.left + (slot / (totalSlots - 1)) * PLOT_W;
  }

  // Evenly space labels and grid lines across the plot
  function labelToX(labelIndex: number): number {
    return PAD.left + (labelIndex / (labels.length - 1)) * PLOT_W;
  }

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

  // Forecast spread band (min/max at each slot)
  const numPoints = forecasts.length > 0 ? forecasts[0].price_points.length : 0;
  let spreadPath = '';
  if (forecasts.length >= 2 && numPoints > 0) {
    const topLine: string[] = [];
    const bottomLine: string[] = [];
    for (let i = 0; i < numPoints; i++) {
      const prices = forecasts.map((f) => f.price_points[i]);
      const x = labelToX(i);
      topLine.push(`${x},${toY(Math.max(...prices))}`);
      bottomLine.push(`${x},${toY(Math.min(...prices))}`);
    }
    spreadPath = `M${topLine.join('L')}L${bottomLine.reverse().join('L')}Z`;
  }

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
          stroke={gridColor}
          strokeWidth="1"
        />
      ))}
      {/* Vertical grid lines at label positions */}
      {labels.map((_, i) => (
        <line
          key={i}
          x1={labelToX(i)}
          y1={PAD.top}
          x2={labelToX(i)}
          y2={PAD.top + PLOT_H}
          stroke={gridColor}
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
          fill={labelColor}
          fontSize="11"
          fontFamily="monospace"
        >
          ${tick.toFixed(2)}
        </text>
      ))}

      {/* X-axis labels */}
      {labels.map((label, i) => (
        <text
          key={i}
          x={labelToX(i)}
          y={CHART_H - 8}
          textAnchor="middle"
          fill={labelColor}
          fontSize="11"
        >
          {label}
        </text>
      ))}

      {/* Session open marker — vertical dotted line at slot 0 */}
      <line
        x1={slotToX(0)}
        y1={PAD.top}
        x2={slotToX(0)}
        y2={PAD.top + PLOT_H}
        stroke={mutedColor}
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      <text
        x={slotToX(0)}
        y={PAD.top - 5}
        textAnchor="middle"
        fill={mutedColor}
        fontSize="10"
        fontFamily="monospace"
      >
        OPEN
      </text>

      {/* Previous close reference line — full width */}
      {previousClose != null && (
        <>
          <line
            x1={PAD.left}
            y1={toY(previousClose)}
            x2={CHART_W - PAD.right}
            y2={toY(previousClose)}
            stroke={mutedColor}
            strokeWidth="1"
            strokeDasharray="6 4"
          />
          <text
            x={CHART_W - PAD.right + 4}
            y={toY(previousClose) + 4}
            fill={mutedColor}
            fontSize="10"
            fontFamily="monospace"
          >
            PC
          </text>
        </>
      )}

      {/* Forecast spread band — min/max range across all agents */}
      {spreadPath && (
        <path
          d={spreadPath}
          fill="#a1a1aa"
          opacity="0.06"
        />
      )}

      {/* Forecast lines */}
      {!showConsensus && forecasts.map((f, fi) => {
        const pts: string[] = [];
        if (previousClose != null) {
          pts.push(`${PAD.left},${toY(previousClose)}`);
        }
        f.price_points.forEach((p: number, i: number) => {
          pts.push(`${labelToX(i)},${toY(p)}`);
        });
        const isSelected = selectedForecastId === f.id;
        const hasSel = selectedForecastId != null;
        return (
          <polyline
            key={f.id}
            points={pts.join(' ')}
            fill="none"
            stroke={FORECAST_COLORS[fi % FORECAST_COLORS.length]}
            strokeWidth={isSelected ? 2.5 : 1}
            strokeDasharray="5 3"
            opacity={hasSel ? (isSelected ? 1 : 0.15) : defaultForecastOpacity}
          />
        );
      })}

      {/* Consensus line — average of all forecasts */}
      {showConsensus && forecasts.length > 0 && (() => {
        const avgPts: string[] = [];
        if (previousClose != null) {
          avgPts.push(`${PAD.left},${toY(previousClose)}`);
        }
        for (let i = 0; i < numPoints; i++) {
          const avg = forecasts.reduce((sum, f) => sum + f.price_points[i], 0) / forecasts.length;
          avgPts.push(`${labelToX(i)},${toY(avg)}`);
        }
        return (
          <polyline
            points={avgPts.join(' ')}
            fill="none"
            stroke="#f5e642"
            strokeWidth="1.5"
            strokeDasharray="5 3"
            opacity="0.8"
          />
        );
      })()}

      {/* Actual price line — smooth cubic bezier */}
      {actualPoints.length >= 2 && (
        <path
          d={smoothPath(actualPoints)}
          fill="none"
          stroke={actualLineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Pulsing dot at leading edge of actual line */}
      {lastActual && (
        <g>
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
