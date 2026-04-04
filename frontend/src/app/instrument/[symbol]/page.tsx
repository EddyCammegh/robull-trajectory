'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getInstrumentHistory, type InstrumentDay } from '@/lib/api';
import { Nav } from '@/components/Nav';

export default function InstrumentPage({ params }: { params: { symbol: string } }) {
  const [days, setDays] = useState<InstrumentDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const symbol = params.symbol.toUpperCase();

  useEffect(() => {
    getInstrumentHistory(symbol)
      .then((d) => setDays(d.days))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [symbol]);

  const allMapes = days.filter((d) => d.top_mape != null).map((d) => d.top_mape!);
  const bestMape = allMapes.length > 0 ? Math.min(...allMapes) : null;
  const avgMape = allMapes.length > 0 ? allMapes.reduce((a, b) => a + b, 0) / allMapes.length : null;

  return (
    <main className="min-h-screen">
      <div className="px-4 md:px-6 pt-6">
        <Nav />
      </div>
      <div className="px-4 md:px-6 pb-6 max-w-5xl mx-auto">

      {/* Stats bar */}
      {(bestMape != null || avgMape != null) && (
        <div className="flex gap-6 mb-8 text-sm">
          {bestMape != null && (
            <div>
              <span className="text-zinc-500">Best MAPE</span>{' '}
              <span className="text-accent font-mono font-medium">{bestMape.toFixed(2)}%</span>
            </div>
          )}
          {avgMape != null && (
            <div>
              <span className="text-zinc-500">Avg Winner MAPE</span>{' '}
              <span className="text-white font-mono font-medium">{avgMape.toFixed(2)}%</span>
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-zinc-500">Loading...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}
      {!loading && days.length === 0 && <p className="text-zinc-500">No scored days yet.</p>}

      {days.length > 0 && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-6 gap-2 px-4 py-2 text-[10px] text-zinc-600 uppercase tracking-wider bg-zinc-900/50">
            <span>Date</span>
            <span>Winner</span>
            <span className="text-right">Best MAPE</span>
            <span className="text-right">Avg MAPE</span>
            <span className="text-right">Open → Close</span>
            <span className="text-right">Forecasts</span>
          </div>

          {days.map((d, i) => {
            const priceMove = d.open_price != null && d.close_price != null
              ? ((d.close_price - d.open_price) / d.open_price) * 100
              : null;

            return (
              <Link key={d.market_id} href={`/arena/${d.market_id}`}>
                <div className={`grid grid-cols-6 gap-2 px-4 py-3 text-sm hover:bg-zinc-900/50 transition-colors cursor-pointer ${
                  i === 0 ? '' : 'border-t border-zinc-800/50'
                }`}>
                  <span className="text-zinc-400 font-mono text-xs">{d.trading_date}</span>
                  <span className="text-accent font-medium truncate">{d.top_agent ?? '—'}</span>
                  <span className="text-right font-mono text-xs text-zinc-300">
                    {d.top_mape != null ? `${d.top_mape.toFixed(2)}%` : '—'}
                  </span>
                  <span className="text-right font-mono text-xs text-zinc-500">
                    {d.avg_mape != null ? `${d.avg_mape.toFixed(2)}%` : '—'}
                  </span>
                  <span className="text-right font-mono text-xs">
                    {d.open_price != null && d.close_price != null ? (
                      <>
                        <span className="text-zinc-500">${d.open_price.toFixed(0)}→${d.close_price.toFixed(0)}</span>
                        {priceMove != null && (
                          <span className={`ml-1 ${priceMove >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {priceMove >= 0 ? '+' : ''}{priceMove.toFixed(1)}%
                          </span>
                        )}
                      </>
                    ) : '—'}
                  </span>
                  <span className="text-right text-zinc-500">{d.forecast_count}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      </div>
    </main>
  );
}
