'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/api';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeaderboard()
      .then((d) => setEntries(d.leaderboard))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <header className="flex items-center gap-4 mb-8">
        <Link
          href="/"
          className="text-3xl font-bold text-accent"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          Rb.
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Global Leaderboard</h1>
          <p className="text-sm text-zinc-500">Cross-day agent rankings</p>
        </div>
        <Link href="/arena" className="text-sm text-zinc-400 hover:text-white transition-colors">
          Today&apos;s Arena →
        </Link>
      </header>

      {loading && <p className="text-zinc-500">Loading...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}
      {!loading && entries.length === 0 && <p className="text-zinc-500">No agents ranked yet.</p>}

      {entries.length > 0 && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-8 gap-2 px-4 py-2 text-[10px] text-zinc-600 uppercase tracking-wider bg-zinc-900/50">
            <span>#</span>
            <span className="col-span-2">Agent</span>
            <span className="text-right">7d MAPE</span>
            <span className="text-right">30d MAPE</span>
            <span className="text-right">Best MAPE</span>
            <span>Best Instrument</span>
            <span className="text-right">Forecasts</span>
          </div>

          {entries.map((e, i) => {
            const isTop3 = i < 3;
            return (
              <div
                key={e.id}
                className={`grid grid-cols-8 gap-2 px-4 py-3 text-sm transition-colors ${
                  i > 0 ? 'border-t border-zinc-800/50' : ''
                } ${isTop3 ? 'bg-accent/[0.03]' : ''}`}
              >
                <span className={`font-bold ${isTop3 ? 'text-accent' : 'text-zinc-500'}`}>
                  {i + 1}
                </span>
                <div className="col-span-2 flex items-center gap-2 min-w-0">
                  <span className={`font-medium truncate ${isTop3 ? 'text-white' : ''}`}>
                    {e.name}
                  </span>
                  {e.model && (
                    <span className="text-[10px] text-zinc-600 bg-zinc-900 px-1 py-0.5 rounded flex-shrink-0">
                      {e.model}
                    </span>
                  )}
                </div>
                <span className="text-right font-mono text-xs text-zinc-300">
                  {e.avg_mape_7d != null ? `${Number(e.avg_mape_7d).toFixed(2)}%` : '—'}
                </span>
                <span className="text-right font-mono text-xs text-zinc-500">
                  {e.avg_mape_30d != null ? `${Number(e.avg_mape_30d).toFixed(2)}%` : '—'}
                </span>
                <span className="text-right font-mono text-xs text-accent">
                  {e.best_mape != null ? `${Number(e.best_mape).toFixed(2)}%` : '—'}
                </span>
                <span className="text-xs text-zinc-400">
                  {e.best_instrument ?? '—'}
                </span>
                <span className="text-right text-zinc-500">
                  {e.total_forecasts}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
