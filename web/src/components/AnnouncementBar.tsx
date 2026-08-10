"use client";

import { fmtIST } from "@/lib/format";

type Stats = { today: number; pending: number; overdue: number; next_publish: string | null };
type Ann = { id: string; message: string; kind: string };

/** Flowing per-university ticker: admin announcements + live stats.
 *  Shows ONLY the current university's data. */
export function AnnouncementBar({
  stats,
  announcements,
}: {
  stats: Stats;
  announcements: Ann[];
}) {
  const chips: { icon: string; text: string; tone?: string }[] = [
    { icon: "📅", text: `Today: ${stats.today}` },
    { icon: "⏳", text: `Pending: ${stats.pending}`, tone: stats.pending ? "warn" : undefined },
    { icon: "⚠️", text: `Overdue: ${stats.overdue}`, tone: stats.overdue ? "danger" : undefined },
    ...(stats.next_publish
      ? [{ icon: "⏭️", text: `Next publish: ${fmtIST(stats.next_publish)}` }]
      : []),
  ];

  const items = [
    ...announcements.map((a) => ({
      key: a.id,
      node: (
        <span className="inline-flex items-center gap-2">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            {a.kind === "promo" ? "★ Promo" : a.kind === "warning" ? "Notice" : "Update"}
          </span>
          <span className="font-medium">{a.message}</span>
        </span>
      ),
    })),
    ...chips.map((c, i) => ({
      key: `chip-${i}`,
      node: (
        <span className="inline-flex items-center gap-1.5 font-ui font-semibold">
          <span>{c.icon}</span>
          <span
            className={
              c.tone === "danger" ? "text-white" : c.tone === "warn" ? "text-white" : "text-white/90"
            }
          >
            {c.text}
          </span>
        </span>
      ),
    })),
  ];

  if (items.length === 0) return null;

  // duplicate the sequence for a seamless loop
  const Sequence = () => (
    <div className="flex shrink-0 items-center gap-10 px-5">
      {items.map((it) => (
        <span key={it.key}>{it.node}</span>
      ))}
    </div>
  );

  return (
    <div className="marquee relative border-b border-accent-2/40 bg-gradient-to-r from-accent to-accent-2 text-white">
      <div className="marquee-track py-2 text-sm">
        <Sequence />
        <Sequence />
      </div>
      <span className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-accent to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-accent-2 to-transparent" />
    </div>
  );
}
