// API Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  slackConnected: boolean;
  slackTeamId: string | null;
}

export interface Sender {
  id: string;
  email: string;
  name: string;
  host: string;
  port: number;
  createdAt: string;
}

export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RATE_LIMITED';

export interface EmailJob {
  id: string;
  userId: string;
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  bullJobId: string | null;
  errorMessage: string | null;
  hourlyLimit: number;
  delayBetweenMs: number;
  createdAt: string;
  updatedAt: string;
  sender?: { email: string; name: string };
}

export interface PaginatedResponse<T> {
  emails: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ScheduleEmailPayload {
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string;
  hourlyLimit?: number;
  delayBetweenMs?: number;
  csvFile?: File;
}

export interface SearchResult {
  hits: EmailJob[];
  total: number;
}
