'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import LoginPage from '@/components/LoginPage';
import toast from 'react-hot-toast';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'oauth_failed') {
      toast.error('Google sign-in failed. Check the backend log for Google’s OAuth error details.');
      window.history.replaceState({}, '', '/');
    }
    // If already authenticated, go to dashboard
    authApi.getMe()
      .then(() => router.push('/dashboard'))
      .catch(() => { /* not logged in — show login */ });
  }, [router]);

  return <LoginPage />;
}
