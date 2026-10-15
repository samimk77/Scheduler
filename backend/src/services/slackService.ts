import { WebClient } from '@slack/web-api';
import { prisma } from '../config/database';

/**
 * Sends a Slack notification when a sender's hourly rate limit is hit.
 * Gracefully no-ops if the user has not connected Slack.
 */
export async function notifySlackRateLimit(
  userId: string,
  senderId: string,
  senderEmail: string,
  currentCount: number,
  maxPerHour: number
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user?.slackToken && !user?.slackWebhookUrl) {
      console.log(`ℹ️ No Slack connection for user ${userId}, skipping notification`);
      return;
    }

    const message = {
      text: `🚨 Rate limit reached for ${senderEmail}: ${currentCount}/${maxPerHour} emails per hour. Affected email jobs are rescheduled for the next hour.`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 Email Rate Limit Reached' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Sender:*\n${senderEmail}` },
            { type: 'mrkdwn', text: `*Limit:*\n${currentCount}/${maxPerHour} emails/hr` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '⏰ Affected jobs have been *rescheduled to the next hour window* — no emails were dropped.',
          },
        },
      ],
    };

    if (user.slackWebhookUrl) {
      const response = await fetch(user.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      if (!response.ok) throw new Error(`Slack webhook returned HTTP ${response.status}`);
    } else if (user.slackToken && user.slackChannelId) {
      const client = new WebClient(user.slackToken);
      await client.chat.postMessage({ channel: user.slackChannelId, ...message });
    } else {
      throw new Error('Slack is connected but no notification channel is configured');
    }

    console.log(`✅ Slack rate-limit notification sent for sender ${senderEmail}`);
  } catch (err) {
    console.error('❌ Failed to send Slack notification:', (err as Error).message);
    // Non-fatal — don't crash the worker
  }
}

/**
 * Exchange Slack OAuth code for access token and store it.
 */
export async function exchangeSlackCode(
  userId: string,
  code: string
): Promise<void> {
  const client = new WebClient();

  const result = await client.oauth.v2.access({
    client_id: process.env.SLACK_CLIENT_ID!,
    client_secret: process.env.SLACK_CLIENT_SECRET!,
    code,
    redirect_uri: process.env.SLACK_REDIRECT_URI!,
  });

  if (!result.ok || !result.access_token) {
    throw new Error('Slack OAuth failed: ' + result.error);
  }

  const webhook = result.incoming_webhook as { channel?: string; channel_id?: string; url?: string } | undefined;
  const authedUser = result.authed_user as { access_token?: string } | undefined;
  await prisma.user.update({
    where: { id: userId },
    data: {
      slackToken: result.access_token || authedUser?.access_token || null,
      slackTeamId: result.team?.id || null,
      slackChannelId: webhook?.channel_id || webhook?.channel || null,
      slackWebhookUrl: webhook?.url || null,
    },
  });

  console.log(`✅ Slack connected for user ${userId}`);
}

/**
 * Disconnect Slack for a user.
 */
export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      slackToken: null,
      slackTeamId: null,
      slackChannelId: null,
      slackWebhookUrl: null,
    },
  });
}
