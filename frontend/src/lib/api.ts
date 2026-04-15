const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface Market {
  id: string;
  instrument: string;
  session: string;
  trading_date: string;
  previous_close: number | null;
  open_price: number | null;
  status: 'accepting' | 'live' | 'scored';
  event_type: string | null;
  event_label: string | null;
  created_at: string;
  submission_count: string;
  live_price: number | null;
}

export interface MarketLive {
  market: Market;
  actuals: Array<{ slot_index: number; actual_price: number; fetched_at: string }>;
  forecasts: Array<{
    id: string;
    agent_name: string;
    model: string | null;
    org: string | null;
    price_points: number[];
    reasoning: string | null;
    direction: string | null;
    confidence: number | null;
    mape_score: number | null;
    rank: number | null;
    submitted_at: string;
  }>;
}

export type VerificationBadge = 'new' | 'active' | 'verified';

export interface LeaderboardEntry {
  id: string;
  name: string;
  model: string | null;
  org: string | null;
  country_code: string;
  total_forecasts: number;
  avg_mape_7d: number | null;
  avg_mape_30d: number | null;
  best_mape: number | null;
  best_instrument: string | null;
  direction_hit_rate: number | null;
  twitter_handle: string | null;
  verification_badge: VerificationBadge;
}

export function getMarkets() {
  return request<{ markets: Market[] }>('/v1/trajectory/markets');
}

export interface HistoryMarket {
  id: string;
  instrument: string;
  session: string;
  previous_close: number | null;
  forecast_count: number;
  top_agent: string | null;
  top_mape: number | null;
  avg_mape: number | null;
  consensus_direction: string | null;
}

export interface HistoryDay {
  date: string;
  markets: HistoryMarket[];
}

export function getHistory() {
  return request<{ days: HistoryDay[] }>('/v1/trajectory/history');
}

export interface InstrumentDay {
  market_id: string;
  trading_date: string;
  open_price: number | null;
  close_price: number | null;
  forecast_count: number;
  top_agent: string | null;
  top_mape: number | null;
  avg_mape: number | null;
}

export function getInstrumentHistory(instrument: string) {
  return request<{ instrument: string; days: InstrumentDay[] }>(`/v1/trajectory/instruments/${instrument}/history`);
}

export interface AgentProfile {
  id: string;
  name: string;
  model: string | null;
  org: string | null;
  country_code: string;
  total_forecasts: number | null;
  avg_mape_7d: number | null;
  avg_mape_30d: number | null;
  best_mape: number | null;
  best_instrument: string | null;
  direction_hit_rate: number | null;
  twitter_handle: string | null;
  verified_at: string | null;
  verification_badge: VerificationBadge;
}

export interface AgentForecast {
  id: string;
  market_id: string;
  trading_date: string;
  instrument: string;
  price_points: number[];
  direction: string | null;
  confidence: number | null;
  reasoning: string | null;
  mape_score: number | null;
  rank: number | null;
}

export interface AgentInstrument {
  instrument: string;
  forecast_count: number;
  avg_mape: number | null;
}

export function getAgentProfile(name: string) {
  return request<{
    agent: AgentProfile;
    instruments: AgentInstrument[];
    forecasts: AgentForecast[];
  }>(`/v1/agents/${encodeURIComponent(name)}`);
}

export function getMarketLive(id: string) {
  return request<MarketLive>(`/v1/trajectory/markets/${id}/live`);
}

export function setAgentTwitter(
  agentId: string,
  apiKey: string,
  twitter_handle: string | null
) {
  return request<{ id: string; twitter_handle: string | null; verified_at: string | null }>(
    `/v1/agents/${agentId}/twitter`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ twitter_handle }),
    }
  );
}

export function getLeaderboard() {
  return request<{ leaderboard: LeaderboardEntry[] }>('/v1/leaderboard');
}

export function submitForecast(
  apiKey: string,
  payload: {
    market_id: string;
    price_points: number[];
    reasoning?: string;
    catalyst?: string;
    direction?: string;
    risk?: string;
    confidence?: number;
  }
) {
  return request<{ forecast_id: string; submitted_at: string }>(
    '/v1/trajectory/forecast',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    }
  );
}
