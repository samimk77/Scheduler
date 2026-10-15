import { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { exchangeSlackCode, disconnectSlack as disconnectSlackService } from '../services/slackService';
import { prisma } from '../config/database';

interface AuthUser { id: string; slackToken?: string | null; slackTeamId?: string | null; }

export async function connectSlack(req: Request, res: Response): Promise<void> {
  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET || !process.env.SLACK_REDIRECT_URI) {
    res.status(503).json({ error: 'Slack OAuth is not configured. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_REDIRECT_URI.' });
    return;
  }
  const state = randomBytes(24).toString('hex');
  (req.session as typeof req.session & { slackOAuthState?: string }).slackOAuthState = state;
  await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));

  const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
  slackAuthUrl.searchParams.set('client_id', process.env.SLACK_CLIENT_ID!);
  slackAuthUrl.searchParams.set('scope', 'chat:write,incoming-webhook');
  slackAuthUrl.searchParams.set('redirect_uri', process.env.SLACK_REDIRECT_URI!);
  slackAuthUrl.searchParams.set('state', state);
  res.redirect(slackAuthUrl.toString());
}

export async function slackCallback(req: Request, res: Response): Promise<void> {
  const { code, error } = req.query;
  const user = req.user as AuthUser;
  const session = req.session as typeof req.session & { slackOAuthState?: string };
  const expectedState = session.slackOAuthState;
  const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
  delete session.slackOAuthState;

  if (!expectedState || !returnedState || expectedState.length !== returnedState.length ||
      !timingSafeEqual(Buffer.from(expectedState), Buffer.from(returnedState))) {
    await new Promise<void>((resolve) => req.session.save(() => resolve()));
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?slack=error`);
    return;
  }

  if (error || !code) {
    await new Promise<void>((resolve) => req.session.save(() => resolve()));
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?slack=error`);
    return;
  }

  try {
    await exchangeSlackCode(user.id, code as string);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err) {
    console.error('Slack callback error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?slack=error`);
  }
}

export async function disconnectSlack(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;
  await disconnectSlackService(user.id);
  res.json({ message: 'Slack disconnected' });
}

export async function getSlackStatus(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;
  const saved = await prisma.user.findUnique({ where: { id: user.id }, select: { slackToken: true, slackTeamId: true } });
  res.json({
    connected: !!saved?.slackToken,
    teamId: saved?.slackTeamId || null,
  });
}
