import type { Issue, IssueState, Priority } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { Button, Empty, Kbd } from "@zhizhi/ui/ui";
import { Columns3, List, Plus, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useIssueHotkeys } from "@/hooks/useIssueHotkeys";
import { PRIORITIES } from "@/lib/constants";
import { useAuth } from "@/stores/auth";
import { useIssues } from "@/stores/issues";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { IssueBoard } from "./IssueBoard";
import { IssueDetail } from "./IssueDetail";
import { type IssueGroup, IssueList } from "./IssueList";
import { PriorityIcon } from "./icons";

type Filter = { priority: Priority[]; mine: boolean; hideClosed: boolean; text: string };
const EMPTY_FILTER: Filter = { priority: [], mine: false, hideClosed: false, text: "" };
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/**
 * 任务视图容器：负责筛选、按状态分组、列表/看板切换、j/k 键盘导航与侧边详情面板。
 * states 传入时按项目状态分组；否则（跨项目视图）按状态分组类型汇总。
 */
export function IssuesView({
  title,
  icon,
  issues,
  states,
  emptyText,
}: {
  title: ReactNode;
  icon: ReactNode;
  issues: Issue[];
  states?: IssueState[];
  emptyText: string;
}) {
  const ui = useUi();
  const projects = useWorkspace((s) => s.projects);
  const meta = useIssues((s) => s.meta);
  const me = useAuth((s) => s.user?.id);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.text.trim().toLowerCase();
    return issues.filter((i) => {
      if (filter.priority.length && !filter.priority.includes(i.priority)) return false;
      if (filter.mine && i.assignee_id !== me) return false;
      if (filter.hideClosed) {
        const g = meta[i.project_id]?.states.find((s) => s.id === i.state_id)?.group;
        if (g === "completed" || g === "cancelled") return false;
      }
      if (q && !i.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [issues, filter, me, meta]);

  const groups = useMemo<IssueGroup[]>(() => {
    if (states) {
      return states.map((st) => ({
        key: st.id,
        title: st.name,
        state: st,
        issues: filtered
          .filter((i) => i.state_id === st.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }));
    }
    // 跨项目：按状态分组类型归并，并以优先级排序
    const order = ["started", "unstarted", "backlog", "completed", "cancelled"] as const;
    const names = {
      started: "进行中",
      unstarted: "待处理",
      backlog: "待规划",
      completed: "已完成",
      cancelled: "已取消",
    };
    return order
      .map((grp) => {
        const list = filtered
          .filter((i) => meta[i.project_id]?.states.find((s) => s.id === i.state_id)?.group === grp)
          .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
        const sample = list[0] && meta[list[0].project_id]?.states.find((s) => s.group === grp);
        return {
          key: grp,
          title: names[grp],
          state: sample ? { ...sample, name: names[grp] } : undefined,
          issues: list,
        };
      })
      .filter((g) => g.issues.length > 0);
  }, [filtered, states, meta]);

  const flat = useMemo(() => groups.flatMap((g) => g.issues.map((i) => i.id)), [groups]);

  // 离开视图时清理选中态
  useEffect(() => () => useUi.getState().set({ focusedId: null, peekId: null }), []);

  // 打开筛选栏时把焦点交给输入框，避免用户还要再点一次。
  const filterRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (filterOpen) filterRef.current?.focus();
  }, [filterOpen]);

  const move = (d: 1 | -1) => {
    if (!flat.length) return;
    const { focusedId, peekId } = useUi.getState();
    const cur = flat.indexOf(focusedId ?? "");
    const next =
      flat[
        cur === -1
          ? d === 1
            ? 0
            : flat.length - 1
          : Math.min(Math.max(cur + d, 0), flat.length - 1)
      ];
    ui.set({ focusedId: next, peekId: peekId ? next : null });
  };
  const overlay = () => {
    const u = useUi.getState();
    return u.paletteOpen || u.createOpen || u.helpOpen || !!u.picker;
  };
  useHotkeys({
    j: () => !overlay() && move(1),
    k: () => !overlay() && move(-1),
    // biome-ignore lint/complexity/useLiteralKeys: 大写键名会被误判为组件定义
    ["ArrowDown"]: () => !overlay() && move(1),
    // biome-ignore lint/complexity/useLiteralKeys: 大写键名会被误判为组件定义
    ["ArrowUp"]: () => !overlay() && move(-1),
    // biome-ignore lint/complexity/useLiteralKeys: 大写键名会被误判为组件定义
    ["Enter"]: () => {
      const { focusedId } = useUi.getState();
      if (!overlay() && focusedId) ui.set({ peekId: focusedId });
    },
    // biome-ignore lint/complexity/useLiteralKeys: 大写键名会被误判为组件定义
    ["Escape"]: () => {
      if (overlay()) return;
      const u = useUi.getState();
      if (u.peekId) ui.set({ peekId: null });
      else if (u.focusedId) ui.set({ focusedId: null });
    },
    f: () => !overlay() && setFilterOpen((o) => !o),
  });
  useIssueHotkeys({ onEditTitle: () => window.dispatchEvent(new Event("zhizhi:edit-title")) });

  const open = (id: string) => ui.set({ focusedId: id, peekId: id });
  const quickCreate = (stateId: string) => ui.set({ createOpen: true, createStateId: stateId });
  const filterCount =
    filter.priority.length +
    (filter.mine ? 1 : 0) +
    (filter.hideClosed ? 1 : 0) +
    (filter.text ? 1 : 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200/80 px-5">
        <span className="text-zinc-400">{icon}</span>
        <h1 className="truncate text-[14px] font-medium">{title}</h1>
        <span className="text-[13px] text-zinc-400">{filtered.length}</span>
        <span className="flex-1" />
        <Button
          variant={filterCount ? "secondary" : "ghost"}
          onClick={() => setFilterOpen((o) => !o)}
          title="筛选 (F)"
        >
          <SlidersHorizontal size={13} /> 筛选
          {filterCount > 0 && (
            <span className="rounded bg-zinc-900 px-1 text-[10px] text-white">{filterCount}</span>
          )}
        </Button>
        <div className="flex rounded-md border border-zinc-200 p-0.5" title="切换视图 (V)">
          {(["list", "board"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => ui.set({ viewMode: m })}
              className={cn(
                "flex h-6 w-7 items-center justify-center rounded text-zinc-500",
                ui.viewMode === m && "bg-zinc-100 text-zinc-900",
              )}
            >
              {m === "list" ? <List size={14} /> : <Columns3 size={14} />}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => ui.set({ createOpen: true })}>
          <Plus size={14} /> 新建任务{" "}
          <Kbd className="border-white/20 bg-white/10 text-white/80">C</Kbd>
        </Button>
      </header>

      {filterOpen && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/80 bg-zinc-50/60 px-5 py-2">
          <input
            ref={filterRef}
            value={filter.text}
            onChange={(e) => setFilter({ ...filter, text: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLElement).blur()}
            placeholder="按标题筛选…"
            className="h-7 w-48 rounded-md border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-zinc-400"
          />
          {PRIORITIES.map((p) => {
            const on = filter.priority.includes(p.key);
            return (
              <button
                type="button"
                key={p.key}
                onClick={() =>
                  setFilter({
                    ...filter,
                    priority: on
                      ? filter.priority.filter((x) => x !== p.key)
                      : [...filter.priority, p.key],
                  })
                }
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs",
                  on
                    ? "border-zinc-400 bg-white text-zinc-900"
                    : "border-zinc-200 text-zinc-500 hover:bg-white",
                )}
              >
                <PriorityIcon priority={p.key} size={12} /> {p.label}
              </button>
            );
          })}
          <Toggle on={filter.mine} onClick={() => setFilter({ ...filter, mine: !filter.mine })}>
            仅我负责的
          </Toggle>
          <Toggle
            on={filter.hideClosed}
            onClick={() => setFilter({ ...filter, hideClosed: !filter.hideClosed })}
          >
            隐藏已完成
          </Toggle>
          {filterCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter(EMPTY_FILTER)}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
            >
              <X size={12} /> 清除
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {issues.length === 0 ? (
          <Empty
            icon={icon}
            title={emptyText}
            desc="按 C 快速创建一个任务"
            action={
              <Button variant="primary" onClick={() => ui.set({ createOpen: true })}>
                <Plus size={14} /> 新建任务
              </Button>
            }
          />
        ) : ui.viewMode === "list" ? (
          <IssueList
            groups={groups}
            projects={projects}
            onOpen={open}
            onQuickCreate={states ? quickCreate : undefined}
          />
        ) : (
          <IssueBoard
            groups={groups}
            projects={projects}
            onOpen={open}
            onQuickCreate={states ? quickCreate : undefined}
          />
        )}
        {ui.peekId && (
          <div className="w-[min(720px,55vw)] shrink-0 animate-in border-l border-zinc-200 shadow-[-8px_0_24px_-12px_rgb(0_0_0/0.08)]">
            <IssueDetail issueId={ui.peekId} mode="peek" />
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2 text-xs",
        on
          ? "border-zinc-400 bg-white text-zinc-900"
          : "border-zinc-200 text-zinc-500 hover:bg-white",
      )}
    >
      {children}
    </button>
  );
}
