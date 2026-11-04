import type { GroupBy, Issue, IssueState, ViewConfig, ViewKind } from "@zhizhi/shared";
import { Button, Empty, Kbd, Segmented } from "@zhizhi/ui/ui";
import {
  Bookmark,
  CalendarDays,
  ChartGantt,
  Columns3,
  List,
  Plus,
  Save,
  SearchX,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useIssueHotkeys } from "@/hooks/useIssueHotkeys";
import { PRIORITIES, STATE_GROUP_LABEL } from "@/lib/constants";
import {
  DEFAULT_CONFIG,
  decodeConfig,
  encodeConfig,
  filterCount,
  filterIssues,
  groupIssues,
  normalizeConfig,
  sortIssues,
  today,
} from "@/lib/issueView";
import { useAuth } from "@/stores/auth";
import { useIssues } from "@/stores/issues";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import { useViews } from "@/stores/views";
import { useWorkspace } from "@/stores/workspace";
import { DisplayMenu, FilterBar, SaveViewPopover } from "./FilterBar";
import { IssueBoard } from "./IssueBoard";
import { IssueCalendar } from "./IssueCalendar";
import { IssueDetail } from "./IssueDetail";
import { IssueList } from "./IssueList";
import { IssueTable } from "./IssueTable";
import { IssueTimeline } from "./IssueTimeline";
import { Avatar, LabelDot, PriorityIcon, StateIcon } from "./icons";

const VIEW_OPTIONS: { value: ViewKind; icon: ReactNode; label: string }[] = [
  { value: "list", icon: <List size={14} />, label: "列表" },
  { value: "board", icon: <Columns3 size={14} />, label: "看板" },
  { value: "table", icon: <Table2 size={14} />, label: "表格" },
  { value: "calendar", icon: <CalendarDays size={14} />, label: "日历" },
  { value: "timeline", icon: <ChartGantt size={14} />, label: "时间线" },
];

/**
 * 任务视图容器：筛选、排序、分组、五种视图切换、j/k 导航与侧边详情。
 * 配置以 URL 为准，链接可分享；保存的视图是基准，URL 里只放和基准不同的部分。
 * states 传入时按项目状态分组；否则（跨项目视图）按状态分组类型汇总。
 */
