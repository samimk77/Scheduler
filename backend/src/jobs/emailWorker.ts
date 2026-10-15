import { Worker, Job, DelayedError } from 'bullmq';
import { bullRedisConnection } from '../config/redis';
import { EMAIL_QUEUE_NAME, EmailJobData } from './emailQueue';
import { prisma } from '../config/database';
import { sendEmail } from '../services/emailService';
import { checkAndIncrementRateLimit } from '../services/rateLimitService';
import { indexEmailJob } from '../services/elasticsearchService';
import { notifySlackRateLimit } from '../services/slackService';
import { emailQueue } from './emailQueue';
import { redisClient } from '../config/redis';

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000');

async function waitForSenderSlot(senderId: string, requestedDelayMs: number): Promise<void> {
  const minDelay = Math.max(MIN_DELAY_MS, requestedDelayMs);
  const key = `sender_next_send:${senderId}`;
  // Reserve sequential slots atomically so concurrent workers for the same
  // sender cannot deliver at the same instant.
  const waitMs = Number(await redisClient.eval(
    `local now = tonumber(ARGV[1])\n` +
      `local interval = math.max(tonumber(ARGV[2]), 1)\n` +
    `local nextAt = tonumber(redis.call('GET', KEYS[1]) or '0')\n` +
    `local slot = math.max(now, nextAt)\n` +
    `redis.call('SET', KEYS[1], slot + interval, 'PX', interval * 2)\n` +
    `return math.max(0, slot - now)`,
    1, key, Date.now(), minDelay
  ));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const {
    emailJobId,
    campaignId,
    userId,
    senderId,
    recipients,
    subject,
    body,
    hourlyLimit,
    delayBetweenMs,
    idempotencyKey,
  } = job.data;

  console.log(`📧 Processing job ${job.id} for emailJob ${emailJobId}`);

  // Idempotency check — prevent duplicate sends
  const existingJob = await prisma.emailJob.findUnique({
    where: { idempotencyKey },
    include: { sender: true, user: true },
  });

  if (!existingJob) {
    console.warn(`⚠️ EmailJob ${emailJobId} not found in DB, skipping`);
    return;
  }

  if (existingJob.status === 'SENT') {
    console.log(`✅ Job ${emailJobId} already sent (idempotency), skipping`);
    return;
  }

  const effectiveLimit = Math.min(hourlyLimit, Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50'));

  try {
    // Send to each recipient with delay between sends
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      await waitForSenderSlot(senderId, delayBetweenMs);

      const { allowed, resetAt, currentCount } = await checkAndIncrementRateLimit(senderId, effectiveLimit);
      if (!allowed) {
        await notifySlackRateLimit(userId, senderId, existingJob.sender.email, currentCount, effectiveLimit);
        // Preserve this job's identity. Reusing the active BullMQ id can be
        // rejected, so change this job's delay in place.
        const delayUntilReset = Math.max(1000, resetAt - Date.now());
        await job.moveToDelayed(Date.now() + delayUntilReset, job.token!);
        const nextScheduledAt = new Date(resetAt);
        await prisma.emailJob.update({
          where: { id: emailJobId },
          data: { status: 'RATE_LIMITED', scheduledAt: nextScheduledAt },
        });
        await indexEmailJob({
          id: emailJobId,
          userId,
          senderId,
          senderEmail: existingJob.sender.email,
          recipients,
          subject,
          body,
          status: 'RATE_LIMITED',
          scheduledAt: nextScheduledAt.toISOString(),
          createdAt: existingJob.createdAt.toISOString(),
        });
        throw new DelayedError();
      }

      await prisma.emailJob.update({ where: { id: emailJobId }, data: { status: 'PROCESSING' } });

      await sendEmail({
        from: `${existingJob.sender.name} <${existingJob.sender.email}>`,
        to: recipient,
        subject,
        html: body,
        smtpConfig: {
          host: existingJob.sender.host,
          port: existingJob.sender.port,
          username: existingJob.sender.username,
          password: existingJob.sender.password,
        },
      });

      console.log(`📨 Sent to ${recipient} (${i + 1}/${recipients.length})`);

      // Update progress
      await job.updateProgress(Math.round(((i + 1) / recipients.length) * 100));
    }

    // Mark as SENT
    const sentAt = new Date();
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'SENT', sentAt },
    });

    // Index in Elasticsearch
    await indexEmailJob({
      id: emailJobId,
      userId,
      senderId,
      senderEmail: existingJob.sender.email,
      recipients,
      subject,
      body,
      status: 'SENT',
      scheduledAt: existingJob.scheduledAt.toISOString(),
      sentAt: sentAt.toISOString(),
      createdAt: existingJob.createdAt.toISOString(),
    });

    console.log(`✅ Job ${emailJobId} completed — campaign ${campaignId}`);
  } catch (err) {
    // BullMQ uses DelayedError as control flow after moveToDelayed(). It is
    // not a delivery failure: keep the DB/Elasticsearch RATE_LIMITED state
    // and let BullMQ resume this same recipient job at the reset time.
    if (err instanceof DelayedError) {
      throw err;
    }

    const errorMsg = (err as Error).message;
    console.error(`❌ Job ${emailJobId} failed:`, errorMsg);

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'FAILED', errorMessage: errorMsg },
    });

    // Index failed status
    await indexEmailJob({
      id: emailJobId,
      userId,
      senderId,
      senderEmail: existingJob.sender.email,
      recipients,
      subject,
      body,
      status: 'FAILED',
      scheduledAt: existingJob.scheduledAt.toISOString(),
      sentAt: undefined,
      createdAt: existingJob.createdAt.toISOString(),
    });

    throw err; // Let BullMQ handle retry
  }
}

export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    processEmailJob,
    {
      connection: bullRedisConnection,
      concurrency: WORKER_CONCURRENCY,
      // BullMQ limiter: max 200 jobs per hour globally
      limiter: {
        max: parseInt(process.env.MAX_EMAILS_PER_HOUR || '200'),
        duration: 3600000, // 1 hour in ms
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`✅ Worker completed job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Worker failed job ${job?.id}:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ Worker error:', err);
  });

  console.log(`🔧 Email worker started (concurrency: ${WORKER_CONCURRENCY})`);
  return worker;
}

export async function requeuePersistedEmailJobs(): Promise<number> {
  // MySQL is the durable source of truth if Redis storage is ever recreated.
  // Existing BullMQ job IDs make this safe to run after every restart.
  const pending = await prisma.emailJob.findMany({
    where: { status: { in: ['SCHEDULED', 'RATE_LIMITED'] } },
    include: { sender: true },
  });
  let queued = 0;
  for (const email of pending) {
    const recipients = email.recipients as string[];
    const recipient = recipients[0];
    if (!recipient) continue;
    const data: EmailJobData = {
      emailJobId: email.id,
      campaignId: email.id,
      userId: email.userId,
      senderId: email.senderId,
      recipients: [recipient],
      subject: email.subject,
      body: email.body,
      scheduledAt: email.scheduledAt.toISOString(),
      hourlyLimit: email.hourlyLimit,
      delayBetweenMs: email.delayBetweenMs,
      idempotencyKey: email.idempotencyKey,
    };
    const existing = await emailQueue.getJob(email.idempotencyKey);
    if (!existing) {
      await emailQueue.add(`email-${email.id}`, data, {
        jobId: email.idempotencyKey,
        delay: Math.max(0, email.scheduledAt.getTime() - Date.now()),
      });
      queued++;
    }
  }
  return queued;
}
