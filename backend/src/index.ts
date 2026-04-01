import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { runMigrations } from './db.js';
import { agentsRoutes } from './routes/agents.js';
import { trajectoryRoutes } from './routes/trajectory.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { startCrons } from './crons/index.js';
import { startPolygonStream } from './services/polygonStream.js';

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors);

  app.register(agentsRoutes, { prefix: '/v1/agents' });
  app.register(trajectoryRoutes, { prefix: '/v1/trajectory' });
  app.register(leaderboardRoutes, { prefix: '/v1/leaderboard' });

  await runMigrations();
  startCrons();
  startPolygonStream();

  const port = Number(process.env.PORT) || 3001;
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
