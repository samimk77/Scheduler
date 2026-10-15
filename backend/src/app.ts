import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import passport from 'passport';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { prisma } from './config/database';
import { emailQueue } from './jobs/emailQueue';
import { requeuePersistedEmailJobs, startEmailWorker } from './jobs/emailWorker';
import { setupPassport } from './config/passport';

import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import slackRoutes from './routes/slack';
import searchRoutes from './routes/search';

const app = express();
const PORT = Number(process.env.PORT || 4000);

// Security middleware
app.use(helmet({ crossOriginEmbedderPolicy: false }));
// OAuth callback URLs contain short-lived authorization codes. Never include
// query strings in access logs so those codes don't leak into terminal logs.
morgan.token('url-path', (req) => (req.url || '').split('?')[0]);
app.use(morgan(':method :url-path :status :response-time ms - :res[content-length]'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Passport
setupPassport();
app.use(passport.initialize());
app.use(passport.session());

// Bull Board Dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue) as any],
  serverAdapter,
});
app.use('/admin/queues', serverAdapter.getRouter());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/search', searchRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

async function main() {
  // Connect to DB
  await prisma.$connect();
  console.log('✅ Database connected');

  // Setup Elasticsearch index
  const { setupElasticsearch } = await import('./config/elasticsearch');
  const { backfillEmailSearchIndex } = await import('./services/elasticsearchService');
  await setupElasticsearch();
  try {
    const indexed = await backfillEmailSearchIndex();
    console.log(`Reconciled ${indexed} email records into Elasticsearch`);
  } catch (err) {
    console.error('Elasticsearch backfill failed; search may be incomplete until indexing recovers:', (err as Error).message);
  }

  const recovered = await requeuePersistedEmailJobs();
  console.log(`Recovered ${recovered} scheduled emails from MySQL`);
  const worker = startEmailWorker();

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Bull Board at http://localhost:${PORT}/admin/queues`);
  });

  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    server.close();
    await worker.close();
    await emailQueue.close();
    const { bullRedisConnection, redisClient } = await import('./config/redis');
    await Promise.all([bullRedisConnection.quit(), redisClient.quit(), prisma.$disconnect()]);
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export default app;
