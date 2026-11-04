import type { Issue, IssuePatch, Project } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, diffDays, today, weekday } from "@/lib/issueView";
import { useIssues } from "@/stores/issues";
import { useUi } from "@/stores/ui";
import { StateIcon } from "./icons";

const DAY_W = 34;
const ROW_H = 36;
const LEFT_W = 260;

type DragMode = "move" | "start" | "end";

/** 把拖动结果换算成字段修改。只有单个日期的任务整体平移时不凭空多出另一个日期。 */
export function timelinePatch(issue: Issue, mode: DragMode, days: number): IssuePatch {
  const start = issue.start_date ?? issue.due_date;
  const end = issue.due_date ?? issue.start_date;
  if (!start || !end) return {};
  if (mode === "move") {
    const patch: IssuePatch = {};
    if (issue.start_date) patch.start_date = addDays(issue.start_date, days);
    if (issue.due_date) patch.due_date = addDays(issue.due_date, days);
    return patch;
  }
  // 调整边缘时补全两个日期：拉出时长之后任务就有了明确的起止。
  return mode === "start"
    ? { start_date: addDays(start, days), due_date: end }
    : { start_date: start, due_date: addDays(end, days) };
}

/** 时间线视图：按开始和截止日期画条，拖动整体改期、拖动两端改时长；未排期的在右侧，拖进来排期。 */
export function IssueTimeline({
  issues,
  projects,
  onOpen,
}: {
  issues: Issue[];
  projects: Project[];
  onOpen: (id: string) => void;
}) {
  const update = useIssues((s) => s.update);
  const byId = useIssues((s) => s.byId);
  const focusedId = useUi((s) => s.focusedId);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const todayStr = today();

  const dated = useMemo(
    () =>
      issues
        .filter((i) => i.start_date || i.due_date)
        .sort((a, b) =>
          (a.start_date ?? a.due_date ?? "").localeCompare(b.start_date ?? b.due_date ?? ""),
        ),
    [issues],
  );
  const undated = issues.filter((i) => !i.start_date && !i.due_date);

  const { first, count } = useMemo(() => {
    let lo = addDays(todayStr, -14);
    let hi = addDays(todayStr, 45);
    for (const i of dated) {
      for (const d of [i.start_date, i.due_date]) {
        if (d && d < lo) lo = d;
        if (d && d > hi) hi = d;
      }
    }
    const firstDay = addDays(lo, -7);
    return { first: firstDay, count: diffDays(hi, firstDay) + 15 };
  }, [dated, todayStr]);
  const days = useMemo(
    () => Array.from({ length: count }, (_, i) => addDays(first, i)),
    [first, count],
  );

  // 打开时把今天滚到可视区，只做一次，之后不跟随数据变化跳动。
  const initial = useRef(diffDays(todayStr, first));
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = initial.current * DAY_W - 120;
  }, []);

  const todayIdx = diffDays(todayStr, first);
  const height = Math.max(dated.length, 1) * ROW_H;

  return (
    <div className="flex min-w-0 flex-1">
      <div ref={scroller} className="min-w-0 flex-1 overflow-auto">
        <div style={{ width: LEFT_W + count * DAY_W }}>
          <div className="sticky top-0 z-20 flex h-10 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center border-r border-zinc-100 bg-white px-4 text-xs font-medium text-zinc-500"
              style={{ width: LEFT_W }}
            >
              任务
            </div>
            {days.map((d) => {
              const firstOfMonth = d.endsWith("-01") || d === first;
              return (
                <div
                  key={d}
                  className={cn(
                    "relative flex shrink-0 items-end justify-center pb-1 text-[10px] tabular-nums text-zinc-400",
                    weekday(d) >= 5 && "text-zinc-300",
                    d === todayStr && "font-semibold text-accent",
                  )}
                  style={{ width: DAY_W }}
                >
                  {firstOfMonth && (
                    <span className="absolute top-0.5 left-1 whitespace-nowrap text-[11px] font-medium text-zinc-600">
                      {Number(d.slice(5, 7))} 月
                    </span>
                  )}
                  {Number(d.slice(8))}
                </div>
              );
            })}
          </div>

          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 bg-white" style={{ width: LEFT_W }}>
              {dated.map((i) => (
                <TitleCell
                  key={i.id}
                  issue={i}
                  id={`${projectById[i.project_id]?.identifier}-${i.seq}`}
                  focused={focusedId === i.id}
                  onOpen={onOpen}
                />
              ))}
            </div>
            {/* 拖放落点：键盘用户可以用 D 键设置日期。 */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: 见上 */}
            <div
              ref={grid}
              data-timeline-grid
              className="relative"
              style={{ width: count * DAY_W, height, minHeight: 240 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const issue = byId[e.dataTransfer.getData("text/issue")];
                const rect = grid.current?.getBoundingClientRect();
                if (!issue || !rect) return;
                const day = addDays(first, Math.floor((e.clientX - rect.left) / DAY_W));
                update(issue.id, { start_date: day, due_date: day });
              }}
            >
              {days.map(
                (d, idx) =>
                  weekday(d) >= 5 && (
                    <span
                      key={d}
                      className="absolute top-0 bottom-0 bg-zinc-50"
                      style={{ left: idx * DAY_W, width: DAY_W }}
                    />
                  ),
              )}
              <span
                className="absolute top-0 bottom-0 z-[1] w-px bg-accent/60"
                style={{ left: todayIdx * DAY_W + DAY_W / 2 }}
              />
              {dated.map((i, row) => (
                <Bar key={i.id} issue={i} row={row} first={first} onOpen={onOpen} />
              ))}
              {dated.length === 0 && (
                <p className="sticky left-4 inline-block p-4 text-xs text-zinc-400">
                  还没有排期的任务。把右侧的任务拖到这里，或者给任务设置开始和截止日期。
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <aside className="flex w-56 shrink-0 flex-col border-l border-zinc-100 bg-zinc-50/50">
        <div className="flex h-10 shrink-0 items-center gap-2 px-3 text-xs font-medium text-zinc-500">
          未排期 <span className="font-normal text-zinc-400">{undated.length}</span>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {undated.map((i) => (
            <button
              type="button"
              key={i.id}
              draggable
              data-issue={i.id}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/issue", i.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onOpen(i.id)}
              title={i.title}
              className="press block w-full truncate rounded bg-white px-2 py-1 text-left text-xs text-zinc-700 shadow-card hover:bg-zinc-50"
            >
              {i.title}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function TitleCell({
  issue,
  id,
  focused,
  onOpen,
}: {
  issue: Issue;
  id: string;
  focused: boolean;
  onOpen: (id: string) => void;
}) {
  const st = useIssues((s) =>
    s.meta[issue.project_id]?.states.find((x) => x.id === issue.state_id),
  );
  return (
    <button
      type="button"
      data-issue={issue.id}
      onClick={() => onOpen(issue.id)}
      className={cn(
        "flex w-full items-center gap-2 border-r border-b border-zinc-100 px-4 text-left text-[13px] text-zinc-800 hover:bg-zinc-50",
        focused && "bg-zinc-100/80",
      )}
      style={{ height: ROW_H }}
    >
      {st && <StateIcon group={st.group} color={st.color} size={13} />}
      <span className="shrink-0 font-mono text-[11px] text-zinc-400">{id}</span>
      <span className="truncate">{issue.title}</span>
    </button>
  );
}

function Bar({
  issue,
  row,
  first,
  onOpen,
}: {
  issue: Issue;
  row: number;
  first: string;
  onOpen: (id: string) => void;
}) {
  const update = useIssues((s) => s.update);
  const st = useIssues((s) =>
    s.meta[issue.project_id]?.states.find((x) => x.id === issue.state_id),
  );
  const [drag, setDrag] = useState<{ mode: DragMode; days: number } | null>(null);
  const origin = useRef(0);

  const start = issue.start_date ?? issue.due_date ?? first;
  const end = issue.due_date ?? issue.start_date ?? first;
  const span = diffDays(end, start);

  // 拖动中只预览，松手才提交，避免每移动一格都发一次请求。
  let from = diffDays(start, first);
  let len = span;
  if (drag?.mode === "move") from += drag.days;
  if (drag?.mode === "start") {
    from += drag.days;
    len -= drag.days;
  }
  if (drag?.mode === "end") len += drag.days;

  const clamp = (mode: DragMode, days: number) => {
    if (mode === "start") return Math.min(days, span);
    if (mode === "end") return Math.max(days, -span);
    return days;
  };

  const begin = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = e.clientX;
    setDrag({ mode, days: 0 });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const days = clamp(drag.mode, Math.round((e.clientX - origin.current) / DAY_W));
    if (days !== drag.days) setDrag({ ...drag, days });
  };
  const moved = useRef(false);
  const finish = () => {
    if (!drag) return;
    moved.current = Math.abs(drag.days) > 0;
    if (drag.days !== 0) update(issue.id, timelinePatch(issue, drag.mode, drag.days));
    setDrag(null);
  };

  const handle = "absolute top-0 bottom-0 z-10 w-2 cursor-ew-resize touch-none";
  return (
    // 条内有两个拖拽手柄，不能整体换成 <button>；键盘用户在左侧标题列打开任务。
    // biome-ignore lint/a11y/useSemanticElements: 见上
    <div
      data-bar={issue.id}
      className={cn(
        "absolute z-[2] flex touch-none items-center rounded-md px-2 text-[11px] font-medium whitespace-nowrap text-white shadow-card select-none",
        drag ? "cursor-grabbing opacity-90" : "cursor-grab",
      )}
      style={{
        left: from * DAY_W + 2,
        width: (len + 1) * DAY_W - 4,
        top: row * ROW_H + 6,
        height: ROW_H - 12,
        background: st?.color ?? "#71717a",
      }}
      onPointerDown={begin("move")}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={() => setDrag(null)}
      onClick={() => {
        // 拖动结束也会触发 click，只有没移动才算打开。
        if (!moved.current) onOpen(issue.id);
        moved.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(issue.id);
      }}
      role="button"
      tabIndex={-1}
      title={`${issue.title}（${start} → ${end}）`}
    >
      <span
        aria-hidden="true"
        data-handle="start"
        className={cn(handle, "left-0 rounded-l-md hover:bg-black/15")}
        onPointerDown={begin("start")}
        onPointerMove={move}
        onPointerUp={finish}
      />
      <span className="truncate">{issue.title}</span>
      <span
        aria-hidden="true"
        data-handle="end"
        className={cn(handle, "right-0 rounded-r-md hover:bg-black/15")}
        onPointerDown={begin("end")}
        onPointerMove={move}
        onPointerUp={finish}
      />
    </div>
  );
}
