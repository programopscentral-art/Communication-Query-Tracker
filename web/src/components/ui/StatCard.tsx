import { CountUp } from "./CountUp";
import { RevealItem } from "./Reveal";

const TONES: Record<string, { dot: string; num: string }> = {
  ink: { dot: "bg-ink", num: "text-ink" },
  accent: { dot: "bg-accent", num: "text-accent" },
  amber: { dot: "bg-warn", num: "text-warn" },
  blue: { dot: "bg-info", num: "text-info" },
  green: { dot: "bg-success", num: "text-success" },
  red: { dot: "bg-danger", num: "text-danger" },
  muted: { dot: "bg-muted", num: "text-ink" },
};

export function StatCard({
  label,
  value,
  tone = "ink",
  hint,
}: {
  label: string;
  value: number;
  tone?: keyof typeof TONES;
  hint?: string;
}) {
  const t = TONES[tone];
  return (
    <RevealItem>
      <div className="card group relative overflow-hidden p-5 transition-transform duration-200 hover:-translate-y-1">
        <div className="mb-3 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${t.dot}`} />
          <span className="font-ui text-xs font-medium uppercase tracking-wider text-muted">
            {label}
          </span>
        </div>
        <p className={`font-ui text-3xl font-bold tracking-tight ${t.num}`}>
          <CountUp to={value} />
        </p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        <span className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent-soft opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
    </RevealItem>
  );
}
