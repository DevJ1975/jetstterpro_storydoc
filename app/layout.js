import './globals.css';

export const metadata = {
  title: 'JetSetter Pro — Confidential Investor Pitch',
  description:
    'JetSetter Pro: the AI co-pilot for the modern business traveler. Confidential pitch — access under NDA.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
