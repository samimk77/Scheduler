import nodemailer from 'nodemailer';
import * as ethereal from 'nodemailer';

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  smtpConfig: SmtpConfig;
}

// Cache transports by sender to avoid recreating them
const transportCache = new Map<string, nodemailer.Transporter>();

function getTransporter(config: SmtpConfig): nodemailer.Transporter {
  const cacheKey = `${config.username}@${config.host}:${config.port}`;
  if (transportCache.has(cacheKey)) {
    return transportCache.get(cacheKey)!;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false,
    auth: {
      user: config.username,
      pass: config.password,
    },
  });

  transportCache.set(cacheKey, transporter);
  return transporter;
}

export async function sendEmail(options: SendEmailOptions): Promise<string> {
  const transporter = getTransporter(options.smtpConfig);

  const info = await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  console.log(`📧 Email sent via Ethereal: ${nodemailer.getTestMessageUrl(info)}`);
  return info.messageId;
}

export async function createEtherealAccount(): Promise<{
  host: string;
  port: number;
  username: string;
  password: string;
  email: string;
  name: string;
}> {
  const testAccount = await ethereal.createTestAccount();
  return {
    host: 'smtp.ethereal.email',
    port: 587,
    username: testAccount.user,
    password: testAccount.pass,
    email: testAccount.user,
    name: testAccount.web || 'Ethereal Sender',
  };
}
