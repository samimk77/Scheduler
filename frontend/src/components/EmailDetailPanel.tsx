'use client';

import { EmailJob, EmailStatus } from '@/types';
import { format } from 'date-fns';
import { X, ArrowLeft, User } from 'lucide-react';

interface EmailDetailPanelProps {
  email: EmailJob | null;
  onClose: () => void;
}

const STATUS_LABELS: Record<EmailStatus, string> = {
  SCHEDULED: 'Scheduled',
  PROCESSING: 'Sending...',
  SENT: 'Sent',
  FAILED: 'Failed',
  RATE_LIMITED: 'Rate Limited',
};

const STATUS_COLORS: Record<EmailStatus, string> = {
  SCHEDULED: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  SENT: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  RATE_LIMITED: 'bg-gray-100 text-gray-800',
};

export default function EmailDetailPanel({ email, onClose }: EmailDetailPanelProps) {
  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-300">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <User size={28} className="text-gray-300" />
          </div>
          <p className="text-sm">Select an email to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100">
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
          <ArrowLeft size={18} />
        </button>
        <h2 className="flex-1 text-base font-semibold text-gray-900 truncate">{email.subject}</h2>
        <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_COLORS[email.status]}`}>
          {STATUS_LABELS[email.status]}
        </span>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 ml-2">
          <X size={16} />
        </button>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-4 border-b border-gray-50">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {email.sender?.name?.charAt(0) || 'S'}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">{email.sender?.name || 'Unknown Sender'}</p>
            <p className="text-xs text-gray-500">{email.sender?.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              to {email.recipients.slice(0, 3).join(', ')}
              {email.recipients.length > 3 && ` +${email.recipients.length - 3} more`}
            </p>
          </div>
          <div className="text-xs text-gray-400">
            {email.sentAt
              ? format(new Date(email.sentAt), 'MMM d, h:mm a')
              : format(new Date(email.scheduledAt), 'MMM d, h:mm a')}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-gray-400">Scheduled at</span>
          <p className="font-medium text-gray-700">{format(new Date(email.scheduledAt), 'PPp')}</p>
        </div>
        {email.sentAt && (
          <div>
            <span className="text-gray-400">Sent at</span>
            <p className="font-medium text-gray-700">{format(new Date(email.sentAt), 'PPp')}</p>
          </div>
        )}
        <div>
          <span className="text-gray-400">Recipients</span>
          <p className="font-medium text-gray-700">{email.recipients.length}</p>
        </div>
        <div>
          <span className="text-gray-400">Hourly limit</span>
          <p className="font-medium text-gray-700">{email.hourlyLimit}/hr</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-5">
        <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: email.body }} />
      </div>

      {email.errorMessage && (
        <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <span className="font-medium">Error: </span>{email.errorMessage}
        </div>
      )}

      <div className="px-6 pb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">All Recipients</h3>
        <div className="flex flex-wrap gap-1.5">
          {email.recipients.map((r) => (
            <span key={r} className="email-tag text-xs">{r}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
