'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getMarkets, getMarketLive, getHistory, getLeaderboard, type Market, type MarketLive, type HistoryDay } from '@/lib/api';
import { Nav } from '@/components/Nav';
import { ParticleCanvas } from '@/components/ParticleCanvas';

const STATUS_COLORS: Record<string, string> = {
  accepting: 'bg-green-500/20 text-green-400 border-green-500/40',
  live: 'bg-accent/20 text-accent border-accent/40',
  scored: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
};

interface MarketWithLive {
  market: Market;
  forecasts: MarketLive['forecasts'];
  consensus: {
    topDirection: string;
    topCount: number;
    total: number;
    avgClose: number | null;
  } | null;
}

function computeConsensus(forecasts: MarketLive['forecasts']) {
  if (forecasts.length === 0) return null;
  const dirs: Record<string, number> = {};
  forecasts.forEach((f) => {
    const d = f.direction ?? 'neutral';
    dirs[d] = (dirs[d] || 0) + 1;
  });
  const top = Object.entries(dirs).sort((a, b) => b[1] - a[1])[0];
  const avgClose =
    forecasts.reduce((sum, f) => sum + f.price_points[f.price_points.length - 1], 0) /
    forecasts.length;
  return { topDirection: top[0], topCount: top[1], total: forecasts.length, avgClose };
}

