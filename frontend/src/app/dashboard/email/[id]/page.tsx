'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Star, Archive, Trash2 } from 'lucide-react';
import { emailsApi } from '@/lib/api';
import { EmailJob } from '@/types';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function EmailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [email, setEmail] = useState<EmailJob | null>(null);

  useEffect(() => {
    emailsApi.getById(params.id).then(setEmail).catch(() => toast.error('Email could not be loaded'));
  }, [params.id]);

  if (!email) return <div className="min-h-screen bg-white p-6 text-sm text-gray-400">Loading email…</div>;

  return (
    <main className="min-h-screen bg-white">
      <header className="flex h-12 items-center gap-4 border-b border-gray-100 px-5">
        <button onClick={() => router.push('/dashboard')} aria-label="Back to inbox"><ArrowLeft size={17} /></button>
        <h1 className="min-w-0 flex-1 truncate text-sm text-gray-800">{email.subject}</h1>
        <button aria-label="Star"><Star size={15} className="text-gray-400" /></button>
        <button aria-label="Archive"><Archive size={15} className="text-gray-400" /></button>
        <button aria-label="Delete"><Trash2 size={15} className="text-gray-400" /></button>
      </header>
      <article className="mx-auto max-w-3xl">
        <div className="flex items-start gap-3 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-sm font-semibold text-white">
            {email.sender?.name?.charAt(0) || 'S'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">{email.sender?.name || 'Sender'} <span className="font-normal text-gray-500">&lt;{email.sender?.email}&gt;</span></p>
              <time className="whitespace-nowrap text-xs text-gray-500">{format(new Date(email.sentAt || email.scheduledAt), 'MMM d, h:mm a')}</time>
            </div>
            <p className="mt-1 text-xs text-gray-500">to me · {email.recipients.join(', ')}</p>
            <div className="prose prose-sm mt-6 max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: email.body }} />
            {email.errorMessage && <p className="mt-4 rounded bg-red-50 p-3 text-xs text-red-700">{email.errorMessage}</p>}
          </div>
        </div>
      </article>
    </main>
  );
}
