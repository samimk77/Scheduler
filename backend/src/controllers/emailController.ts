import { Request, Response } from 'express';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { emailQueue } from '../jobs/emailQueue';
import { createEtherealAccount } from '../services/emailService';
import { indexEmailJob } from '../services/elasticsearchService';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

// ─── Senders ───────────────────────────────────────────────────────────────

export async function getSenders(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;
  const senders = await prisma.sender.findMany({
    where: { userId: user.id },
    select: { id: true, email: true, name: true, host: true, port: true, createdAt: true },
  });
  res.json(senders);
}

export async function createSender(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;
  const { email, name, host, port, username, password } = req.body;

  if (!email || !name || !host || !username || !password) {
    res.status(400).json({ error: 'Missing required sender fields' });
    return;
  }

  const sender = await prisma.sender.create({
    data: {
      userId: user.id,
      email,
      name,
      host,
      port: port ? parseInt(port) : 587,
      username,
      password,
    },
  });

  res.status(201).json(sender);
}

export async function createEtherealSender(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;

  const account = await createEtherealAccount();
  const sender = await prisma.sender.create({
    data: {
      userId: user.id,
      email: account.email,
      name: account.name || 'Ethereal Test Sender',
      host: account.host,
      port: account.port,
      username: account.username,
      password: account.password,
    },
  });

  res.status(201).json({
    ...sender,
    previewUrl: `https://ethereal.email/login`,
    note: `Login at ethereal.email with: ${account.username} / ${account.password}`,
  });
}

// ─── Email Scheduling ──────────────────────────────────────────────────────

export async function scheduleEmail(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;

  const {
    senderId,
    recipients: recipientsJson,
    subject,
    body,
    scheduledAt,
    hourlyLimit,
    delayBetweenMs,
  } = req.body;

  if (!senderId || !subject || !body || !scheduledAt) {
    res.status(400).json({ error: 'Missing required fields: senderId, subject, body, scheduledAt' });
    return;
  }

  // Verify sender belongs to user
  const sender = await prisma.sender.findFirst({
    where: { id: senderId, userId: user.id },
  });
  if (!sender) {
    res.status(404).json({ error: 'Sender not found' });
    return;
  }

  // Parse recipients — from JSON field or CSV upload
  let recipients: string[] = [];

  if (req.file) {
    // CSV file uploaded
    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, { skip_empty_lines: true, trim: true }) as string[][];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const row of records) {
      for (const cell of row) {
        if (emailRegex.test(cell)) recipients.push(cell);
      }
    }
  } else if (recipientsJson) {
    try {
      recipients = typeof recipientsJson === 'string'
        ? JSON.parse(recipientsJson)
        : recipientsJson;
    } catch {
      res.status(400).json({ error: 'Invalid recipients format' });
      return;
    }
  }

  if (!recipients.length) {
    res.status(400).json({ error: 'No valid recipient emails found' });
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  recipients = recipients.filter((email) => emailRegex.test(email));
  if (!recipients.length) {
    res.status(400).json({ error: 'No valid recipient emails found' });
    return;
  }

  const scheduledDate = new Date(scheduledAt);
  if (!Number.isFinite(scheduledDate.getTime())) {
    res.status(400).json({ error: 'Invalid scheduledAt date' });
    return;
  }
  recipients = [...new Set(recipients.map((email) => email.trim().toLowerCase()))];
  const requestedHourlyLimit = Number(hourlyLimit ?? 50);
  const requestedDelay = Number(delayBetweenMs ?? 2000);
  if (!Number.isInteger(requestedHourlyLimit) || requestedHourlyLimit < 1 ||
      !Number.isInteger(requestedDelay) || requestedDelay < 0) {
    res.status(400).json({ error: 'hourlyLimit must be positive and delayBetweenMs must be non-negative integers' });
    return;
  }
  const delay = Math.max(0, scheduledDate.getTime() - Date.now());
  const campaignId = uuidv4();
  const emailJobs = await prisma.$transaction(recipients.map((recipient) => prisma.emailJob.create({
    data: {
      userId: user.id,
      senderId,
      recipients: [recipient],
      subject,
      body,
      scheduledAt: scheduledDate,
      status: 'SCHEDULED',
      idempotencyKey: uuidv4(),
      hourlyLimit: requestedHourlyLimit,
      delayBetweenMs: requestedDelay,
    },
  })));

  // One durable queue job per recipient makes hourly reservations match actual
  // SMTP sends and gives every send its own retry/idempotency record.
  await Promise.all(emailJobs.map(async (emailJob, index) => {
    const idempotencyKey = emailJob.idempotencyKey;
    const bullJob = await emailQueue.add(`email-${emailJob.id}`, {
      emailJobId: emailJob.id,
      campaignId,
      userId: user.id,
      senderId,
      recipients: [recipients[index]],
      subject,
      body,
      scheduledAt: scheduledDate.toISOString(),
      hourlyLimit: emailJob.hourlyLimit,
      delayBetweenMs: emailJob.delayBetweenMs,
      idempotencyKey,
    }, { delay: delay + index * requestedDelay, jobId: idempotencyKey });
    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { bullJobId: bullJob.id, scheduledAt: new Date(scheduledDate.getTime() + index * requestedDelay) },
    });
    await indexEmailJob({
      id: emailJob.id, userId: user.id, senderId, senderEmail: sender.email,
      recipients: [recipients[index]], subject, body, status: 'SCHEDULED',
      scheduledAt: new Date(scheduledDate.getTime() + index * requestedDelay).toISOString(),
      createdAt: emailJob.createdAt.toISOString(),
    });
  }));

  res.status(201).json({
    id: campaignId,
    status: 'SCHEDULED',
    scheduledAt: scheduledDate.toISOString(),
    recipientCount: recipients.length,
    jobIds: emailJobs.map((j) => j.id),
    message: `Email scheduled for ${recipients.length} recipients at ${scheduledDate.toISOString()}`,
  });
}

export async function getScheduledEmails(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;
  const page = parseInt(req.query.page as string || '1');
  const limit = parseInt(req.query.limit as string || '20');
  const skip = (page - 1) * limit;

  const [emails, total] = await Promise.all([
    prisma.emailJob.findMany({
      where: {
        userId: user.id,
        status: { in: ['SCHEDULED', 'PROCESSING', 'RATE_LIMITED'] },
      },
      include: {
        sender: { select: { email: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.emailJob.count({
      where: {
        userId: user.id,
        status: { in: ['SCHEDULED', 'PROCESSING', 'RATE_LIMITED'] },
      },
    }),
  ]);

  res.json({ emails, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function getSentEmails(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;
  const page = parseInt(req.query.page as string || '1');
  const limit = parseInt(req.query.limit as string || '20');
  const skip = (page - 1) * limit;

  const [emails, total] = await Promise.all([
    prisma.emailJob.findMany({
      where: {
        userId: user.id,
        status: { in: ['SENT', 'FAILED'] },
      },
      include: {
        sender: { select: { email: true, name: true } },
      },
      orderBy: { sentAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.emailJob.count({
      where: {
        userId: user.id,
        status: { in: ['SENT', 'FAILED'] },
      },
    }),
  ]);

  res.json({ emails, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function getEmailById(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;
  const { id } = req.params;

  const email = await prisma.emailJob.findFirst({
    where: { id, userId: user.id },
    include: { sender: { select: { email: true, name: true } } },
  });

  if (!email) {
    res.status(404).json({ error: 'Email job not found' });
    return;
  }

  res.json(email);
}
