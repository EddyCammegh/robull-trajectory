import WebSocket from 'ws';
import { pool } from '../db.js';
import { getMarketStatus } from './prices.js';

const POLYGON_URL = process.env.POLYGON_REALTIME === 'true'
  ? 'wss://socket.polygon.io/stocks'
  : 'wss://delayed.polygon.io/stocks';

const SUBSCRIBE_SYMBOLS = ['QQQ', 'NVDA', 'AAPL', 'TSLA', 'GLD'];

const SYMBOL_TO_INSTRUMENT: Record<string, string> = {
  QQQ: 'QQQ',
  GLD: 'GOLD',
  NVDA: 'NVDA',
  AAPL: 'AAPL',
  TSLA: 'TSLA',
};

const latestPrices = new Map<string, { price: number; timestamp: number }>();

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function getLatestPrice(instrument: string): number | null {
  const entry = latestPrices.get(instrument);
  return entry?.price ?? null;
}

export function startPolygonStream(): void {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.warn('POLYGON_API_KEY not set, skipping Polygon WebSocket stream');
    return;
  }

  connect(apiKey);
}

function connect(apiKey: string): void {
  if (ws) {
    try { ws.close(); } catch {}
  }

  ws = new WebSocket(POLYGON_URL);

  ws.on('open', () => {
    console.log('Polygon WebSocket connected');
    ws!.send(JSON.stringify({ action: 'auth', params: apiKey }));
  });

  ws.on('message', (raw: WebSocket.Data) => {
    let messages: any[];
    try {
      messages = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!Array.isArray(messages)) messages = [messages];

    for (const msg of messages) {
      if (msg.ev === 'status') {
        if (msg.status === 'auth_success') {
          const subs = SUBSCRIBE_SYMBOLS.map((s) => `A.${s}`).join(',');
          ws!.send(JSON.stringify({ action: 'subscribe', params: subs }));
          console.log(`Polygon subscribed to: ${subs}`);
        }
        continue;
      }

      if (msg.ev === 'A') {
        handleAggregate(msg);
      }
    }
  });

  ws.on('close', () => {
    console.log('Polygon WebSocket disconnected, reconnecting in 5s...');
    scheduleReconnect(apiKey);
  });

  ws.on('error', (err) => {
    console.error('Polygon WebSocket error:', err.message);
    ws?.close();
  });
}

function scheduleReconnect(apiKey: string): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(apiKey), 5000);
}

async function handleAggregate(msg: {
  sym: string;
  c: number;   // close price of the aggregate
  t: number;   // timestamp (epoch ms)
}): Promise<void> {
  const instrument = SYMBOL_TO_INSTRUMENT[msg.sym];
  if (!instrument) return;

  const price = msg.c;
  latestPrices.set(instrument, { price, timestamp: msg.t });

  const { isOpen } = getMarketStatus();
  if (!isOpen) return;

  try {
    const market = await pool.query(
      `SELECT id, created_at FROM trajectory_markets
       WHERE instrument = $1 AND trading_date = CURRENT_DATE AND status = 'live'`,
      [instrument]
    );

    if (market.rows.length === 0) return;

    const marketRow = market.rows[0];
    const createdAt = new Date(marketRow.created_at);
    const now = new Date();
    const hourIndex = Math.floor(
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
    );

    if (hourIndex < 0 || hourIndex > 6) return;

    await pool.query(
      `INSERT INTO trajectory_actuals (market_id, hour_index, actual_price)
       VALUES ($1, $2, $3)
       ON CONFLICT (market_id, hour_index) DO UPDATE SET actual_price = $3, fetched_at = NOW()`,
      [marketRow.id, hourIndex, price]
    );
  } catch (err) {
    console.error(`Error storing actual for ${instrument}:`, err);
  }
}
