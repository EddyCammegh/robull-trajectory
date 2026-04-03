'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAgentProfile, type AgentProfile, type AgentForecast, type AgentInstrument } from '@/lib/api';
import { Nav } from '@/components/Nav';

export default function AgentPage({ params }: { params: { name: string } }) {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [instruments, setInstruments] = useState<AgentInstrument[]>([]);
  const [forecasts, setForecasts] = useState<AgentForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAgentProfile(params.name)
      .then((d) => {
        setAgent(d.agent);
        setInstruments(d.instruments);
        setForecasts(d.forecasts);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.name]);

  return (
    <main className="min-h-screen">
      <div className="px-6 pt-6">
        <Nav />
      </div>
      <div className="px-6 pb-6 max-w-5xl mx-auto">
        {loading && <p className="text-zinc-500">Loading agent...</p>}
        {error && <p className="text-red-400">Error: {error}</p>}

        {agent && (
          <>
            {/* Agent header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                {agent.model && (
                  <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded">
                    {agent.model}
                  </span>
                )}
                {agent.org && (
                  <span className="text-sm text-zinc-500">· {agent.org}</span>
                )}
              </div>
              {agent.country_code && agent.country_code !== 'XX' && (
                <p className="text-sm text-zinc-500">{agent.country_code}</p>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
              <StatCard label="Total Forecasts" value={agent.total_forecasts != null ? String(agent.total_forecasts) : '0'} />
              <StatCard label="7d Avg MAPE" value={agent.avg_mape_7d != null ? `${agent.avg_mape_7d.toFixed(2)}%` : '—'} />
              <StatCard label="30d Avg MAPE" value={agent.avg_mape_30d != null ? `${agent.avg_mape_30d.toFixed(2)}%` : '—'} />
              <StatCard label="Best MAPE" value={agent.best_mape != null ? `${agent.best_mape.toFixed(2)}%` : '—'} accent />
              <StatCard label="Best Instrument" value={agent.best_instrument ?? '—'} />
            </div>

            {/* Instrument breakdown */}
            {instruments.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-medium text-zinc-400 mb-3">By Instrument</h2>
                <div className="grid grid-cols-5 gap-3">
                  {instruments.map((inst) => (
                    <Link key={inst.instrument} href={`/instrument/${inst.instrument}`}>
                      <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-3 text-center hover:border-accent/40 transition-colors">
                        <div className="text-sm font-bold mb-1">{inst.instrument}</div>
                        <div className="text-xs text-accent font-mono">
                          {inst.avg_mape != null ? `${inst.avg_mape.toFixed(2)}%` : '—'}
                        </div>
                        <div className="text-[10px] text-zinc-600 mt-0.5">
                          {inst.forecast_count} forecast{inst.forecast_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent forecasts */}
            <div>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">
                Recent Forecasts ({forecasts.length})
              </h2>
              {forecasts.length === 0 ? (
                <p className="text-zinc-600 text-sm">No forecasts yet.</p>
              ) : (
                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-7 gap-2 px-4 py-2 text-[10px] text-zinc-600 uppercase tracking-wider bg-zinc-900/50">
                    <span>Date</span>
                    <span>Instrument</span>
                    <span>Direction</span>
                    <span className="text-right">Confidence</span>
                    <span className="text-right">MAPE</span>
                    <span className="text-right">Rank</span>
                    <span>Reasoning</span>
                  </div>
                  {forecasts.map((f, i) => (
                    <Link key={f.id} href={`/arena/${f.market_id}`}>
                      <div className={`grid grid-cols-7 gap-2 px-4 py-2.5 text-sm hover:bg-zinc-900/50 transition-colors cursor-pointer ${
                        i > 0 ? 'border-t border-zinc-800/50' : ''
                      }`}>
                        <span className="text-zinc-400 font-mono text-xs">{f.trading_date}</span>
                        <span className="font-medium text-xs">{f.instrument}</span>
                        <span className={`text-xs ${
                          f.direction === 'bullish' ? 'text-green-400' :
                          f.direction === 'bearish' ? 'text-red-400' :
                          'text-zinc-400'
                        }`}>
                          {f.direction ?? '—'}
                        </span>
                        <span className="text-right text-xs text-zinc-500">
                          {f.confidence != null ? `${f.confidence}%` : '—'}
                        </span>
                        <span className={`text-right font-mono text-xs ${
                          f.mape_score != null ? 'text-accent font-bold' : 'text-zinc-500'
                        }`}>
                          {f.mape_score != null ? `${f.mape_score.toFixed(2)}%` : '—'}
                        </span>
                        <span className="text-right text-xs text-zinc-500">
                          {f.rank != null ? `#${f.rank}` : '—'}
                        </span>
                        <span className="text-xs text-zinc-600 truncate">
                          {f.reasoning ? f.reasoning.slice(0, 100) : '—'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-950 px-4 py-3 text-center">
      <div className={`text-lg font-bold ${accent ? 'text-accent' : ''}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
