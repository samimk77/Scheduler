'use client';

import { Search, RefreshCw, SlidersHorizontal } from 'lucide-react';
import Image from 'next/image';
import { User } from '@/types';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  user: User;
  onLogout: () => void;
}

export default function Header({ searchQuery, onSearchChange, user, onLogout }: HeaderProps) {
  return (
    <div className="h-12 flex items-center gap-3 px-3 bg-white flex-shrink-0">
      {/* Search */}
      <div className="max-w-md flex-1 flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
        <Search size={14} className="text-gray-400" />
        <input
          type="text"
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
        />
      </div>

      {/* Actions */}
      <button title="Filter emails" className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
        <SlidersHorizontal size={13} />
      </button>
      <button title="Refresh" onClick={() => window.dispatchEvent(new Event('email-refresh'))} className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
        <RefreshCw size={13} />
      </button>

      {/* Avatar */}
      <button onClick={onLogout} title="Logout" className="flex-shrink-0">
        {user.avatar ? (
          <Image src={user.avatar} alt={user.name} width={28} height={28} unoptimized className="rounded-full hover:opacity-80 transition-opacity" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-semibold hover:opacity-80 transition-opacity">
            {user.name.charAt(0)}
          </div>
        )}
      </button>
      <div className="hidden min-w-0 max-w-36 sm:block">
        <p className="truncate text-sm font-medium text-gray-700">{user.name}</p>
        <p className="truncate text-xs text-gray-500">{user.email}</p>
      </div>
    </div>
  );
}
