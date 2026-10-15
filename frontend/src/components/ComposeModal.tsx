'use client';

import { useState, useCallback, useRef } from 'react';
import { Sender } from '@/types';
import { emailsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { X, ArrowLeft, Paperclip, Clock, ChevronDown, Upload, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamically import Quill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false, loading: () => <div className="h-40 bg-gray-50 animate-pulse rounded" /> });
import 'react-quill/dist/quill.snow.css';

interface ComposeModalProps {
  senders: Sender[];
  onClose: () => void;
  onSuccess: () => void;
  onAddSender: () => Promise<void>;
}

const QUICK_TIMES = [
  { label: 'In 5 minutes', minutes: 5 },
  { label: 'In 30 minutes', minutes: 30 },
  { label: 'Tomorrow, 9:00 AM', minutes: 24 * 60 },
  { label: 'Tomorrow, 11:00 AM', minutes: 24 * 60 + 120 },
  { label: 'Tomorrow, 3:00 PM', minutes: 24 * 60 + 360 },
];

export default function ComposeModal({ senders, onClose, onSuccess, onAddSender }: ComposeModalProps) {
  const [senderId, setSenderId] = useState(senders[0]?.id || '');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState(50);
  const [delayBetweenMs, setDelayBetweenMs] = useState(2000);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvCount, setCsvCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [senderMenuOpen, setSenderMenuOpen] = useState(false);
  const [addingSender, setAddingSender] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addRecipient = () => {
    const email = recipientInput.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return;
    if (!recipients.includes(email)) {
      setRecipients((prev) => [...prev, email]);
    }
    setRecipientInput('');
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRecipient();
    }
  };

  const handleCSVUpload = useCallback((file: File) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const emailRegex = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/g;
      const found = Array.from(new Set((text.match(emailRegex) || []).map((email) => email.toLowerCase())));
      setCsvCount(found.length);
      toast.success(`Found ${found.length} email addresses in CSV`);
    };
    reader.readAsText(file);
  }, []);

  const setQuickTime = (minutes: number) => {
    const d = new Date(Date.now() + minutes * 60 * 1000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    setScheduledAt(local);
    setShowTimeMenu(false);
  };

  const handleSubmit = async () => {
    if (!senderId) { toast.error('Select a sender'); return; }
    if (recipients.length === 0 && !csvFile) { toast.error('Add at least one recipient'); return; }
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    if (!body.trim() || body === '<p><br></p>') { toast.error('Email body is required'); return; }
    if (!scheduledAt) { toast.error('Select a scheduled time'); return; }
    if (!Number.isInteger(hourlyLimit) || hourlyLimit < 1 || !Number.isInteger(delayBetweenMs) || delayBetweenMs < 0) {
      toast.error('Enter a positive hourly limit and a non-negative whole-number delay'); return;
    }

    setLoading(true);
    try {
      await emailsApi.schedule({
        senderId,
        recipients,
        subject,
        body,
        scheduledAt: new Date(scheduledAt).toISOString(),
        hourlyLimit,
        delayBetweenMs,
        csvFile: csvFile || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to schedule email';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedSender = senders.find((s) => s.id === senderId);

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      <div className="bg-white w-full h-full flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-base font-semibold text-gray-900">Compose New Email</h2>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
              <Paperclip size={16} />
            </button>
            {/* Schedule time button */}
            <div className="relative">
              <button
                onClick={() => setShowTimeMenu(!showTimeMenu)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <Clock size={16} />
              </button>
              {showTimeMenu && (
                <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-xl shadow-lg w-52 z-50 py-1.5">
                  <p className="px-3 py-1.5 text-xs font-semibold text-gray-400">Quick times</p>
                  {QUICK_TIMES.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => setQuickTime(t.minutes)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                  <div className="border-t border-gray-100 mt-1 pt-1 px-3 pb-2">
                    <label className="text-xs text-gray-500">Custom time</label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => { setScheduledAt(e.target.value); setShowTimeMenu(false); }}
                      className="w-full mt-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-1 border border-green-500 hover:bg-green-50 text-green-700 rounded-full text-xs font-medium transition-colors disabled:opacity-60"
            >
              {loading ? 'Scheduling...' : 'Send Later'}
            </button>
          </div>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-[8%] space-y-4">
          {/* From */}
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-500 w-16 flex-shrink-0">From</label>
            <div className="relative">
              <button
                onClick={() => setSenderMenuOpen(!senderMenuOpen)}
                className="flex items-center gap-1.5 text-sm text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-lg border border-transparent hover:border-gray-200 transition-all"
              >
                {selectedSender?.email || 'Select sender'}
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              {senderMenuOpen && (
                <div className="absolute left-0 top-9 bg-white border border-gray-200 rounded-xl shadow-lg w-64 z-50 py-1.5">
                  {senders.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSenderId(s.id); setSenderMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-gray-400 text-xs ml-2">{s.email}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-100 mt-1">
                    <button
                      onClick={async () => {
                        setAddingSender(true);
                        try {
                          await onAddSender();
                          setSenderMenuOpen(false);
                        } catch {
                          toast.error('Could not create an Ethereal sender');
                        } finally {
                          setAddingSender(false);
                        }
                      }}
                      disabled={addingSender}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors"
                    >
                      <Plus size={14} />
                      {addingSender ? 'Creating...' : 'Add Ethereal Sender'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* To */}
          <div className="flex items-start gap-4">
            <label className="text-sm text-gray-500 w-16 flex-shrink-0 pt-1.5">To</label>
            <div className="flex-1">
              <div className="flex flex-wrap gap-1.5 items-center min-h-8">
                {recipients.map((r) => (
                  <span key={r} className="email-tag">
                    {r}
                    <button onClick={() => removeRecipient(r)} className="ml-0.5 text-gray-400 hover:text-red-500">
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {csvCount > 0 && (
                  <span className="email-tag">+{csvCount} from CSV</span>
                )}
                <input
                  type="email"
                  placeholder="Add email and press Enter"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={addRecipient}
                  className="flex-1 min-w-32 text-sm outline-none text-gray-700 placeholder-gray-400"
                />
              </div>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 font-medium whitespace-nowrap"
            >
              <Upload size={13} />
              Upload List
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleCSVUpload(e.target.files[0])}
            />
          </div>

          {/* Subject */}
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-500 w-16 flex-shrink-0">Subject</label>
            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none border-b border-gray-100 pb-1 focus:border-green-400 transition-colors"
            />
          </div>

          {/* Delay / Hourly limit */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Delay between 2 emails</label>
              <input
                type="number"
                min={1000}
                step={500}
                value={delayBetweenMs}
                onChange={(e) => setDelayBetweenMs(Number(e.target.value))}
                className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-green-400"
              />
              <span className="text-xs text-gray-400">ms</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Hourly Limit</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
          </div>

          {/* Scheduled time display */}
          {scheduledAt && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={14} className="text-green-500" />
              <span className="text-gray-500">Scheduled for:</span>
              <span className="font-medium text-gray-800">{new Date(scheduledAt).toLocaleString()}</span>
              <button onClick={() => setScheduledAt('')} className="text-gray-400 hover:text-red-500 ml-1">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Rich Text Editor */}
          <div className="quill-wrapper min-h-[280px] sm:min-h-[min(56vh,520px)]">
            <ReactQuill
              theme="snow"
              value={body}
              onChange={setBody}
              placeholder="Type Your Reply..."
              style={{ minHeight: 'min(56vh, 520px)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
