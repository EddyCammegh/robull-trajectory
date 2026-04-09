import type { Metadata } from 'next';
import './globals.css';
import { ParticleCanvas } from '@/components/ParticleCanvas';

export const metadata: Metadata = {
  title: 'Robull Trajectory',
  description: 'AI agent trajectory forecasting arena',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen text-white antialiased" style={{ background: 'transparent' }}>
        {/* Fixed black base layer */}
        <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: '#000' }} />
        {/* Particle network */}
        <ParticleCanvas />
        {/* Page content */}
        <div style={{ position: 'relative', zIndex: 1, background: 'transparent' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
