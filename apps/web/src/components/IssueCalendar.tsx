import type { Issue, IssuePatch } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { Button, IconButton } from "@zhizhi/ui/ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, diffDays, monthGrid, today } from "@/lib/issueView";
import { useIssues } from "@/stores/issues";
import { useUi } from "@/stores/ui";
import { PriorityIcon } from "./icons";

const WEEK = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MAX_IN_CELL = 4;

/** 改期时开始日期一起平移，否则可能晚于新的截止日期被服务端拒绝。 */
export function reschedule(issue: Issue, due: string): IssuePatch {
  if (issue.due_date && issue.start_date) {
    return {
      due_date: due,
      start_date: addDays(issue.start_date, diffDays(due, issue.due_date)),
    };
  }
  if (issue.start_date && issue.start_date > due) return { due_date: due, start_date: due };
  return { due_date: due };
}

/** 日历视图：按截止日期排布，拖动改期；没有截止日期的任务放在右侧，拖进格子即排期。 */
export function IssueCalendar({
  issues,
  onOpen,
}: {
  issues: Issue[];
  onOpen: (id: string) => void;
}) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [over, setOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const update = useIssues((s) => s.update);
  const byId = useIssues((s) => s.byId);
  const set = useUi((s) => s.set);
  const days = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const todayStr = today();

  const byDay = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of issues) {
      if (!i.due_date) continue;
      map.set(i.due_date, [...(map.get(i.due_date) ?? []), i]);
    }
    return map;
  }, [issues]);
  const undated = issues.filter((i) => !i.due_date);

  const shift = (n: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const drop = (e: React.DragEvent, day: string) => {
    e.preventDefault();
    setOver(null);
    const issue = byId[e.dataTransfer.getData("text/issue")];
    if (issue && issue.due_date !== day) update(issue.id, reschedule(issue, day));
  };

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-zinc-100 px-4">
          <span className="mr-2 text-sm font-semibold tabular-nums">
            {cursor.y} 年 {cursor.m + 1} 月
          </span>
          <IconButton aria-label="上个月" onClick={() => shift(-1)}>
            <ChevronLeft size={15} />
          </IconButton>
          <IconButton aria-label="下个月" onClick={() => shift(1)}>
            <ChevronRight size={15} />
          </IconButton>
          <Button
            variant="ghost"
            onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}
          >
            今天
          </Button>
        </div>
        <div className="grid shrink-0 grid-cols-7 border-b border-zinc-100 text-xs text-zinc-400">
          {WEEK.map((w) => (
            <div key={w} className="px-2 py-1.5">
              {w}
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
          {days.map((day) => {
            const inMonth = Number(day.slice(5, 7)) === cursor.m + 1;
            const list = byDay.get(day) ?? [];
            const open = expanded === day;
            const shown = open ? list : list.slice(0, MAX_IN_CELL);
            return (
              // 拖放落点：键盘用户可以用 D 键改截止日期。
              // biome-ignore lint/a11y/noStaticElementInteractions: 见上
              <div
                key={day}
                data-day={day}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (over !== day) setOver(day);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                }}
                onDrop={(e) => drop(e, day)}
                className={cn(
                  "group min-h-24 min-w-0 border-r border-b border-zinc-100 p-1 transition-colors duration-100",
                  !inMonth && "bg-zinc-50/70",
                  over === day && "bg-accent-soft",
                )}
              >
                <div className="flex items-center justify-between px-1 pb-0.5">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                      inMonth ? "text-zinc-600" : "text-zinc-300",
                      day === todayStr && "bg-accent font-medium text-white",
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  <button
                    type="button"
                    aria-label={`新建 ${day} 截止的任务`}
                    onClick={() => set({ createOpen: true, createDue: day })}
                    className="press hidden rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 group-hover:block"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <div className="space-y-0.5">
                  {shown.map((i) => (
                    <Chip key={i.id} issue={i} onOpen={onOpen} />
                  ))}
                  {list.length > MAX_IN_CELL && (
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : day)}
                      className="w-full rounded px-1 text-left text-xs text-zinc-500 hover:bg-zinc-100"
                    >
                      {open ? "收起" : `还有 ${list.length - MAX_IN_CELL} 个`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <aside className="flex w-56 shrink-0 flex-col border-l border-zinc-100 bg-zinc-50/50">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3 text-xs font-medium text-zinc-500">
          未排期 <span className="font-normal text-zinc-400">{undated.length}</span>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {undated.map((i) => (
            <Chip key={i.id} issue={i} onOpen={onOpen} />
          ))}
          {undated.length === 0 && (
            <p className="px-1 text-xs text-zinc-400">所有任务都有截止日期了。</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Chip({ issue, onOpen }: { issue: Issue; onOpen: (id: string) => void }) {
  const st = useIssues((s) =>
    s.meta[issue.project_id]?.states.find((x) => x.id === issue.state_id),
  );
  const closed = st?.group === "completed" || st?.group === "cancelled";
  return (
    <button
      type="button"
      draggable
      data-issue={issue.id}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/issue", issue.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(issue.id)}
      title={issue.title}
      className="press flex w-full min-w-0 items-center gap-1 rounded bg-white px-1.5 py-0.5 text-left text-xs shadow-card hover:bg-zinc-50"
    >
      <span
        className="h-3 w-0.5 shrink-0 rounded-full"
        style={{ background: st?.color ?? "#a1a1aa" }}
      />
      <PriorityIcon priority={issue.priority} size={11} />
      <span className={cn("truncate text-zinc-700", closed && "text-zinc-400 line-through")}>
        {issue.title}
      </span>
    </button>
  );
}
