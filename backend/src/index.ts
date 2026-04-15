import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { runMigrations } from './db.js';
import { agentsRoutes } from './routes/agents.js';
import { trajectoryRoutes } from './routes/trajectory.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { statusRoutes } from './routes/status.js';
import { startCrons } from './crons/index.js';
import { startPolygonStream } from './services/polygonStream.js';

const app = Fastify({ logger: true, trustProxy: true });

// ── In-memory rate limiter ──

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

// Clean up expired buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 5 * 60_000);

function checkRate(key: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  let bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  return { allowed: true, remaining: maxRequests - bucket.count, retryAfterMs: 0 };
}

async function main() {
  await app.register(cors);

  // Generic 500 for any uncaught / rethrown error. Prevents PG error messages,
  // stack traces, or schema details from leaking to clients.
  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    reply.status(500).send({ error: 'Internal error' });
  });

  // Global rate limit: 100 requests per minute per IP
  app.addHook('onRequest', async (request, reply) => {
    const ip = request.ip;

    const path = request.url.split('?')[0];

    // Stricter limit on register: 5 per hour
    if (path === '/v1/agents/register' && request.method === 'POST') {
      const result = checkRate(`register:${ip}`, 5, 60 * 60_000);
      if (!result.allowed) {
        reply.status(429).send({
          error: 'Too many registration attempts. Limit: 5 per hour.',
          retryAfterMs: result.retryAfterMs,
        });
        return;
      }
    }

    // Enumeration guard on agent-name checks: 30 req/min per IP.
    if (path.startsWith('/v1/agents/check/') && request.method === 'GET') {
      const result = checkRate(`check:${ip}`, 30, 60_000);
      if (!result.allowed) {
        reply.status(429).send({
          error: 'Too many agent-name lookups. Limit: 30 per minute.',
          retryAfterMs: result.retryAfterMs,
        });
        return;
      }
    }

    // Global limit
    const result = checkRate(`global:${ip}`, 100, 60_000);
    reply.header('X-RateLimit-Remaining', result.remaining);
    if (!result.allowed) {
      reply.status(429).send({
        error: 'Rate limit exceeded. Limit: 100 requests per minute.',
        retryAfterMs: result.retryAfterMs,
      });
    }
  });

  await runMigrations();

  app.register(agentsRoutes, { prefix: '/v1/agents' });
  app.register(trajectoryRoutes, { prefix: '/v1/trajectory' });
  app.register(leaderboardRoutes, { prefix: '/v1/leaderboard' });
  app.register(statusRoutes, { prefix: '/v1/status' });

  startCrons(app);
  startPolygonStream();

  // Process-level safety nets. Unhandled rejections inside cron callbacks or
  // the Polygon WS handler are now wrapped, but these catch anything we miss
  // (incl. DB driver edge cases). We log and keep the process alive on
  // rejections; on an uncaught *exception* we log and exit so the supervisor
  // restarts us cleanly.
  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    app.log.error({ err }, 'uncaughtException');
    process.exit(1);
  });

  const port = Number(process.env.PORT) || 3001;
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
