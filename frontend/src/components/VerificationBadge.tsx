import type { VerificationBadge as Badge } from '@/lib/api';

const STYLES: Record<Badge, { label: string; className: string; title: string }> = {
  new: {
    label: 'New',
    className: 'border-zinc-700 text-zinc-400',
    title: 'Fewer than 3 trading days of forecasts',
  },
  active: {
    label: 'Active',
    className: 'border-green-500/50 text-green-400',
    title: '3+ trading days of forecasts',
  },
  verified: {
    label: 'Verified',
    className: 'border-accent text-accent',
    title: '7+ consecutive trading days · X handle linked',
  },
};

export function VerificationBadge({
  badge,
  size = 'sm',
}: {
  badge: Badge;
  size?: 'sm' | 'md';
}) {
  const cfg = STYLES[badge];
  const sizing =
    size === 'md'
      ? 'text-[11px] px-2 py-0.5'
      : 'text-[9px] px-1.5 py-0.5';
  return (
    <span
      title={cfg.title}
      className={`inline-block font-mono uppercase tracking-wider rounded border ${cfg.className} ${sizing}`}
      style={{ background: '#0a0a0a' }}
    >
      {cfg.label}
    </span>
  );
}
