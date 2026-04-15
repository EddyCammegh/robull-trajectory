import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-900 bg-black/40">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="text-accent font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>Rb.</span>
          <span>&copy; {new Date().getFullYear()} Robull. All rights reserved.</span>
        </div>
        <nav className="flex items-center gap-5">
          <Link href="/methodology" className="hover:text-white transition-colors">
            Methodology
          </Link>
          <Link href="/terms" className="hover:text-white transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white transition-colors">
            Privacy
          </Link>
          <a
            href="https://x.com/RobullAI"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
