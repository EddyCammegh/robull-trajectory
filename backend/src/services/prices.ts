interface InstrumentConfig {
  symbol: string;
  type: 'stock' | 'crypto';
  apiSymbol: string;
}

export const INSTRUMENTS: Record<string, InstrumentConfig> = {
  AAPL: { symbol: 'AAPL', type: 'stock', apiSymbol: 'AAPL' },
  NVDA: { symbol: 'NVDA', type: 'stock', apiSymbol: 'NVDA' },
  META: { symbol: 'META', type: 'stock', apiSymbol: 'META' },
  MSFT: { symbol: 'MSFT', type: 'stock', apiSymbol: 'MSFT' },
  SPY: { symbol: 'SPY', type: 'stock', apiSymbol: 'SPY' },
};

export async function fetchStockPrice(symbol: string): Promise<number> {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  if (!apiKey) throw new Error('ALPHA_VANTAGE_KEY not set');

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  const quote = data['Global Quote'];
  if (!quote || !quote['05. price']) {
    throw new Error(`No quote data for ${symbol}: ${JSON.stringify(data)}`);
  }

  return parseFloat(quote['05. price']);
}

export async function fetchCryptoPrice(symbol: string): Promise<number> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data[symbol]?.usd) {
    throw new Error(`No price data for ${symbol}`);
  }

  return data[symbol].usd;
}

export async function fetchPrice(instrument: string): Promise<number> {
  const config = INSTRUMENTS[instrument];
  if (!config) throw new Error(`Unknown instrument: ${instrument}`);

  if (config.type === 'crypto') {
    return fetchCryptoPrice(config.apiSymbol);
  }
  return fetchStockPrice(config.apiSymbol);
}

// NYSE holidays for 2026 (month is 0-indexed)
const NYSE_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

export function getMarketStatus(): { isOpen: boolean; nextCloseMs: number | null } {
  const now = new Date();
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  // Check NYSE holidays (using ET date)
  const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  if (NYSE_HOLIDAYS_2026.includes(etDate)) {
    return { isOpen: false, nextCloseMs: null };
  }

  const weekday = etParts.find((p) => p.type === 'weekday')!.value;
  const hour = parseInt(etParts.find((p) => p.type === 'hour')!.value, 10);
  const minute = parseInt(etParts.find((p) => p.type === 'minute')!.value, 10);

  const weekdays = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  if (!weekdays.has(weekday)) {
    return { isOpen: false, nextCloseMs: null };
  }

  const timeMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30; // 9:30 AM ET
  const closeMinutes = 16 * 60;     // 4:00 PM ET

  const isOpen = timeMinutes >= openMinutes && timeMinutes < closeMinutes;

  let nextCloseMs: number | null = null;
  if (isOpen) {
    nextCloseMs = (closeMinutes - timeMinutes) * 60 * 1000;
  }

  return { isOpen, nextCloseMs };
}
