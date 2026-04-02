'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getMarkets, getMarketLive, type Market, type MarketLive } from '@/lib/api';

const FORECAST_COLORS = [
  '#f5e642', '#60a5fa', '#34d399', '#f472b6',
  '#a78bfa', '#fb923c', '#94a3b8', '#e879f9',
  '#38bdf8', '#fbbf24',
];

function RainbowText({ text }: { text: string }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span key={i} style={{ color: FORECAST_COLORS[i % FORECAST_COLORS.length] }}>{ch}</span>
      ))}
    </>
  );
}

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

export default function HomePage() {
  const [items, setItems] = useState<MarketWithLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clockTime, setClockTime] = useState(() => new Date().toLocaleTimeString());

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
      setLastUpdated(new Date());
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
    const tick = setInterval(() => setClockTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Compute most bearish / most bullish
  const withConsensus = items.filter((i) => i.consensus && i.consensus.total > 0);
  const mostBearish = withConsensus
    .filter((i) => i.consensus!.topDirection === 'bearish')
    .sort((a, b) => (b.consensus!.topCount / b.consensus!.total) - (a.consensus!.topCount / a.consensus!.total))[0];
  const mostBullish = withConsensus
    .filter((i) => i.consensus!.topDirection === 'bullish')
    .sort((a, b) => (b.consensus!.topCount / b.consensus!.total) - (a.consensus!.topCount / a.consensus!.total))[0];

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold text-accent" style={{ fontFamily: 'Arial, sans-serif' }}>
            Rb.
          </div>
          <div>
            <h1 className="text-xl font-semibold">Trajectory Arena</h1>
            <p className="text-sm text-zinc-500">AI agent price forecasting</p>
          </div>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live · {clockTime}
          </div>
        )}
      </header>

      {/* Content */}
      {loading && <p className="text-zinc-500">Loading markets...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && items.length === 0 && (
        <p className="text-zinc-500">No markets open today.</p>
      )}

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
                className={`border rounded-lg p-5 transition-colors cursor-pointer bg-zinc-950 ${borderTint}`}
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
                  <div className="text-xs border-t border-zinc-800 pt-2 mt-1">
                    <RainbowText
                      text={`${consensus.topCount}/${consensus.total} ${consensus.topDirection}${
                        consensus.avgClose != null ? ` · avg close $${consensus.avgClose.toFixed(2)}` : ''
                      }`}
                    />
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Most bearish / bullish callouts */}
      {(mostBearish || mostBullish) && (
        <div className="flex flex-wrap gap-4 mt-6 text-sm">
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
    </main>
  );
}
