'use client';

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function Nav({ children }: { children?: React.ReactNode }) {
  return (
    <nav className="flex items-center gap-6 mb-6">
      <Link
        href="/arena"
        className="text-2xl font-bold text-accent"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        Rb.
      </Link>
      <Link href="/arena" className="text-sm text-zinc-500 hover:text-white transition-colors">
        Arenas
      </Link>
      <Link href="/history" className="text-sm text-zinc-500 hover:text-white transition-colors">
        History
      </Link>
      <Link href="/leaderboard" className="text-sm text-zinc-500 hover:text-white transition-colors">
        Global Leaderboard
      </Link>
      <div className="flex-1" />
      {children}
      <ThemeToggle />
    </nav>
  );
}