export function IssuesView({
  title,
  icon,
  issues,
  states,
  projectId,
  emptyText,
}: {
  title: ReactNode;
  icon: ReactNode;
  issues: Issue[];
  states?: IssueState[];
  /** 传入时支持保存视图。 */
  projectId?: string;
  emptyText: string;
}) {
  const ui = useUi();
  const projects = useWorkspace((s) => s.projects);
  const members = useWorkspace((s) => s.members);
  const meta = useIssues((s) => s.meta);
  const me = useAuth((s) => s.user?.id);
  const [params, setParams] = useSearchParams();

  const viewId = params.get("view");
  const projectViews = useViews((s) => (projectId ? s.byProject[projectId] : undefined));
  const saved = viewId ? projectViews?.find((v) => v.id === viewId) : undefined;
  // 视图列表还没回来时不能把 URL 当成最终状态，否则会把默认值写回去盖掉保存的配置。
  const pendingView = !!viewId && !!projectId && !projectViews;
  const base = useMemo(() => (saved ? normalizeConfig(saved.config) : DEFAULT_CONFIG), [saved]);
  const decoded = useMemo(() => decodeConfig(params, base), [params, base]);
  const config: ViewConfig = useMemo(
    () => ({ ...decoded, kind: ui.viewMode }),
    [decoded, ui.viewMode],
  );

  const write = (next: ViewConfig) => {
    const p = encodeConfig(next, base);
    if (viewId) p.set("view", viewId);
    setParams(p, { replace: true });
  };
  const patch = (c: Partial<ViewConfig>) => {
    if (c.kind) ui.set({ viewMode: c.kind });
    write({ ...config, ...c });
  };

  // 视图类型同时由快捷键和命令面板驱动，存在 ui store 里，这里和 URL 双向同步。
  const urlKind = params.get("kind") ?? (saved ? base.kind : null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只响应 URL 或保存视图的变化
  useEffect(() => {
    if (pendingView || !urlKind) return;
    if (urlKind !== useUi.getState().viewMode) ui.set({ viewMode: urlKind as ViewKind });
  }, [urlKind, saved?.id, pendingView]);
  // 读 getState 而不是闭包：上面的 effect 可能在同一轮刚改过 store。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只响应视图类型变化，见上
  useEffect(() => {
    if (pendingView) return;
    const mode = useUi.getState().viewMode;
    if ((urlKind ?? base.kind) !== mode) write({ ...decoded, kind: mode });
  }, [ui.viewMode]);

  const groupOf = useCallback(
    (i: Issue) => meta[i.project_id]?.states.find((s) => s.id === i.state_id)?.group,
    [meta],
  );

  const filtered = useMemo(
    () => filterIssues(issues, config.filter, { groupOf, today: today() }),
    [issues, config.filter, groupOf],
  );
  const sorted = useMemo(
    () => sortIssues(filtered, config.sortBy, config.sortDesc),
    [filtered, config.sortBy, config.sortDesc],
  );

  const scopeLabels = useMemo(() => {
    const ids = projectId ? [projectId] : [...new Set(issues.map((i) => i.project_id))];
    return ids.flatMap((id) => meta[id]?.labels ?? []);
  }, [projectId, issues, meta]);

  const groupBy: GroupBy =
    config.kind === "list" || config.kind === "board" ? config.groupBy : "none";
  const groups = useMemo(
    () =>
      groupIssues(sorted, groupBy, {
        groupOf,
        today: today(),
        states,
        statesOf: (p) => meta[p]?.states ?? [],
        members,
        labels: scopeLabels,
        // 看板的空列也是拖放落点；项目的状态分组保留空组，方便直接在组里新建。
        keepEmpty: config.kind === "board" || (groupBy === "state" && !!states),
      }),
    [sorted, groupBy, groupOf, states, meta, members, scopeLabels, config.kind],
  );

  const flat = useMemo(
    () => [...new Set(groups.flatMap((g) => g.issues.map((i) => i.id)))],
    [groups],
  );

  // 离开视图时清理选中态
  useEffect(() => () => useUi.getState().set({ focusedId: null, peekId: null }), []);

  // 动画没被看到（任务被筛掉、视图没有高亮）时也要清掉，否则切视图后会迟到地闪一下。
  useEffect(() => {
    if (!ui.flashId) return;
    const t = setTimeout(() => useUi.getState().set({ flashId: null }), 1300);
    return () => clearTimeout(t);
  }, [ui.flashId]);

  const count = filterCount(config.filter);
  const [filterOpen, setFilterOpen] = useState(count > 0);
  const filterRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (filterOpen) filterRef.current?.focus();
  }, [filterOpen]);
  // 切到带筛选条件的视图时自动展开，用户才知道结果为什么变少了。
  useEffect(() => {
    if (count > 0) setFilterOpen(true);
  }, [count]);

  const [displayAnchor, setDisplayAnchor] = useState<HTMLElement | null>(null);
  const [saveAnchor, setSaveAnchor] = useState<HTMLElement | null>(null);
  const createView = useViews((s) => s.create);
  const updateView = useViews((s) => s.update);
  const dirty = !!saved && JSON.stringify(config) !== JSON.stringify(base);
  const canSave =
    !saved && params.toString() !== "" && JSON.stringify(config) !== JSON.stringify(DEFAULT_CONFIG);

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

  const filterOptions = useMemo(
    () => ({
      states: states
        ? states.map((s) => ({
            id: s.id,
            label: s.name,
            icon: <StateIcon group={s.group} color={s.color} />,
          }))
        : (Object.entries(STATE_GROUP_LABEL) as [keyof typeof STATE_GROUP_LABEL, string][]).map(
            ([g, label]) => ({
              id: g,
              label,
              icon: <StateIcon group={g} color="#71717a" />,
            }),
          ),
      priorities: PRIORITIES.map((p) => ({
        id: p.key,
        label: p.key === "none" ? "无优先级" : p.label,
        icon: <PriorityIcon priority={p.key} />,
      })),
      assignees: [
        { id: "none", label: "未指派" },
        ...members.map((m) => ({
          id: m.id,
          label: m.id === me ? `${m.name}（我）` : m.name,
          keywords: m.email,
          icon: <Avatar name={m.name} size={16} />,
        })),
      ],
      labels: scopeLabels.map((l) => ({
        id: l.id,
        label: l.name,
        icon: <LabelDot color={l.color} />,
      })),
    }),
    [states, members, me, scopeLabels],
  );

  const body = () => {
    const empty = filtered.length === 0;
    // 日历和时间线即使筛选后为空也保留网格：它们同时是拖放和新建的入口。
    if (empty && (config.kind === "list" || config.kind === "table" || config.kind === "board")) {
      return (
        <Empty
          icon={<SearchX size={18} />}
          title="没有符合筛选条件的任务"
          desc="换个条件试试，或者清除筛选"
          action={
            <Button onClick={() => patch({ filter: DEFAULT_CONFIG.filter })}>清除筛选</Button>
          }
        />
      );
    }
    switch (config.kind) {
      case "list":
        return (
          <IssueList
            groups={groups}
            projects={projects}
            onOpen={open}
            onQuickCreate={states ? quickCreate : undefined}
          />
        );
      case "board":
        return (
          <IssueBoard
            groups={groups}
            projects={projects}
            onOpen={open}
            onQuickCreate={states ? quickCreate : undefined}
            manual={config.sortBy === "manual"}
          />
        );
      case "table":
        return (
          <IssueTable
            issues={sorted}
            projects={projects}
            columns={config.columns}
            sortBy={config.sortBy}
            sortDesc={config.sortDesc}
            onSort={(sortBy, sortDesc) => patch({ sortBy, sortDesc })}
            onOpen={open}
          />
        );
      case "calendar":
        return <IssueCalendar issues={sorted} onOpen={open} />;
      case "timeline":
        return <IssueTimeline issues={sorted} projects={projects} onOpen={open} />;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200/80 px-5">
        <span className="text-zinc-400">{icon}</span>
        <h1 className="truncate text-[14px] font-medium">{title}</h1>
        {saved && (
          <span className="inline-flex min-w-0 items-center gap-1 text-[13px] text-zinc-500">
            <span className="text-zinc-300">/</span>
            <Bookmark size={12} className="shrink-0" />
            <span className="truncate">{saved.name}</span>
          </span>
        )}
        <span className="text-[13px] tabular-nums text-zinc-400">{filtered.length}</span>
        <span className="flex-1" />
        {dirty && saved && (
          <>
            <Button
              variant="ghost"
              onClick={() => setParams({ view: saved.id }, { replace: true })}
            >
              还原
            </Button>
            <Button
              onClick={async () => {
                try {
                  await updateView(saved, { config });
                  setParams({ view: saved.id }, { replace: true });
                  toast.success("视图已更新");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Save size={13} /> 更新视图
            </Button>
          </>
        )}
        {projectId && canSave && (
          <Button variant="ghost" onClick={(e) => setSaveAnchor(e.currentTarget)}>
            <Bookmark size={13} /> 保存为视图
          </Button>
        )}
        <Button
          variant={count ? "secondary" : "ghost"}
          onClick={() => setFilterOpen((o) => !o)}
          title="筛选 (F)"
        >
          <SlidersHorizontal size={13} /> 筛选
          {count > 0 && (
            <span className="rounded bg-accent px-1 text-[10px] tabular-nums text-white">
              {count}
            </span>
          )}
        </Button>
        <Button variant="ghost" onClick={(e) => setDisplayAnchor(e.currentTarget)}>
          显示
        </Button>
        <Segmented
          value={config.kind}
          options={VIEW_OPTIONS}
          onChange={(kind) => patch({ kind })}
        />
        <Button variant="primary" onClick={() => ui.set({ createOpen: true })}>
          <Plus size={14} /> 新建任务{" "}
          <Kbd className="border-white/20 bg-white/10 text-white/80">C</Kbd>
        </Button>
      </header>

      {filterOpen && (
        <FilterBar
          filter={config.filter}
          onChange={(filter) => patch({ filter })}
          options={filterOptions}
          inputRef={filterRef}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {issues.length === 0 && config.kind !== "calendar" && config.kind !== "timeline" ? (
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
        ) : (
          body()
        )}
        {ui.peekId && (
          <div className="w-[min(720px,55vw)] shrink-0 animate-drawer border-l border-zinc-200 shadow-[-8px_0_24px_-12px_rgb(0_0_0/0.08)]">
            <IssueDetail issueId={ui.peekId} mode="peek" />
          </div>
        )}
      </div>

      {displayAnchor && (
        <DisplayMenu
          anchor={displayAnchor}
          config={config}
          onChange={patch}
          onClose={() => setDisplayAnchor(null)}
        />
      )}
      {saveAnchor && projectId && (
        <SaveViewPopover
          anchor={saveAnchor}
          onClose={() => setSaveAnchor(null)}
          onSave={async (name) => {
            try {
              const v = await createView(projectId, name, config);
              setParams({ view: v.id }, { replace: true });
              toast.success(`已保存视图「${name}」`);
            } catch (e) {
              toast.error((e as Error).message);
              throw e;
            }
          }}
        />
      )}
    </div>
  );
}
