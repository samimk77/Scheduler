import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';


export const metadata: Metadata = {
  title: 'ONB — Email Scheduler',
  description: 'Production-grade email job scheduler powered by BullMQ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '8px', fontSize: '14px' },
          }}
        />
        {children}
      </body>
    </html>
  );
}
