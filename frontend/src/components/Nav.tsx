'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function Nav() {
  const [clockTime, setClockTime] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setClockTime(new Date().toLocaleTimeString());
    const tick = setInterval(() => setClockTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <nav className="mb-6 rounded-lg px-4 py-3 backdrop-blur-none border border-zinc-900" style={{ background: '#000000' }}>
      <div className="flex items-center">
        {/* Left: logo — width matched to right column so center links stay balanced */}
        <div className="w-32 md:w-48 flex-shrink-0">
          <Link
            href="/arena"
            className="text-2xl font-bold text-accent"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            Rb.
          </Link>
        </div>

        {/* Center: nav links — desktop only, evenly distributed across remaining width */}
        <div className="hidden md:flex flex-1 items-center justify-evenly px-4">
          <Link href="/arena" className="text-sm text-zinc-500 hover:text-white transition-colors">
            Arenas
          </Link>
          <Link href="/history" className="text-sm text-zinc-500 hover:text-white transition-colors">
            History
          </Link>
          <Link href="/leaderboard" className="text-sm text-zinc-500 hover:text-white transition-colors">
            Global Leaderboard
          </Link>
          <Link href="/register" className="text-sm text-accent/70 hover:text-accent transition-colors">
            Register
          </Link>
        </div>

        {/* Right: desktop shows clock + replay button, mobile shows hamburger */}
        <div className="flex-1 md:flex-none md:w-48 flex items-center justify-end gap-3">
          {/* Clock — desktop only */}
          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="font-mono">{clockTime || '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}</span>
          </div>
          {/* Replay carousel — clears onboarding flag and reloads landing */}
          <button
            onClick={() => {
              try { localStorage.removeItem('robull_onboarded'); } catch {}
              window.location.href = '/';
            }}
            aria-label="Replay intro"
            title="Replay intro"
            className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-500 hover:text-accent hover:bg-zinc-900 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="1.5" y="1.5" width="3.5" height="3.5" rx="0.6" />
              <rect x="6.25" y="1.5" width="3.5" height="3.5" rx="0.6" />
              <rect x="11" y="1.5" width="3.5" height="3.5" rx="0.6" />
              <rect x="1.5" y="6.25" width="3.5" height="3.5" rx="0.6" />
              <rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.6" />
              <rect x="11" y="6.25" width="3.5" height="3.5" rx="0.6" />
              <rect x="1.5" y="11" width="3.5" height="3.5" rx="0.6" />
              <rect x="6.25" y="11" width="3.5" height="3.5" rx="0.6" />
              <rect x="11" y="11" width="3.5" height="3.5" rx="0.6" />
            </svg>
          </button>
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
            href="/register"
            onClick={() => setMenuOpen(false)}
            className="block px-4 py-3 text-sm text-accent/70 hover:text-accent hover:bg-zinc-900 transition-colors border-t border-zinc-800"
          >
            Register
          </Link>
        </div>
      )}
    </nav>
  );
}
