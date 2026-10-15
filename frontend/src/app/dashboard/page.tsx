'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, emailsApi, slackApi, sendersApi, searchApi } from '@/lib/api';
import { User, EmailJob, Sender } from '@/types';
import toast from 'react-hot-toast';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import EmailListPanel from '@/components/EmailListPanel';
import ComposeModal from '@/components/ComposeModal';

type Tab = 'scheduled' | 'sent';

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('scheduled');
  const [emails, setEmails] = useState<EmailJob[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Auth check
  useEffect(() => {
    authApi.getMe()
      .then((u) => setUser(u))
      .catch(() => router.push('/'))
      .finally(() => setLoading(false));
  }, [router]);

  // Handle provider return parameters without forcing a client-only route render.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slack = params.get('slack');
    if (slack === 'connected') toast.success('Slack connected!');
    if (slack === 'error') toast.error('Slack connection failed');
  }, []);

  const fetchEmails = useCallback(async () => {
    setEmailsLoading(true);
    try {
      const query = searchQuery.trim();
      if (query) {
        const statuses = tab === 'scheduled'
          ? 'SCHEDULED,PROCESSING,RATE_LIMITED'
          : 'SENT,FAILED';
        const data = await searchApi.search(query, statuses, 0, 100);
        setEmails(data.hits);
      } else if (tab === 'scheduled') {
        const data = await emailsApi.getScheduled();
        setEmails(data.emails);
        setScheduledCount(data.total);
      } else {
        const data = await emailsApi.getSent();
        setEmails(data.emails);
        setSentCount(data.total);
      }
    } catch {
      toast.error('Failed to load emails');
    } finally {
      setEmailsLoading(false);
    }
  }, [tab, searchQuery]);

  useEffect(() => {
    const delay = searchQuery.trim() ? 300 : 0;
    const timer = window.setTimeout(fetchEmails, delay);
    return () => window.clearTimeout(timer);
  }, [fetchEmails, searchQuery]);

  useEffect(() => {
    window.addEventListener('email-refresh', fetchEmails);
    return () => window.removeEventListener('email-refresh', fetchEmails);
  }, [fetchEmails]);

  // Load senders
  useEffect(() => {
    sendersApi.list().then(setSenders).catch(() => {});
  }, []);

  // Poll for live updates every 10s
  useEffect(() => {
    const id = setInterval(fetchEmails, 10000);
    return () => clearInterval(id);
  }, [fetchEmails]);

  const handleLogout = async () => {
    await authApi.logout();
    router.push('/');
  };

  const handleConnectSlack = () => {
    window.location.href = slackApi.connectUrl;
  };

  const handleDisconnectSlack = async () => {
    try {
      await slackApi.disconnect();
      setUser((current) => current ? { ...current, slackConnected: false, slackTeamId: null } : current);
      toast.success('Slack disconnected');
    } catch {
      toast.error('Could not disconnect Slack');
    }
  };

  const handleComposeSuccess = () => {
    setComposeOpen(false);
    toast.success('📅 Email scheduled successfully!');
    fetchEmails();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        user={user}
        tab={tab}
        onTabChange={setTab}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
        onCompose={() => setComposeOpen(true)}
        onConnectSlack={handleConnectSlack}
        onDisconnectSlack={handleDisconnectSlack}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          user={user}
          onLogout={handleLogout}
        />

        {/* Email panels */}
        <div className="flex flex-1 overflow-hidden">
          <EmailListPanel
            emails={emails}
            loading={emailsLoading}
            tab={tab}
            searchQuery={searchQuery}
            onSelect={(email) => router.push(`/dashboard/email/${email.id}`)}
          />
        </div>
      </div>

      {/* Compose takes over the workspace like the supplied reference. */}
      {composeOpen && (
        <ComposeModal
          senders={senders}
          onClose={() => setComposeOpen(false)}
          onSuccess={handleComposeSuccess}
          onAddSender={async () => {
            const s = await sendersApi.createEthereal();
            setSenders((prev) => [...prev, s]);
            toast.success(`Ethereal sender created!\n${s.note}`, { duration: 6000 });
          }}
        />
      )}

    </div>
  );
}
