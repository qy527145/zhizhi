import type { Issue } from "@zhizhi/shared";
import { CalendarDays, UserRound } from "lucide-react";
import { memo } from "react";
import { priorityMeta } from "@/lib/constants";
import { cn, formatDue, isOverdue } from "@/lib/utils";
import { useIssues } from "@/stores/issues";
import { type PickerKind, useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { Avatar, LabelDot, PriorityIcon, StateIcon } from "./icons";

const openPicker = (kind: PickerKind, issueId: string) => (e: React.MouseEvent) => {
  e.stopPropagation();
  useUi.getState().set({ picker: { kind, issueId } });
};

const propBtn =
  "inline-flex h-6 items-center gap-1 rounded-md px-1 text-xs text-zinc-500 transition hover:bg-zinc-200/70";

export const StateButton = memo(function StateButton({
  issue,
  withLabel,
}: {
  issue: Issue;
  withLabel?: boolean;
}) {
  const st = useIssues((s) =>
    s.meta[issue.project_id]?.states.find((x) => x.id === issue.state_id),
  );
  if (!st) return <span className="size-3.5" />;
  return (
    <button
      type="button"
      className={propBtn}
      onClick={openPicker("state", issue.id)}
      title={`状态：${st.name}`}
    >
      <StateIcon group={st.group} color={st.color} />
      {withLabel && <span className="text-zinc-700">{st.name}</span>}
    </button>
  );
});

export function PriorityButton({ issue, withLabel }: { issue: Issue; withLabel?: boolean }) {
  return (
    <button
      type="button"
      className={propBtn}
      onClick={openPicker("priority", issue.id)}
      title={`优先级：${priorityMeta(issue.priority).label}`}
    >
      <PriorityIcon priority={issue.priority} />
      {withLabel && (
        <span className="text-zinc-700">
          {issue.priority === "none" ? "无优先级" : priorityMeta(issue.priority).label}
        </span>
      )}
    </button>
  );
}

export function AssigneeButton({ issue, withLabel }: { issue: Issue; withLabel?: boolean }) {
  const m = useWorkspace((s) => s.members.find((x) => x.id === issue.assignee_id));
  return (
    <button
      type="button"
      className={propBtn}
      onClick={openPicker("assignee", issue.id)}
      title={m ? `负责人：${m.name}` : "未指派"}
    >
      {m ? <Avatar name={m.name} size={18} /> : <UserRound size={14} className="text-zinc-400" />}
      {withLabel && (
        <span className={m ? "text-zinc-700" : "text-zinc-400"}>{m?.name ?? "未指派"}</span>
      )}
    </button>
  );
}

export function DueButton({ issue, withLabel }: { issue: Issue; withLabel?: boolean }) {
  const st = useIssues((s) =>
    s.meta[issue.project_id]?.states.find((x) => x.id === issue.state_id),
  );
  const closed = st?.group === "completed" || st?.group === "cancelled";
  if (!issue.due_date && !withLabel) return null;
  const overdue = !closed && isOverdue(issue.due_date);
  return (
    <button
      type="button"
      className={cn(
        propBtn,
        "border border-zinc-200 px-1.5",
        overdue && "border-red-200 text-red-600",
        withLabel && "border-0 px-1",
      )}
      onClick={openPicker("due", issue.id)}
    >
      <CalendarDays size={12} />
      <span
        className={cn(
          withLabel && !issue.due_date && "text-zinc-400",
          withLabel && issue.due_date && "text-zinc-700",
        )}
      >
        {issue.due_date ? formatDue(issue.due_date) : "无截止日期"}
      </span>
    </button>
  );
}

export function LabelChips({ issue, max = 3 }: { issue: Issue; max?: number }) {
  const labels = useIssues((s) => s.meta[issue.project_id]?.labels);
  if (!labels || issue.label_ids.length === 0) return null;
  const list = issue.label_ids.map((id) => labels.find((l) => l.id === id)).filter((l) => !!l);
  return (
    <button
      type="button"
      className="flex items-center gap-1"
      onClick={openPicker("labels", issue.id)}
    >
      {list.slice(0, max).map((l) => (
        <span
          key={l.id}
          className="inline-flex h-6 items-center gap-1.5 rounded-full border border-zinc-200 px-2 text-xs text-zinc-600"
        >
          <LabelDot color={l.color} />
          {l.name}
        </span>
      ))}
      {list.length > max && <span className="text-xs text-zinc-400">+{list.length - max}</span>}
    </button>
  );
}
