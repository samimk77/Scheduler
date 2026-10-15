'use client';

import { User } from '@/types';
import Image from 'next/image';
import { Send, Clock, LogOut, Slack, ChevronDown } from 'lucide-react';

type Tab = 'scheduled' | 'sent';

interface SidebarProps {
  user: User;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  scheduledCount: number;
  sentCount: number;
  onCompose: () => void;
  onConnectSlack: () => void;
  onDisconnectSlack: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  user, tab, onTabChange, scheduledCount, sentCount,
  onCompose, onConnectSlack, onDisconnectSlack, onLogout,
}: SidebarProps) {
  return (
    <div className="w-44 flex-shrink-0 bg-white flex flex-col px-3 pt-3">
      {/* Logo */}
      <div className="px-1 py-1">
        <span className="text-2xl font-black text-gray-900 tracking-tight">ONB</span>
      </div>

      {/* User info */}
      <div className="px-0.5 py-1.5">
        <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 p-1.5">
          {user.avatar ? (
            <Image src={user.avatar} alt={user.name} width={26} height={26} unoptimized className="rounded-full" />
          ) : (
            <div className="w-[26px] h-[26px] rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-semibold">
              {user.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
        </div>

        {/* Compose button */}
        <button
          onClick={onCompose}
          className="mt-2 w-full py-2 border border-green-500 hover:bg-green-50 rounded-full text-sm font-medium text-green-700 transition-colors"
        >
          Compose
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-0 py-2 space-y-0.5">
        <p className="px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Core</p>

        <button
          onClick={() => onTabChange('scheduled')}
          className={`w-full flex items-center justify-between px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'scheduled'
              ? 'bg-emerald-50 text-gray-900'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span className="flex items-center gap-2">
            <Clock size={15} />
            Scheduled
          </span>
          {scheduledCount > 0 && (
            <span className="bg-gray-200 text-gray-700 text-xs px-1.5 py-0.5 rounded-full">
              {scheduledCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('sent')}
          className={`w-full flex items-center justify-between px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'sent'
              ? 'bg-emerald-50 text-gray-900'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span className="flex items-center gap-2">
            <Send size={15} />
            Sent
          </span>
          {sentCount > 0 && (
            <span className="bg-gray-200 text-gray-700 text-xs px-1.5 py-0.5 rounded-full">
              {sentCount}
            </span>
          )}
        </button>
      </nav>

      {/* Bottom actions */}
      <div className="px-0 py-2 space-y-1">
        <button
          onClick={user.slackConnected ? onDisconnectSlack : onConnectSlack}
          className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
            user.slackConnected
              ? 'text-green-700 bg-green-50'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Slack size={15} />
          {user.slackConnected ? 'Disconnect Slack' : 'Connect Slack'}
        </button>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </div>
  );
}

