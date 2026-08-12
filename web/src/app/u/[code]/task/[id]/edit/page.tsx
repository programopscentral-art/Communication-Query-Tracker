import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateTaskFull } from "@/app/actions";
import { utcToIstLocalInput } from "@/lib/format";
import { Reveal } from "@/components/ui/Reveal";
import { DynamicSelect, type Opt } from "@/components/DynamicSelect";
import { MessageField } from "@/components/MessageField";

async function refOpts(supabase: Awaited<ReturnType<typeof createClient>>, table: string): Promise<Opt[]> {
  const { data } = await supabase.from(table).select("value").order("sort_order").order("value");
  return (data ?? []).map((r) => ({ value: r.value as string, label: r.value as string }));
}

export default async function EditTask({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  await requireAdmin(); // admin-only — BOAs are redirected
  const supabase = await createClient();

  const [{ data: task }, team, updateType, category, priority, channel, contentType, audience, { data: unis }] =
    await Promise.all([
      supabase.from("tasks").select("*").eq("id", id).single(),
      refOpts(supabase, "ref_team"),
      refOpts(supabase, "ref_update_type"),
      refOpts(supabase, "ref_category"),
      refOpts(supabase, "ref_priority"),
      refOpts(supabase, "ref_channel"),
      refOpts(supabase, "ref_content_type"),
      refOpts(supabase, "ref_target_audience"),
      supabase.from("universities").select("id, name").order("name"),
    ]);
  if (!task) notFound();
  const uniOpts: Opt[] = (unis ?? []).map((u) => ({ value: u.id as string, label: u.name as string }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href={`/u/${code}/task/${id}`} className="font-ui text-sm text-accent hover:underline">← Back to task</Link>
        <p className="eyebrow mb-2 mt-3">Admin · Edit</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Edit communication</h1>
      </Reveal>

      <Reveal delay={0.06} className="mt-6">
        <form action={updateTaskFull} className="card space-y-5 p-6 sm:p-8">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="code" value={code} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Team"><DynamicSelect name="team" kind="team" options={team} defaultValue={task.team ?? ""} /></Field>
            <Field label="University"><DynamicSelect name="university_id" kind="university" options={uniOpts} defaultValue={task.university_id} /></Field>
            <Field label="Update Type"><DynamicSelect name="update_type" kind="update_type" options={updateType} defaultValue={task.update_type ?? ""} /></Field>
            <Field label="Category"><DynamicSelect name="category" kind="category" options={category} defaultValue={task.category ?? ""} /></Field>
            <Field label="Priority"><DynamicSelect name="priority" kind="priority" options={priority} defaultValue={task.priority ?? "Normal"} /></Field>
            <Field label="Channel"><DynamicSelect name="channel" kind="channel" options={channel} defaultValue={task.channel ?? ""} /></Field>
            <Field label="Content Type"><DynamicSelect name="content_type" kind="content_type" options={contentType} defaultValue={task.content_type ?? ""} /></Field>
            <Field label="Target Audience"><DynamicSelect name="target_audience" kind="target_audience" options={audience} defaultValue={task.target_audience ?? ""} /></Field>
          </div>

          <Field label="Message / Content"><MessageField name="message_content" defaultValue={task.message_content ?? ""} /></Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Poster Drive link (or NA)">
              <input name="poster_drive_link" defaultValue={task.poster_drive_link ?? ""} className="filter-input w-full" />
            </Field>
            <Field label="Publish At (IST)">
              <input type="datetime-local" name="publish_at" defaultValue={utcToIstLocalInput(task.publish_at)} className="filter-input w-full" />
            </Field>
          </div>

          <Field label="Special Instructions">
            <textarea name="special_instructions" rows={2} defaultValue={task.special_instructions ?? ""} className="filter-input w-full" />
          </Field>

          <div className="flex items-center gap-3 pt-2">
            <button className="rounded-full bg-accent px-6 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5">
              Save changes
            </button>
            <Link href={`/u/${code}/task/${id}`} className="font-ui text-sm text-muted hover:text-ink">Cancel</Link>
          </div>
          <p className="text-xs text-muted">
            Status, actual-publish, and blocker are updated from the task page — not here.
          </p>
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
