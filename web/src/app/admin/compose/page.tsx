import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createTaskEntry } from "@/app/actions";
import { Reveal } from "@/components/ui/Reveal";
import { DynamicSelect, type Opt } from "@/components/DynamicSelect";
import { UniversityMultiSelect } from "@/components/UniversityMultiSelect";
import { MessageField } from "@/components/MessageField";

async function refOpts(supabase: Awaited<ReturnType<typeof createClient>>, table: string): Promise<Opt[]> {
  const { data } = await supabase.from(table).select("value").order("sort_order").order("value");
  return (data ?? []).map((r) => ({ value: r.value as string, label: r.value as string }));
}

export default async function Compose() {
  await requireAdmin();
  const supabase = await createClient();

  const [team, updateType, category, priority, channel, contentType, audience, unis] = await Promise.all([
    refOpts(supabase, "ref_team"),
    refOpts(supabase, "ref_update_type"),
    refOpts(supabase, "ref_category"),
    refOpts(supabase, "ref_priority"),
    refOpts(supabase, "ref_channel"),
    refOpts(supabase, "ref_content_type"),
    refOpts(supabase, "ref_target_audience"),
    supabase.from("universities").select("id, name").order("name"),
  ]);
  const uniOpts: Opt[] = (unis.data ?? []).map((u) => ({ value: u.id as string, label: u.name as string }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Authoring · UI → Database</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">New communication</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          Create an entry directly in the app — no Google Sheet needed. Every dropdown supports
          <span className="font-semibold text-ink"> ＋ Add new</span> to extend it on the fly.
        </p>
      </Reveal>

      <Reveal delay={0.06} className="mt-6">
        <form action={createTaskEntry} className="card space-y-5 p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Team (C)"><DynamicSelect name="team" kind="team" options={team} /></Field>
            <Field label="Entry Date"><input type="date" name="entry_date" className="filter-input w-full" /></Field>
            <Field label="Update Type"><DynamicSelect name="update_type" kind="update_type" options={updateType} /></Field>
            <Field label="Category"><DynamicSelect name="category" kind="category" options={category} /></Field>
            <Field label="Priority"><DynamicSelect name="priority" kind="priority" options={priority} defaultValue="Normal" /></Field>
            <div className="sm:col-span-2">
              <Field label="Universities * (All or selected)">
                <UniversityMultiSelect options={uniOpts} />
              </Field>
            </div>
            <Field label="Channel"><DynamicSelect name="channel" kind="channel" options={channel} /></Field>
            <Field label="Content Type"><DynamicSelect name="content_type" kind="content_type" options={contentType} /></Field>
            <Field label="Target Audience"><DynamicSelect name="target_audience" kind="target_audience" options={audience} /></Field>
          </div>

          <Field label="Message / Content"><MessageField name="message_content" /></Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Poster Drive link (or NA)">
              <input name="poster_drive_link" placeholder="https://drive.google.com/… or NA" className="filter-input w-full" />
            </Field>
            <Field label="Publish At (IST)"><input type="datetime-local" name="publish_at" className="filter-input w-full" /></Field>
          </div>

          <Field label="Special Instructions">
            <textarea name="special_instructions" rows={2} placeholder="Notes, links (e.g. a Google Sheet)…" className="filter-input w-full" />
          </Field>

          {/* Status / Actual Publish / Issue are the COLLEGE's response — not set here */}
          <div className="rounded-xl border border-dashed border-line bg-canvas p-4">
            <p className="font-ui text-sm font-semibold text-ink">
              Status &amp; Issue / Blocker are filled by the university, not here
            </p>
            <p className="mt-1 font-ui text-xs text-muted">
              Every entry starts as <span className="font-semibold text-ink">Pending</span> with no blocker.
              Each university&apos;s staff updates the status (and logs any blocker / actual publish time)
              from their own board — and that response reflects back to Admin instantly.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button className="rounded-full bg-accent px-6 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5">
              Create &amp; publish to board(s)
            </button>
            <span className="font-ui text-xs text-muted">Starts as Pending — the university responds from their board.</span>
          </div>
        </form>
      </Reveal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-ui text-[10px] uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}