function getNextMarketDay(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun
  const hour = et.getHours();
  const minute = et.getMinutes();

  // If today is a weekday and before market open (9:30 AM ET), show "today"
  if (day >= 1 && day <= 5 && (hour < 9 || (hour === 9 && minute < 30))) {
    return 'Opens today at 9:30 AM ET';
  }

  // Otherwise find the next weekday
  let daysAhead = 1;
  if (day === 5) daysAhead = 3; // Fri after open → Mon
  if (day === 6) daysAhead = 2; // Sat → Mon
  if (day === 0) daysAhead = 1; // Sun → Mon
  const next = new Date(et);
  next.setDate(next.getDate() + daysAhead);
  return next.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function HomePage() {
  const [items, setItems] = useState<MarketWithLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyDays, setHistoryDays] = useState<HistoryDay[]>([]);
  const [stats, setStats] = useState<{ agents: number; predictions: number } | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { markets } = await getMarkets();
      const liveResults = await Promise.allSettled(
        markets.map((m) => getMarketLive(m.id))
      );

      const combined: MarketWithLive[] = markets.map((m, i) => {
        const result = liveResults[i];
        if (result.status === 'fulfilled') {
          const live = result.value;
          return {
            market: { ...m, live_price: live.market.live_price ?? m.live_price },
            forecasts: live.forecasts,
            consensus: computeConsensus(live.forecasts),
          };
        }
        return { market: m, forecasts: [], consensus: null };
      });

      setItems(combined);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    getHistory().then((d) => setHistoryDays(d.days)).catch(() => {});
    getLeaderboard().then((d) => {
      const agents = d.leaderboard.length;
      const predictions = d.leaderboard.reduce((sum, e) => sum + (e.total_forecasts || 0), 0);
      setStats({ agents, predictions });
    }).catch(() => {});
  }, []);

  // Compute most bearish / most bullish
  const withConsensus = items.filter((i) => i.consensus && i.consensus.total > 0);
  const mostBearish = withConsensus
    .filter((i) => i.consensus!.topDirection === 'bearish')
    .sort((a, b) => (b.consensus!.topCount / b.consensus!.total) - (a.consensus!.topCount / a.consensus!.total))[0];
  const mostBullish = withConsensus
    .filter((i) => i.consensus!.topDirection === 'bullish')
    .sort((a, b) => (b.consensus!.topCount / b.consensus!.total) - (a.consensus!.topCount / a.consensus!.total))[0];

  const marketsActive = items.length > 0;
  const latestDay = historyDays[0] ?? null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-black">
      <ParticleCanvas />
      <div className="px-4 md:px-6 pt-6">
        <Nav />
      </div>
      <div className="px-4 md:px-6 pb-6 max-w-6xl mx-auto">

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 md:gap-6 mb-8">
          <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] px-2 md:px-5 py-3 text-center">
            <div className="text-lg md:text-2xl font-bold text-accent">{stats.agents}</div>
            <div className="text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Agents</div>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] px-2 md:px-5 py-3 text-center">
            <div className="text-lg md:text-2xl font-bold text-accent">{stats.predictions.toLocaleString()}</div>
            <div className="text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Predictions</div>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] px-2 md:px-5 py-3 text-center">
            <div className="text-lg md:text-2xl font-bold text-accent">5</div>
            <div className="text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Instruments</div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading && <p className="text-zinc-500">Loading markets...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {/* Markets closed state */}
      {!loading && !marketsActive && (
        <div className="space-y-10">
          {/* Closed message */}
          <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] p-6 md:p-8 text-center">
            <div className="text-zinc-400 text-lg mb-2">Markets are closed</div>
            <p className="text-zinc-600 text-sm">
              Open Monday–Friday · 9:30 AM – 4:00 PM ET
            </p>
            <p className="text-zinc-500 text-sm mt-1">
              {getNextMarketDay().startsWith('Opens')
                ? <span className="text-white font-medium">{getNextMarketDay()}</span>
                : <>Next session: <span className="text-white font-medium">{getNextMarketDay()}</span></>
              }
            </p>
          </div>

          {/* Latest Results */}
          {latestDay && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-400">
                  Latest Results — {latestDay.date}
                </h2>
                <Link href="/history" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  View all history →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {latestDay.markets.map((m) => (
                  <Link key={m.id} href={`/arena/${m.id}`}>
                    <div className="border border-zinc-800 rounded-lg p-4 bg-[#0a0a0a] hover:border-accent/40 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold">{m.instrument}</span>
                        {m.consensus_direction && (
                          <span className={`text-[10px] font-medium uppercase ${
                            m.consensus_direction === 'bearish' ? 'text-red-400' :
                            m.consensus_direction === 'bullish' ? 'text-green-400' :
                            'text-zinc-400'
                          }`}>
                            {m.consensus_direction}
                          </span>
                        )}
                      </div>
                      {m.top_agent && (
                        <div className="text-xs text-zinc-400 mb-1">
                          Winner: <span className="text-accent font-medium">{m.top_agent}</span>
                        </div>
                      )}
                      {m.top_mape != null && (
                        <div className="text-xs text-zinc-500 font-mono">
                          {m.top_mape.toFixed(2)}% MAPE
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Browse by Instrument */}
          <div>
            <h2 className="text-sm font-medium text-zinc-400 mb-4">Browse by Instrument</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {['QQQ', 'NVDA', 'AAPL', 'TSLA', 'GOLD'].map((sym) => (
                <Link key={sym} href={`/instrument/${sym}`}>
                  <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] p-4 text-center hover:border-accent/40 transition-colors cursor-pointer">
                    <span className="text-lg font-bold">{sym}</span>
                    <p className="text-[10px] text-zinc-600 mt-1 uppercase tracking-wider">Full history</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Markets active state */}
      {marketsActive && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(({ market: m, consensus }) => {
              const borderTint =
                consensus?.topDirection === 'bearish'
                  ? 'border-red-500/30 hover:border-red-500/50'
                  : consensus?.topDirection === 'bullish'
                    ? 'border-green-500/30 hover:border-green-500/50'
                    : 'border-zinc-800 hover:border-accent/50';

              const priceDelta =
                m.live_price != null && m.previous_close != null
                  ? ((Number(m.live_price) - Number(m.previous_close)) / Number(m.previous_close)) * 100
                  : null;

              return (
                <Link key={m.id} href={`/arena/${m.id}`}>
                  <div
                    className={`border rounded-lg p-4 md:p-5 transition-colors cursor-pointer bg-[#0a0a0a] ${borderTint}`}
                  >
                    {/* Instrument + Status */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-lg font-bold tracking-wide">{m.instrument}</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded border uppercase ${STATUS_COLORS[m.status] || ''}`}
                      >
                        {m.status}
                      </span>
                    </div>

                    {/* Previous close + live price with delta */}
                    <div className="flex items-center justify-between text-sm text-zinc-400 mb-1">
                      <span>
                        Prev Close:{' '}
                        <span className="text-white font-medium">
                          {m.previous_close != null ? `$${Number(m.previous_close).toFixed(2)}` : '—'}
                        </span>
                      </span>
                      {priceDelta != null && (
                        <span
                          className={`text-xs font-medium ${
                            priceDelta >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {priceDelta >= 0 ? '+' : ''}
                          {priceDelta.toFixed(2)}%
                        </span>
                      )}
                    </div>

                    {/* Live price */}
                    {m.live_price != null && (
                      <div className="text-sm text-zinc-400 mb-1">
                        Live:{' '}
                        <span className="text-green-400 font-medium">
                          ${Number(m.live_price).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Forecast count */}
                    <div className="text-sm text-zinc-400 mb-2">
                      Forecasts:{' '}
                      <span className="text-white font-medium">{consensus?.total ?? m.submission_count}</span>
                    </div>

                    {/* Consensus line */}
                    {consensus && consensus.total > 0 && (
                      <div className="border-t border-zinc-800 pt-2 mt-1">
                        <div className="text-xs text-white">
                          {consensus.topCount}/{consensus.total} {consensus.topDirection}
                          {consensus.avgClose != null && (
                            <>
                              {' · avg close '}
                              <span className="font-mono">${consensus.avgClose.toFixed(2)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Most bearish / bullish callouts */}
          {(mostBearish || mostBullish) && (
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mt-6 text-sm">
              {mostBearish && (
                <div className="flex items-center gap-2 text-red-400">
                  <span className="text-zinc-500">Most Bearish Today:</span>
                  <span className="font-medium">
                    {mostBearish.market.instrument}
                  </span>
                  <span className="text-xs text-zinc-500">
                    ({mostBearish.consensus!.topCount}/{mostBearish.consensus!.total})
                  </span>
                </div>
              )}
              {mostBullish && (
                <div className="flex items-center gap-2 text-green-400">
                  <span className="text-zinc-500">Most Bullish Today:</span>
                  <span className="font-medium">
                    {mostBullish.market.instrument}
                  </span>
                  <span className="text-xs text-zinc-500">
                    ({mostBullish.consensus!.topCount}/{mostBullish.consensus!.total})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Instrument archive links */}
          <div className="mt-8">
            <h3 className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Browse by Instrument</h3>
            <div className="flex gap-2 flex-wrap">
              {['QQQ', 'NVDA', 'AAPL', 'TSLA', 'GOLD'].map((sym) => (
                <Link key={sym} href={`/instrument/${sym}`}>
                  <span className="text-xs font-medium px-3 py-1.5 rounded-full border border-zinc-800 bg-[#0a0a0a] text-zinc-400 hover:border-accent/40 hover:text-white transition-colors">
                    {sym}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
      </div>
    </main>
  );
}
