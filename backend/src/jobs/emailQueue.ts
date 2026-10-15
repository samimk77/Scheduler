import { Queue } from 'bullmq';
import { bullRedisConnection } from '../config/redis';

export const EMAIL_QUEUE_NAME = 'email-jobs';

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: bullRedisConnection,
  defaultJobOptions: {
    removeOnComplete: {
      count: 1000,  // Keep last 1000 completed jobs
      age: 24 * 3600, // Keep for 24 hours
    },
    removeOnFail: {
      count: 500,   // Keep last 500 failed jobs
      age: 7 * 24 * 3600, // Keep for 7 days
    },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Start at 5s, then 10s, 20s
    },
  },
});

export interface EmailJobData {
  emailJobId: string;
  campaignId: string;
  userId: string;
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string;
  hourlyLimit: number;
  delayBetweenMs: number;
  idempotencyKey: string;
}

console.log(`✅ Email queue '${EMAIL_QUEUE_NAME}' initialized`);
