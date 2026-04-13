import cron from 'node-cron';
import { createDailyMarkets } from './createMarkets.js';
import { fetchActualPrices } from './fetchActuals.js';
import { scoreCompletedMarkets } from './scoreMarkets.js';
import { collectPreMarketContext, collectCloseContext } from '../services/marketContext.js';
import { pool } from '../db.js';

const NYSE_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
];

function isTradingDay(): boolean {
  const now = new Date();
  const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  return !NYSE_HOLIDAYS_2026.includes(etDate);
}

export function startCrons(): void {
  // Create markets at 5:00 AM ET every weekday (skip holidays)
  cron.schedule('0 5 * * 1-5', async () => {
    if (!isTradingDay()) { console.log('NYSE holiday — skipping market creation'); return; }
    console.log('Running createDailyMarkets cron');
    await createDailyMarkets();
  }, { timezone: 'America/New_York' });

  // Transition accepting → live at 9:30 AM ET (skip holidays, US session only)
  cron.schedule('30 9 * * 1-5', async () => {
    if (!isTradingDay()) { console.log('NYSE holiday — skipping status transition'); return; }
    console.log('Transitioning US markets to live');
    await pool.query(
      `UPDATE trajectory_markets SET status = 'live'
       WHERE trading_date = CURRENT_DATE AND session = 'US' AND status = 'accepting'`
    );
  }, { timezone: 'America/New_York' });

  // Fetch actual prices every hour during market hours
  cron.schedule('5 10-16 * * 1-5', async () => {
    console.log('Running fetchActualPrices cron');
    await fetchActualPrices();
  }, { timezone: 'America/New_York' });

  // Pre-market context (VIX, XLK, premarket volume) at 7:00 AM ET
  cron.schedule('0 7 * * 1-5', async () => {
    if (!isTradingDay()) { console.log('NYSE holiday — skipping pre-market context'); return; }
    console.log('Running collectPreMarketContext cron');
    await collectPreMarketContext();
  }, { timezone: 'America/New_York' });

  // Close context (VIX at close, opening gap %) at 4:00 PM ET
  cron.schedule('0 16 * * 1-5', async () => {
    if (!isTradingDay()) { console.log('NYSE holiday — skipping close context'); return; }
    console.log('Running collectCloseContext cron');
    await collectCloseContext();
  }, { timezone: 'America/New_York' });

  // Score markets at 4:30 PM ET every weekday
  cron.schedule('30 16 * * 1-5', async () => {
    console.log('Running scoreCompletedMarkets cron');
    await scoreCompletedMarkets();
  }, { timezone: 'America/New_York' });

  console.log('Cron jobs scheduled (America/New_York)');
}
