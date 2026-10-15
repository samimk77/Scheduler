import axios from 'axios';
import { User, Sender, EmailJob, PaginatedResponse, ScheduleEmailPayload, SearchResult } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true,
});

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  getMe: () => api.get<User>('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  googleLoginUrl: `${API_BASE}/api/auth/google`,
};

// ─── Senders ─────────────────────────────────────────────────────────────────
export const sendersApi = {
  list: () => api.get<Sender[]>('/emails/senders').then((r) => r.data),
  createEthereal: () => api.post<Sender & { note: string }>('/emails/senders/ethereal').then((r) => r.data),
  create: (data: Omit<Sender, 'id' | 'createdAt'> & { password: string; username: string }) =>
    api.post<Sender>('/emails/senders', data).then((r) => r.data),
};

// ─── Emails ──────────────────────────────────────────────────────────────────
export const emailsApi = {
  schedule: (payload: ScheduleEmailPayload) => {
    const form = new FormData();
    form.append('senderId', payload.senderId);
    form.append('subject', payload.subject);
    form.append('body', payload.body);
    form.append('scheduledAt', payload.scheduledAt);
    if (payload.hourlyLimit) form.append('hourlyLimit', String(payload.hourlyLimit));
    if (payload.delayBetweenMs) form.append('delayBetweenMs', String(payload.delayBetweenMs));
    if (payload.csvFile) {
      form.append('csvFile', payload.csvFile);
    } else {
      form.append('recipients', JSON.stringify(payload.recipients));
    }
    return api.post<{ id: string; status: string; recipientCount: number }>('/emails/schedule', form).then((r) => r.data);
  },

  getScheduled: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<EmailJob>>('/emails/scheduled', { params: { page, limit } }).then((r) => r.data),

  getSent: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<EmailJob>>('/emails/sent', { params: { page, limit } }).then((r) => r.data),

  getById: (id: string) =>
    api.get<EmailJob>(`/emails/${id}`).then((r) => r.data),
};

// ─── Search ──────────────────────────────────────────────────────────────────
export const searchApi = {
  search: (q: string, status?: string, from = 0, size = 20) =>
    api.get<SearchResult>('/search', { params: { q, status, from, size } }).then((r) => r.data),
};

// ─── Slack ───────────────────────────────────────────────────────────────────
export const slackApi = {
  connectUrl: `${API_BASE}/api/slack/connect`,
  status: () => api.get<{ connected: boolean; teamId: string | null }>('/slack/status').then((r) => r.data),
  disconnect: () => api.delete('/slack/disconnect').then((r) => r.data),
};

export default api;
