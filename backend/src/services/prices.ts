interface InstrumentConfig {
  symbol: string;
  type: 'stock' | 'crypto';
  apiSymbol: string;
}

export const INSTRUMENTS: Record<string, InstrumentConfig> = {
  SPX: { symbol: 'SPX', type: 'stock', apiSymbol: 'SPY' },
  NVDA: { symbol: 'NVDA', type: 'stock', apiSymbol: 'NVDA' },
  AAPL: { symbol: 'AAPL', type: 'stock', apiSymbol: 'AAPL' },
  TSLA: { symbol: 'TSLA', type: 'stock', apiSymbol: 'TSLA' },
  GOLD: { symbol: 'GOLD', type: 'stock', apiSymbol: 'GLD' },
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

export function getMarketStatus(): { isOpen: boolean; nextCloseMs: number | null } {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  const day = et.getDay();
  if (day === 0 || day === 6) {
    return { isOpen: false, nextCloseMs: null };
  }

  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeMinutes = hours * 60 + minutes;

  const openMinutes = 9 * 60 + 30; // 9:30 AM
  const closeMinutes = 16 * 60;     // 4:00 PM

  const isOpen = timeMinutes >= openMinutes && timeMinutes < closeMinutes;

  let nextCloseMs: number | null = null;
  if (isOpen) {
    const closeToday = new Date(et);
    closeToday.setHours(16, 0, 0, 0);
    nextCloseMs = closeToday.getTime() - et.getTime();
  }

  return { isOpen, nextCloseMs };
}
