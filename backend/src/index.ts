import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { agentsRoutes } from './routes/agents.js';
import { trajectoryRoutes } from './routes/trajectory.js';
import { leaderboardRoutes } from './routes/leaderboard.js';

const app = Fastify({ logger: true });

app.register(cors);
app.register(agentsRoutes, { prefix: '/api/agents' });
app.register(trajectoryRoutes, { prefix: '/api/trajectory' });
app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });

const port = Number(process.env.PORT) || 3001;

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
