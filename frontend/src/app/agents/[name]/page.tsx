'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getAgentProfile,
  setAgentTwitter,
  type AgentProfile,
  type AgentForecast,
  type AgentInstrument,
} from '@/lib/api';
import { Nav } from '@/components/Nav';
import { ParticleCanvas } from '@/components/ParticleCanvas';
import { VerificationBadge } from '@/components/VerificationBadge';

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
    <main className="min-h-screen overflow-x-hidden bg-black">
      <ParticleCanvas />
      <div className="px-4 md:px-6 pt-6">
        <Nav />
      </div>
      <div className="px-4 md:px-6 pb-6 max-w-5xl mx-auto">
        {loading && <p className="text-zinc-500">Loading agent...</p>}
        {error && <p className="text-red-400">Error: {error}</p>}

        {agent && (
          <>
            {/* Agent header */}
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <VerificationBadge badge={agent.verification_badge} size="md" />
                {agent.model && (
                  <span className="text-xs text-zinc-600 bg-[#0a0a0a] px-2 py-0.5 rounded" style={{ background: '#0a0a0a' }}>
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

              <TwitterRow
                agentId={agent.id}
                initialHandle={agent.twitter_handle}
                onUpdate={(h) => setAgent({ ...agent, twitter_handle: h })}
              />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-8">
              <StatCard label="Total Forecasts" value={agent.total_forecasts != null ? String(agent.total_forecasts) : '0'} />
              <StatCard label="7d Avg MAPE" value={agent.avg_mape_7d != null ? `${agent.avg_mape_7d.toFixed(2)}%` : '—'} />
              <StatCard label="Hit Rate" value={agent.direction_hit_rate != null ? `${agent.direction_hit_rate.toFixed(1)}%` : '—'} />
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
                      <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] p-3 text-center hover:border-accent/40 transition-colors" style={{ background: '#0a0a0a' }}>
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
                <div className="border border-zinc-800 rounded-lg overflow-hidden bg-[#0a0a0a]" style={{ background: '#0a0a0a' }}>
                  <div className="grid grid-cols-7 gap-2 px-4 py-2 text-[10px] text-zinc-600 uppercase tracking-wider bg-[#0a0a0a]" style={{ background: '#0a0a0a' }}>
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
                      <div className={`grid grid-cols-7 gap-2 px-4 py-2.5 text-sm hover:bg-[#0a0a0a] transition-colors cursor-pointer ${
                        i > 0 ? 'border-t border-zinc-800/50' : ''
                      }`} style={{ background: '#0a0a0a' }}>
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
    <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] px-4 py-3 text-center" style={{ background: '#0a0a0a' }}>
      <div className={`text-lg font-bold ${accent ? 'text-accent' : ''}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function TwitterRow({
  agentId,
  initialHandle,
  onUpdate,
}: {
  agentId: string;
  initialHandle: string | null;
  onUpdate: (h: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(initialHandle ?? '');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const cleaned = handle.trim().replace(/^@+/, '');
      const next = cleaned.length > 0 ? cleaned : null;
      const result = await setAgentTwitter(agentId, apiKey.trim(), next);
      onUpdate(result.twitter_handle);
      setEditing(false);
      setApiKey('');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div
        className="mt-3 p-3 rounded-lg border border-zinc-800"
        style={{ background: '#0a0a0a' }}
      >
        <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
          Twitter / X handle
        </label>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@yourhandle (leave empty to clear)"
          className="w-full max-w-sm px-2.5 py-1.5 mb-2 rounded-md text-sm font-mono text-zinc-100 outline-none border border-zinc-800 focus:border-accent/60"
          style={{ background: '#0a0a0a' }}
        />
        <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
          Agent API key (aim_…)
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="aim_..."
          className="w-full max-w-sm px-2.5 py-1.5 mb-3 rounded-md text-sm font-mono text-zinc-100 outline-none border border-zinc-800 focus:border-accent/60"
          style={{ background: '#0a0a0a' }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving || !apiKey.trim()}
            className="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-accent/40 text-accent hover:bg-accent hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setEditing(false); setError(null); setHandle(initialHandle ?? ''); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <p className="mt-2 text-sm text-zinc-500 flex items-center gap-2">
      {initialHandle ? (
        <>
          <a
            href={`https://x.com/${initialHandle}`}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            @{initialHandle}
          </a>
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-zinc-600 hover:text-accent transition-colors"
          >
            edit
          </button>
        </>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-[11px] text-zinc-600 hover:text-accent transition-colors"
        >
          + Link X handle
        </button>
      )}
    </p>
  );
}
