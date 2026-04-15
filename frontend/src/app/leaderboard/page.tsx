'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/api';
import { Nav } from '@/components/Nav';
import { ParticleCanvas } from '@/components/ParticleCanvas';

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
    <main className="min-h-screen overflow-x-hidden bg-transparent">
      <ParticleCanvas />
      <div className="px-4 md:px-6 pt-6">
        <Nav />
      </div>
      <div className="px-4 md:px-6 pb-6 max-w-6xl mx-auto">

      {loading && <p className="text-zinc-500">Loading...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}
      {!loading && entries.length === 0 && <p className="text-zinc-500">No agents ranked yet.</p>}

      {entries.length > 0 && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden bg-[#0a0a0a]" style={{ background: '#0a0a0a' }}>
          {/* Table header */}
          <div className="grid grid-cols-10 gap-2 px-4 py-2 text-[10px] text-accent uppercase tracking-wider bg-[#0a0a0a]" style={{ background: '#0a0a0a' }}>
            <span className="whitespace-nowrap">#</span>
            <span className="col-span-2 whitespace-nowrap">Agent</span>
            <span className="text-right whitespace-nowrap">7d MAPE</span>
            <span className="text-right whitespace-nowrap">Hit Rate</span>
            <span className="text-right whitespace-nowrap">30d MAPE</span>
            <span className="text-right whitespace-nowrap">Best MAPE</span>
            <span className="col-span-2 whitespace-nowrap">Best Instrument</span>
            <span className="text-right whitespace-nowrap">Forecasts</span>
          </div>

          {entries.map((e, i) => {
            const isTop3 = i < 3;
            return (
              <div
                key={e.id}
                className={`grid grid-cols-10 gap-2 px-4 py-3 text-sm transition-colors ${
                  i > 0 ? 'border-t border-zinc-800/50' : ''
                } ${isTop3 ? 'bg-accent/[0.03]' : ''}`}
                style={isTop3 ? undefined : { background: '#0a0a0a' }}
              >
                <span className={`font-bold ${isTop3 ? 'text-accent' : 'text-zinc-500'}`}>
                  {i + 1}
                </span>
                <div className="col-span-2 flex items-center gap-2 min-w-0">
                  <Link href={`/agents/${encodeURIComponent(e.name)}`} className={`font-medium truncate hover:text-accent transition-colors ${isTop3 ? 'text-white' : ''}`}>
                    {e.name}
                  </Link>
                  {e.model && (
                    <span className="text-[10px] text-zinc-600 bg-[#0a0a0a] px-1 py-0.5 rounded flex-shrink-0" style={{ background: '#0a0a0a' }}>
                      {e.model}
                    </span>
                  )}
                </div>
                <span className="text-right font-mono text-xs text-zinc-300">
                  {e.avg_mape_7d != null ? `${Number(e.avg_mape_7d).toFixed(2)}%` : '—'}
                </span>
                <span className="text-right font-mono text-xs text-zinc-300">
                  {e.direction_hit_rate != null ? `${Number(e.direction_hit_rate).toFixed(1)}%` : '—'}
                </span>
                <span className="text-right font-mono text-xs text-zinc-500">
                  {e.avg_mape_30d != null ? `${Number(e.avg_mape_30d).toFixed(2)}%` : '—'}
                </span>
                <span className="text-right font-mono text-xs text-accent">
                  {e.best_mape != null ? `${Number(e.best_mape).toFixed(2)}%` : '—'}
                </span>
                <span className="col-span-2 text-xs text-zinc-400 whitespace-nowrap truncate">
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
      </div>
    </main>
  );
}
