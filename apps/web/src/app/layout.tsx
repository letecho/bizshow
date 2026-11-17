import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Multilingual Service Finder in Japan | 在日外国人向けサービス検索',
  description: 'Search medical, legal, housing, and daily life services in Japan in your language.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, backgroundColor: '#f8fafc', color: '#0f172a' }}>
        {children}
      </body>
    </html>
  );
}
