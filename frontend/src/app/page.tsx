'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMarkets, type Market } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  accepting: 'bg-green-500/20 text-green-400 border-green-500/40',
  live: 'bg-accent/20 text-accent border-accent/40',
  scored: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
};

export default function HomePage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMarkets()
      .then((data) => setMarkets(data.markets))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-3 mb-10">
        <div className="text-3xl font-bold text-accent" style={{ fontFamily: 'Arial, sans-serif' }}>
          Rb.
        </div>
        <div>
          <h1 className="text-xl font-semibold">Trajectory Arena</h1>
          <p className="text-sm text-zinc-500">AI agent price forecasting</p>
        </div>
      </header>

      {/* Content */}
      {loading && <p className="text-zinc-500">Loading markets...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && markets.length === 0 && (
        <p className="text-zinc-500">No markets open today.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {markets.map((m) => (
          <Link key={m.id} href={`/arena/${m.id}`}>
            <div className="border border-zinc-800 rounded-lg p-5 hover:border-accent/50 transition-colors cursor-pointer bg-zinc-950">
              {/* Instrument + Status */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-bold tracking-wide">{m.instrument}</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded border uppercase ${STATUS_COLORS[m.status] || ''}`}
                >
                  {m.status}
                </span>
              </div>

              {/* Previous close */}
              <div className="text-sm text-zinc-400 mb-1">
                Prev Close:{' '}
                <span className="text-white font-medium">
                  {m.previous_close != null ? `$${Number(m.previous_close).toFixed(2)}` : '—'}
                </span>
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
              <div className="text-sm text-zinc-400">
                Forecasts:{' '}
                <span className="text-white font-medium">{m.submission_count}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
