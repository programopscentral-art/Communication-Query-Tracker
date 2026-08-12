import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppUser, hasAdminAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { StatusBadge, PriorityBadge } from "@/components/Badges";
import { updateTask } from "@/app/actions";
import { Reveal } from "@/components/ui/Reveal";
import { SendNowButton } from "@/components/SendNowButton";
import { ViewInSheet } from "@/components/ViewInSheet";
import { DeleteTaskButton } from "@/components/DeleteTaskButton";

const STATUS_OPTIONS = ["pending", "in_progress", "published", "blocked", "restricted"];

export default async function TaskDetail({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireAppUser();
  const canEdit = hasAdminAccess(user);
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("*, universities(name, code)")
    .eq("id", id)
    .single();
  if (!task) notFound();

  const uni = task.universities as { name: string; code: string } | null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Reveal>
        <div className="flex items-center justify-between gap-3">
          <Link href={`/u/${code}`} className="font-ui text-sm text-accent hover:underline">
            ← {uni?.name ?? "Board"}
          </Link>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link
                href={`/u/${code}/task/${id}/edit`}
                className="rounded-full border border-line px-4 py-2 font-ui text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
              >
                Edit
              </Link>
              <DeleteTaskButton taskId={task.id} code={code} />
            </div>
          )}
        </div>

        <div className="mt-4 card p-6 sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.execution_status} />
            <span className="ml-auto">
              <ViewInSheet gid={task.source_gid} row={task.source_row} />
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-3">
            <Field label="Target Uni" value={uni?.name} />
            <Field label="Team" value={task.team} />
            <Field label="Update Type" value={task.update_type} />
            <Field label="Category" value={task.category} />
            <Field label="Channel" value={task.channel} />
            <Field label="Content Type" value={task.content_type} />
            <Field label="Target Audience" value={task.target_audience} />
            <Field label="Publish At (IST)" value={fmtIST(task.publish_at)} />
            <Field label="Actual Publish" value={fmtIST(task.actual_publish_date)} />
          </dl>

          <div className="mt-6">
            <p className="eyebrow mb-2">Message / Content</p>
            <pre className="whitespace-pre-wrap rounded-xl border border-line bg-canvas p-4 font-display text-sm leading-relaxed text-ink">
              {task.message_content || "—"}
            </pre>
          </div>

          {task.special_instructions && (
            <div className="mt-5">
              <p className="eyebrow mb-2">Special Instructions</p>
              <p className="whitespace-pre-wrap text-sm text-ink">{task.special_instructions}</p>
            </div>
          )}

          {task.poster_drive_link && task.poster_drive_link !== "NA" && (
            <a
              href={task.poster_drive_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1 font-ui text-sm font-semibold text-accent hover:underline"
            >
              View poster ↗
            </a>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <form action={updateTask} className="mt-6 card p-6 sm:p-8">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="code" value={code} />
          <h2 className="font-ui text-sm font-semibold text-ink">Update status</h2>

          <label className="mt-4 block font-ui text-[10px] uppercase tracking-wider text-muted">
            Execution status
          </label>
          <select name="execution_status" defaultValue={task.execution_status} className="filter-input mt-1 w-full">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label className="mt-4 block font-ui text-[10px] uppercase tracking-wider text-muted">
            Issue / Blocker (optional)
          </label>
          <textarea name="issue_blocker" rows={2} defaultValue={task.issue_blocker ?? ""} className="filter-input mt-1 w-full" />

          <button className="mt-5 rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5">
            Save update
          </button>
          <p className="mt-2 text-xs text-muted">
            Marking <b className="text-ink">published</b> stamps the actual publish time automatically.
          </p>
        </form>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="mt-6 card p-6 sm:p-8">
          <p className="eyebrow mb-1">Manual reminder</p>
          <p className="mb-4 font-ui text-sm text-muted">
            Push a WhatsApp reminder to this university&apos;s BOAs right now — regardless of the
            automatic schedule.
          </p>
          <SendNowButton taskId={task.id} code={code} />
        </div>
      </Reveal>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="font-ui text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}
