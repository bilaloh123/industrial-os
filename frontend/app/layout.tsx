import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../lib/auth-context';
import { NetworkStatusProvider } from '../lib/offline/network-status';
import { ServiceWorkerRegister } from '../components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'INDUSTRIAL OS',
  description: 'Industrial Distribution Intelligence Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <ServiceWorkerRegister />
        <NetworkStatusProvider>
          <AuthProvider>{children}</AuthProvider>
        </NetworkStatusProvider>
      </body>
    </html>
  );
}
