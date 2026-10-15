'use client';

import { EmailJob, EmailStatus } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Inbox, Star } from 'lucide-react';

interface EmailListPanelProps {
  emails: EmailJob[];
  loading: boolean;
  tab: 'scheduled' | 'sent';
  searchQuery?: string;
  selectedId?: string;
  onSelect: (email: EmailJob) => void;
}

const STATUS_COLORS: Record<EmailStatus, string> = {
  SCHEDULED: 'badge-scheduled',
  PROCESSING: 'badge-processing',
  SENT: 'badge-sent',
  FAILED: 'badge-failed',
  RATE_LIMITED: 'badge-rate_limited',
};

const STATUS_LABELS: Record<EmailStatus, string> = {
  SCHEDULED: 'Scheduled',
  PROCESSING: 'Sending...',
  SENT: 'Sent',
  FAILED: 'Failed',
  RATE_LIMITED: 'Rate Limited',
};

function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function EmailListPanel({
  emails, loading, tab, searchQuery = '', selectedId, onSelect,
}: EmailListPanelProps) {
  if (loading) {
    return (
      <div className="w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!emails.length) {
    return (
      <div className="w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400 p-8 text-center">
          <Inbox size={40} strokeWidth={1} />
          <p className="text-sm font-medium">{searchQuery ? 'No matching emails' : `No ${tab} emails`}</p>
          <p className="text-sm text-gray-400">
            {searchQuery
              ? `No emails matched “${searchQuery}”. Try another search.`
              : tab === 'scheduled'
              ? 'Schedule your first email using the Compose button.'
              : 'Sent emails will appear here once delivered.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {emails.map((email) => {
        const timeLabel = tab === 'scheduled'
          ? `Scheduled ${formatDistanceToNow(new Date(email.scheduledAt), { addSuffix: true })}`
          : email.sentAt
            ? `Sent ${formatDistanceToNow(new Date(email.sentAt), { addSuffix: true })}`
            : '';

        const firstRecipient = email.recipients[0] || '';
        const extraCount = email.recipients.length - 1;

        return (
          <div
            key={email.id}
            onClick={() => onSelect(email)}
            className={`group flex min-h-12 items-center gap-3 px-4 cursor-pointer border-b border-gray-100 hover:shadow-sm transition-colors ${
              selectedId === email.id ? 'bg-emerald-50' : 'bg-white'
            }`}
          >
            {/* Recipient row */}
            <span className="w-[min(24%,260px)] flex-shrink-0 truncate text-sm font-medium text-gray-800">To: {firstRecipient}{extraCount > 0 ? ` +${extraCount}` : ''}</span>
            <StatusBadge status={email.status} />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
              <span className="font-medium">{email.subject}</span>
              <span className="text-gray-400"> - {email.body.replace(/<[^>]+>/g, '').slice(0, 110)}</span>
            </span>
            <span className="w-[190px] flex-shrink-0 truncate text-xs text-gray-500">{timeLabel}</span>
            <Star size={13} className="text-gray-300 group-hover:text-amber-400" />
          </div>
        );
      })}
    </div>
  );
}
