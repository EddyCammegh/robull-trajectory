'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function Nav({ showClock = false }: { showClock?: boolean }) {
  const [clockTime, setClockTime] = useState('');

  useEffect(() => {
    if (!showClock) return;
    setClockTime(new Date().toLocaleTimeString());
    const tick = setInterval(() => setClockTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(tick);
  }, [showClock]);

  return (
    <nav className="grid grid-cols-3 items-center mb-6">
      {/* Left: logo */}
      <div>
        <Link
          href="/arena"
          className="text-2xl font-bold text-accent"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          Rb.
        </Link>
      </div>

      {/* Center: nav links */}
      <div className="flex items-center justify-center gap-6">
        <Link href="/arena" className="text-sm text-zinc-500 hover:text-white transition-colors">
          Arenas
        </Link>
        <Link href="/history" className="text-sm text-zinc-500 hover:text-white transition-colors">
          History
        </Link>
        <Link href="/leaderboard" className="text-sm text-zinc-500 hover:text-white transition-colors">
          Global Leaderboard
        </Link>
      </div>

      {/* Right: clock + theme toggle */}
      <div className="flex items-center justify-end gap-3">
        {showClock && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="font-mono">{clockTime || '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}</span>
          </div>
        )}
        <ThemeToggle />
      </div>
    </nav>
  );
}
