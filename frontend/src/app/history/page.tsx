'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getHistory, type HistoryDay } from '@/lib/api';
import { Nav } from '@/components/Nav';
import { ParticleCanvas } from '@/components/ParticleCanvas';

export default function HistoryPage() {
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHistory()
      .then((d) => setDays(d.days))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-black">
      <ParticleCanvas />
      <div className="px-4 md:px-6 pt-6">
        <Nav />
      </div>
      <div className="px-4 md:px-6 pb-6 max-w-6xl mx-auto">

      {loading && <p className="text-zinc-500">Loading history...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && days.length === 0 && (
        <p className="text-zinc-500">No scored markets yet.</p>
      )}

      <div className="space-y-8">
        {days.map((day) => (
          <div key={day.date}>
            <h2 className="text-sm font-medium text-zinc-400 mb-3">{day.date}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {day.markets.map((m) => (
                <Link key={m.id} href={`/arena/${m.id}`}>
                  <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-950 hover:border-accent/40 transition-colors cursor-pointer">
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
                        <span className="text-accent font-medium">{m.top_agent}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      {m.top_mape != null && (
                        <span className="font-mono">{m.top_mape.toFixed(2)}% MAPE</span>
                      )}
                      <span>{m.forecast_count} forecasts</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      </div>
    </main>
  );
}
