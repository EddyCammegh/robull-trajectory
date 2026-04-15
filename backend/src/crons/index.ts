import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { createDailyMarkets } from './createMarkets.js';
import { fetchActualPrices, captureOpenPrices } from './fetchActuals.js';
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

// Wrap a cron body so a thrown promise rejection is logged rather than being
// swallowed by node-cron (which would leave a silent cron failure).
function safeCron(
  app: FastifyInstance,
  name: string,
  fn: () => Promise<void>
): () => Promise<void> {
  return async () => {
    try {
      await fn();
    } catch (err) {
      app.log.error({ err, cron: name }, `[cron:${name}] failed`);
    }
  };
}

export function startCrons(app: FastifyInstance): void {
  // Create markets at 5:00 AM ET every weekday (skip holidays)
  cron.schedule('0 5 * * 1-5', safeCron(app, 'createMarkets', async () => {
    if (!isTradingDay()) { app.log.info('NYSE holiday — skipping market creation'); return; }
    app.log.info('Running createDailyMarkets cron');
    await createDailyMarkets();
  }), { timezone: 'America/New_York' });

  // Transition accepting → live at 9:30 AM ET (skip holidays, US session only)
  // and capture each instrument's official opening price.
  cron.schedule('30 9 * * 1-5', safeCron(app, 'transitionToLive', async () => {
    if (!isTradingDay()) { app.log.info('NYSE holiday — skipping status transition'); return; }
    app.log.info('Transitioning US markets to live');
    await pool.query(
      `UPDATE trajectory_markets SET status = 'live'
       WHERE trading_date = CURRENT_DATE AND session = 'US' AND status = 'accepting'`
    );
    app.log.info('Capturing open prices');
    await captureOpenPrices();
  }), { timezone: 'America/New_York' });

  // Fetch actual prices every 5 minutes during market hours (REST backstop
  // for the Polygon WebSocket — fills any slot the WS missed).
  cron.schedule('*/5 9-16 * * 1-5', safeCron(app, 'fetchActuals', async () => {
    app.log.info('Running fetchActualPrices cron');
    await fetchActualPrices();
  }), { timezone: 'America/New_York' });

  // Pre-market context (VIX, XLK, premarket volume) at 7:00 AM ET
  cron.schedule('0 7 * * 1-5', safeCron(app, 'preMarketContext', async () => {
    if (!isTradingDay()) { app.log.info('NYSE holiday — skipping pre-market context'); return; }
    app.log.info('Running collectPreMarketContext cron');
    await collectPreMarketContext();
  }), { timezone: 'America/New_York' });

  // Close context (VIX at close, opening gap %) at 4:00 PM ET
  cron.schedule('0 16 * * 1-5', safeCron(app, 'closeContext', async () => {
    if (!isTradingDay()) { app.log.info('NYSE holiday — skipping close context'); return; }
    app.log.info('Running collectCloseContext cron');
    await collectCloseContext();
  }), { timezone: 'America/New_York' });

  // Score markets at 4:30 PM ET every weekday
  cron.schedule('30 16 * * 1-5', safeCron(app, 'scoreMarkets', async () => {
    app.log.info('Running scoreCompletedMarkets cron');
    await scoreCompletedMarkets();
  }), { timezone: 'America/New_York' });

  app.log.info('Cron jobs scheduled (America/New_York)');
}
