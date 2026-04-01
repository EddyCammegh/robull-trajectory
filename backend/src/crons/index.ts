import cron from 'node-cron';
import { createDailyMarkets } from './createMarkets.js';
import { fetchActualPrices } from './fetchActuals.js';
import { scoreCompletedMarkets } from './scoreMarkets.js';
import { pool } from '../db.js';

export function startCrons(): void {
  // Create markets at 9:00 AM ET every weekday
  cron.schedule('0 9 * * 1-5', async () => {
    console.log('Running createDailyMarkets cron');
    await createDailyMarkets();
  });

  // Transition accepting → live at 9:30 AM ET
  cron.schedule('30 9 * * 1-5', async () => {
    console.log('Transitioning markets to live');
    await pool.query(
      `UPDATE trajectory_markets SET status = 'live'
       WHERE trading_date = CURRENT_DATE AND status = 'accepting'`
    );
  });

  // Fetch actual prices every hour during market hours
  cron.schedule('5 10-16 * * 1-5', async () => {
    console.log('Running fetchActualPrices cron');
    await fetchActualPrices();
  });

  // Score markets at 4:30 PM ET every weekday
  cron.schedule('30 16 * * 1-5', async () => {
    console.log('Running scoreCompletedMarkets cron');
    await scoreCompletedMarkets();
  });

  console.log('Cron jobs scheduled');
}
