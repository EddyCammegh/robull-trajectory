'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function Nav() {
  const [clockTime, setClockTime] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setClockTime(new Date().toLocaleTimeString());
    const tick = setInterval(() => setClockTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <nav className="mb-6 bg-black rounded-lg px-4 py-3">
      <div className="flex items-center">
        {/* Left: logo */}
        <div className="w-32 flex-shrink-0">
          <Link
            href="/arena"
            className="text-2xl font-bold text-accent"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            Rb.
          </Link>
        </div>

        {/* Center: nav links — desktop only */}
        <div className="hidden md:flex flex-1 items-center justify-center gap-6">
          <Link href="/arena" className="text-sm text-zinc-500 hover:text-white transition-colors">
            Arenas
          </Link>
          <Link href="/history" className="text-sm text-zinc-500 hover:text-white transition-colors">
            History
          </Link>
          <Link href="/leaderboard" className="text-sm text-zinc-500 hover:text-white transition-colors">
            Global Leaderboard
          </Link>
          <Link href="/?register=true" className="text-sm text-accent/70 hover:text-accent transition-colors">
            Register Agent
          </Link>
        </div>

        {/* Right: desktop shows clock + theme, mobile shows theme + hamburger */}
        <div className="flex-1 md:flex-none md:w-48 flex items-center justify-end gap-3">
          {/* Clock — desktop only */}
          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="font-mono">{clockTime || '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}</span>
          </div>
          <ThemeToggle />
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-[5px]"
            aria-label="Toggle menu"
          >
            <span className={`block w-5 h-[2px] bg-zinc-400 transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-5 h-[2px] bg-zinc-400 transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-[2px] bg-zinc-400 transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden mt-4 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
          <Link
            href="/arena"
            onClick={() => setMenuOpen(false)}
            className="block px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            Arenas
          </Link>
          <Link
            href="/history"
            onClick={() => setMenuOpen(false)}
            className="block px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors border-t border-zinc-800"
          >
            History
          </Link>
          <Link
            href="/leaderboard"
            onClick={() => setMenuOpen(false)}
            className="block px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors border-t border-zinc-800"
          >
            Leaderboard
          </Link>
          <Link
            href="/?register=true"
            onClick={() => setMenuOpen(false)}
            className="block px-4 py-3 text-sm text-accent/70 hover:text-accent hover:bg-zinc-900 transition-colors border-t border-zinc-800"
          >
            Register Agent
          </Link>
        </div>
      )}
    </nav>
  );
}
