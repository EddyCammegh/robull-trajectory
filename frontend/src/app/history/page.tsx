'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getHistory, type HistoryDay } from '@/lib/api';
import { Nav } from '@/components/Nav';
import { ParticleCanvas } from '@/components/ParticleCanvas';

const NYSE_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
]);

const HOLIDAY_LABELS_2026: Record<string, string> = {
  '2026-01-01': "New Year's",
  '2026-01-19': 'MLK Day',
  '2026-02-16': "Presidents' Day",
  '2026-04-03': 'Good Friday',
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence',
  '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving',
  '2026-12-25': 'Christmas',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ymdUTC(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
  return dow === 0 || dow === 6;
}

export default function HistoryPage() {
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHistory()
      .then((d) => setDays(d.days))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Index history by date for O(1) cell lookup.
  const dataByDate = useMemo(() => {
    const map = new Map<string, HistoryDay>();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  // Months to render: from earliest data month to current month, newest first.
  // If no data yet, show just the current month.
  const months = useMemo(() => {
    const today = new Date();
    const endY = today.getUTCFullYear();
    const endM = today.getUTCMonth();

    let startY = endY;
    let startM = endM;
    if (days.length > 0) {
      const earliest = days
        .map((d) => d.date)
        .sort()[0]; // YYYY-MM-DD strings sort lexicographically
      const [yStr, mStr] = earliest.split('-');
      startY = parseInt(yStr, 10);
      startM = parseInt(mStr, 10) - 1;
    }

    const out: Array<{ year: number; month: number }> = [];
    let y = startY;
    let m = startM;
    while (y < endY || (y === endY && m <= endM)) {
      out.push({ year: y, month: m });
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return out.reverse();
  }, [days]);

  const todayStr = useMemo(() => {
    const t = new Date();
    return ymdUTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-black">
      <ParticleCanvas />
      <div className="px-4 md:px-6 pt-6">
        <Nav />
      </div>
      <div className="px-4 md:px-6 pb-6 max-w-5xl mx-auto">
        {loading && <p className="text-zinc-500">Loading history...</p>}
        {error && <p className="text-red-400">Error: {error}</p>}

        {!loading && (
          <>
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mb-6 text-[11px] text-zinc-500">
              <LegendSwatch className="bg-accent/15 border border-accent/60" label="Has data" />
              <LegendSwatch className="border border-accent/30" label="Trading day, no data" />
              <LegendSwatch className="border border-dashed border-accent/15" label="Weekend" />
              <LegendSwatch className="border border-accent/20 bg-accent/[0.04]" label="NYSE holiday" />
            </div>

            <div className="space-y-10">
              {months.map(({ year, month }) => (
                <MonthGrid
                  key={`${year}-${month}`}
                  year={year}
                  month={month}
                  dataByDate={dataByDate}
                  todayStr={todayStr}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded-sm ${className}`} />
      <span>{label}</span>
    </div>
  );
}

function MonthGrid({
  year,
  month,
  dataByDate,
  todayStr,
}: {
  year: number;
  month: number;
  dataByDate: Map<string, HistoryDay>;
  todayStr: string;
}) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Cells: leading blanks for week alignment, then 1..daysInMonth.
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <section>
      <h2 className="text-sm font-medium text-zinc-300 mb-3">
        {MONTH_NAMES[month]} <span className="text-zinc-600">{year}</span>
      </h2>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {DOW_LABELS.map((d, i) => (
          <div
            key={i}
            className="text-[10px] text-zinc-600 uppercase tracking-wider text-center"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = ymdUTC(year, month, day);
          const weekend = isWeekend(year, month, day);
          const holiday = NYSE_HOLIDAYS_2026.has(dateStr);
          const data = dataByDate.get(dateStr);
          const isToday = dateStr === todayStr;

          return (
            <DayCell
              key={i}
              day={day}
              dateStr={dateStr}
              weekend={weekend}
              holiday={holiday}
              data={data}
              isToday={isToday}
            />
          );
        })}
      </div>
    </section>
  );
}

function DayCell({
  day,
  dateStr,
  weekend,
  holiday,
  data,
  isToday,
}: {
  day: number;
  dateStr: string;
  weekend: boolean;
  holiday: boolean;
  data: HistoryDay | undefined;
  isToday: boolean;
}) {
  const ringClass = isToday ? 'ring-1 ring-accent' : '';

  // Weekend — dim, dashed, never clickable.
  if (weekend) {
    return (
      <div
        className={`aspect-square rounded-md border border-dashed border-accent/15 flex items-start justify-end p-1.5 ${ringClass}`}
      >
        <span className="text-[11px] font-mono text-accent/30">{day}</span>
      </div>
    );
  }

  // NYSE holiday — distinct fill, label.
  if (holiday) {
    return (
      <div
        className={`aspect-square rounded-md border border-accent/20 bg-accent/[0.04] flex flex-col items-end p-1.5 ${ringClass}`}
      >
        <span className="text-[11px] font-mono text-accent/40">{day}</span>
        <span className="mt-auto self-start text-[9px] text-accent/40 truncate w-full">
          {HOLIDAY_LABELS_2026[dateStr] ?? 'Holiday'}
        </span>
      </div>
    );
  }

  // Trading day with data — highlighted, each instrument is a clickable tag.
  if (data && data.markets.length > 0) {
    return (
      <div
        className={`aspect-square rounded-md border border-accent/60 bg-accent/10 flex flex-col p-1.5 gap-1 overflow-hidden ${ringClass}`}
      >
        <div className="text-[11px] font-mono text-white text-right leading-none">
          {day}
        </div>
        <div className="flex flex-wrap gap-1 content-start">
          {data.markets.map((m) => (
            <Link
              key={m.id}
              href={`/arena/${m.id}`}
              className="text-[9px] font-mono px-1 py-px rounded border border-accent/40 text-accent/90 hover:bg-accent hover:text-black transition-colors"
            >
              {m.instrument}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Trading day, no data — empty / missed.
  return (
    <div
      className={`aspect-square rounded-md border border-accent/30 flex items-start justify-end p-1.5 ${ringClass}`}
    >
      <span className="text-[11px] font-mono text-accent/40">{day}</span>
    </div>
  );
}
