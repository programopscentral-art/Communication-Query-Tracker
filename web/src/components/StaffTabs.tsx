import Link from "next/link";

/** Sub-navigation for the Staff area: directory vs admin-access. */
export function StaffTabs({ active }: { active: "directory" | "access" }) {
  const tabs = [
    { key: "directory", href: "/admin/staff", label: "Staff Directory" },
    { key: "access", href: "/admin/access", label: "Admin Access" },
  ] as const;
  return (
    <div className="mb-6 inline-flex rounded-full border border-line bg-surface p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-full px-4 py-1.5 font-ui text-sm font-medium transition-colors ${
            active === t.key ? "bg-accent text-white" : "text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
