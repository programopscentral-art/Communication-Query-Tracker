import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { UniSelect } from "@/components/UniSelect";
import { waLink, telLink } from "@/lib/format";
import { StaffTabs } from "@/components/StaffTabs";
import { ViewInSheet } from "@/components/ViewInSheet";

const STAFF_SHEET_ID = process.env.NEXT_PUBLIC_STAFF_SHEET_ID;

type Assignment = { role: string; team_scope: string; universities: { name: string; code: string } | null };
type Staff = {
  id: string;
  name: string;
  employee_id: string;
  designation: string | null;
  whatsapp_e164: string;
  email: string | null;
  active: boolean;
  source_gid: string | null;
  source_row: number | null;
  university_boas: Assignment[];
};

export default async function StaffDirectory({
  searchParams,
}: {
  searchParams: Promise<{ uni?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: unis }, { data: counts }, { data: rows }] = await Promise.all([
    supabase.from("universities").select("id, name, code").order("name"),
    supabase.from("v_university_history").select("university, code, staff_count").order("staff_count", { ascending: false }),
    supabase
      .from("boas")
      .select("id, name, employee_id, designation, whatsapp_e164, email, active, source_gid, source_row, university_boas(role, team_scope, universities(name, code))")
      .order("name"),
  ]);

  let staff = (rows ?? []) as unknown as Staff[];
  if (sp.uni) staff = staff.filter((s) => s.university_boas.some((a) => a.universities?.code === sp.uni));

  const totalStaff = (rows ?? []).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">People</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Staff directory</h1>
          <ButtonLink href="/admin/staff/new" size="sm">+ Add staff</ButtonLink>
        </div>
        <p className="mt-2 font-ui text-sm text-muted">{totalStaff} staff across {(counts ?? []).length} universities</p>
      </Reveal>

      <div className="mt-6"><StaffTabs active="directory" /></div>

      {/* per-university counts */}
      <Reveal delay={0.05} className="mt-2">
        <div className="flex flex-wrap gap-2">
          {(counts ?? []).map((c) => (
            <Link
              key={c.code}
              href={`/admin/staff?uni=${c.code}`}
              className={`rounded-full border px-3 py-1.5 font-ui text-xs font-medium transition-colors ${
                sp.uni === c.code ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {c.university} <span className="ml-1 font-bold text-ink">{c.staff_count}</span>
            </Link>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mt-6 flex items-center gap-3">
        <UniSelect options={unis ?? []} current={sp.uni ?? ""} />
        {sp.uni && <Link href="/admin/staff" className="font-ui text-sm text-muted hover:text-ink">Clear</Link>}
      </Reveal>

      <Reveal delay={0.12} className="mt-4">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-4 py-3">Employee ID</th>
                  <th className="px-4 py-3">Universities</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {staff.map((st) => (
                  <tr key={st.id} className="transition-colors hover:bg-canvas">
                    <td className="px-6 py-3">
                      <Link href={`/admin/staff/${st.id}`} className="font-medium text-ink hover:text-accent">{st.name}</Link>
                      {st.designation && <p className="text-xs text-muted">{st.designation}</p>}
                    </td>
                    <td className="px-4 py-3 font-ui text-muted">{st.employee_id}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {st.university_boas.map((a, i) => (
                          <span key={i} className="rounded-full bg-line-soft px-2 py-0.5 text-xs text-muted">
                            {a.universities?.name ?? "—"}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a href={waLink(st.whatsapp_e164)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-2.5 py-1 font-ui text-xs font-semibold text-success hover:border-success" title="WhatsApp">
                          WhatsApp
                        </a>
                        <a href={telLink(st.whatsapp_e164)} className="font-ui text-xs text-muted hover:text-ink">{st.whatsapp_e164}</a>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.active ? "bg-green-100 text-success" : "bg-line-soft text-muted"}`}>
                          {st.active ? "Active" : "Inactive"}
                        </span>
                        <ViewInSheet compact sheetId={STAFF_SHEET_ID} gid={st.source_gid} row={st.source_row} />
                      </div>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted">
                    No staff yet. Click <b>Add staff</b> or run the BOA sheet sync.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
