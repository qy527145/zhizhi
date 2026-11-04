import type { Issue } from "@zhizhi/shared";
import { CalendarClock, CalendarDays, UserRound } from "lucide-react";
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

// 看板卡片上的属性按钮比列表里小一号：卡片的元信息行要能缩成一行，
// 而列表里的行有整行高度可以撑。dense 只改高度和字号，不改语义。
const propBtn =
  "inline-flex items-center gap-1 rounded-md text-xs text-zinc-500 transition hover:bg-zinc-200/60";

const sizeOf = (dense?: boolean) => (dense ? "h-4.5 px-0.5 text-[11px]" : "h-6 px-1");

export const StateButton = memo(function StateButton({
  issue,
  withLabel,
  dense,
}: {
  issue: Issue;
  withLabel?: boolean;
  dense?: boolean;
}) {
  const st = useIssues((s) =>
    s.meta[issue.project_id]?.states.find((x) => x.id === issue.state_id),
  );
  if (!st) return <span className="size-3.5" />;
  return (
    <button
      type="button"
      className={cn(propBtn, sizeOf(dense))}
      onClick={openPicker("state", issue.id)}
      title={`状态：${st.name}`}
    >
      <StateIcon group={st.group} color={st.color} size={dense ? 12 : 14} />
      {withLabel && <span className="text-zinc-700">{st.name}</span>}
    </button>
  );
});

export function PriorityButton({
  issue,
  withLabel,
  dense,
}: {
  issue: Issue;
  withLabel?: boolean;
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(propBtn, sizeOf(dense))}
      onClick={openPicker("priority", issue.id)}
      title={`优先级：${priorityMeta(issue.priority).label}`}
    >
      <PriorityIcon priority={issue.priority} size={dense ? 12 : 14} />
      {withLabel && (
        <span className="text-zinc-700">
          {issue.priority === "none" ? "无优先级" : priorityMeta(issue.priority).label}
        </span>
      )}
    </button>
  );
}

export function AssigneeButton({
  issue,
  withLabel,
  dense,
}: {
  issue: Issue;
  withLabel?: boolean;
  dense?: boolean;
}) {
  const m = useWorkspace((s) => s.members.find((x) => x.id === issue.assignee_id));
  return (
    <button
      type="button"
      className={cn(propBtn, sizeOf(dense))}
      onClick={openPicker("assignee", issue.id)}
      title={m ? `负责人：${m.name}` : "未指派"}
    >
      {m ? (
        <Avatar name={m.name} size={dense ? 16 : 18} />
      ) : (
        <UserRound size={dense ? 12 : 14} className="text-zinc-400" />
      )}
      {withLabel && (
        <span className={m ? "text-zinc-700" : "text-zinc-400"}>{m?.name ?? "未指派"}</span>
      )}
    </button>
  );
}

export function DueButton({
  issue,
  withLabel,
  dense,
}: {
  issue: Issue;
  withLabel?: boolean;
  dense?: boolean;
}) {
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
        sizeOf(dense),
        "border border-zinc-200",
        dense ? "px-1" : "px-1.5",
        overdue && "border-red-200 text-red-600",
        withLabel && "border-0 px-1",
      )}
      onClick={openPicker("due", issue.id)}
    >
      <CalendarDays size={dense ? 10 : 12} />
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

export function StartButton({ issue }: { issue: Issue }) {
  return (
    <button
      type="button"
      className={propBtn}
      onClick={openPicker("start", issue.id)}
      title="开始日期"
    >
      <CalendarClock size={12} />
      <span className={issue.start_date ? "text-zinc-700" : "text-zinc-400"}>
        {issue.start_date ? formatDue(issue.start_date) : "无开始日期"}
      </span>
    </button>
  );
}

export function LabelChips({
  issue,
  max = 3,
  dense,
}: {
  issue: Issue;
  max?: number;
  dense?: boolean;
}) {
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
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-zinc-200 text-[11px] text-zinc-600",
            dense ? "h-4.5 px-1.5" : "h-6 px-2",
          )}
        >
          <LabelDot color={l.color} />
          {l.name}
        </span>
      ))}
      {list.length > max && <span className="text-xs text-zinc-400">+{list.length - max}</span>}
    </button>
  );
}
