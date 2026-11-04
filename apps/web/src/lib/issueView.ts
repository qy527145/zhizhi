import type {
  FilterDimension,
  GroupBy,
  Issue,
  IssueFilter,
  IssuePatch,
  IssueState,
  Label,
  Member,
  Priority,
  SortBy,
  StateGroup,
  TableColumn,
  ViewConfig,
  ViewKind,
} from "@zhizhi/shared";

/** 筛选、排序、分组与 URL 编解码。全部是纯函数，各视图和保存的视图共用同一套语义。 */

export const EMPTY_FILTER: IssueFilter = {
  states: [],
  priorities: [],
  assignees: [],
  labels: [],
  negate: [],
  text: "",
  due: "any",
  hideClosed: false,
};

export const ALL_COLUMNS: { key: TableColumn; label: string }[] = [
  { key: "state", label: "状态" },
  { key: "priority", label: "优先级" },
  { key: "assignee", label: "负责人" },
  { key: "labels", label: "标签" },
  { key: "start_date", label: "开始" },
  { key: "due_date", label: "截止" },
  { key: "updated_at", label: "更新于" },
];

export const DEFAULT_CONFIG: ViewConfig = {
  kind: "list",
  groupBy: "state",
  sortBy: "manual",
  sortDesc: false,
  columns: ["state", "priority", "assignee", "labels", "due_date"],
  filter: EMPTY_FILTER,
};

/** 保存的配置可能来自旧版本或 API，缺的字段用默认值补齐。 */
export function normalizeConfig(c: Partial<ViewConfig> | undefined): ViewConfig {
  return {
    ...DEFAULT_CONFIG,
    ...c,
    filter: { ...EMPTY_FILTER, ...c?.filter },
  };
}

// ---------- 日期（一律按本地日历日计算，用 UTC 做差以避开夏令时） ----------

export const toDay = (d: Date) => d.toLocaleDateString("sv-SE");
export const today = () => toDay(new Date());

function parts(day: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return [y, m, d];
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = parts(day);
  return toDay(new Date(y, m - 1, d + n));
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

/** 0 = 周一 … 6 = 周日。 */
export function weekday(day: string): number {
  const [y, m, d] = parts(day);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** 月历：从包含当月 1 号的周一开始，固定 6 周，切换月份时布局不跳动。 */
export function monthGrid(year: number, month: number): string[] {
  const first = toDay(new Date(year, month, 1));
  const start = addDays(first, -weekday(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// ---------- 筛选 ----------

export interface ViewContext {
  groupOf: (i: Issue) => StateGroup | undefined;
  today: string;
}

const isClosed = (g: StateGroup | undefined) => g === "completed" || g === "cancelled";

export function filterIssues(issues: Issue[], f: IssueFilter, ctx: ViewContext): Issue[] {
  const q = f.text.trim().toLowerCase();
  // 选了值的维度才参与判断；「排除」只是把该维度的结果取反。
  const pass = (dim: FilterDimension, hit: boolean, active: boolean) =>
    !active || (f.negate.includes(dim) ? !hit : hit);
  return issues.filter((i) => {
    const group = ctx.groupOf(i);
    // 项目视图存状态 id，跨项目视图存状态分组，两者都要匹配。
    const stateHit =
      f.states.includes(i.state_id) || (group !== undefined && f.states.includes(group));
    if (!pass("states", stateHit, f.states.length > 0)) return false;
    if (!pass("priorities", f.priorities.includes(i.priority), f.priorities.length > 0))
      return false;
    if (!pass("assignees", f.assignees.includes(i.assignee_id ?? "none"), f.assignees.length > 0))
      return false;
    if (
      !pass(
        "labels",
        i.label_ids.some((l) => f.labels.includes(l)),
        f.labels.length > 0,
      )
    )
      return false;
    if (f.hideClosed && isClosed(group)) return false;
    if (f.due === "none" && i.due_date) return false;
    if (f.due === "overdue" && !(i.due_date && i.due_date < ctx.today && !isClosed(group)))
      return false;
    if (
      f.due === "week" &&
      !(i.due_date && i.due_date >= ctx.today && i.due_date <= addDays(ctx.today, 7))
    )
      return false;
    if (q && !`${i.title}\n${i.description}\n${i.seq}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function filterCount(f: IssueFilter): number {
  return (
    (f.states.length ? 1 : 0) +
    (f.priorities.length ? 1 : 0) +
    (f.assignees.length ? 1 : 0) +
    (f.labels.length ? 1 : 0) +
    (f.due !== "any" ? 1 : 0) +
    (f.hideClosed ? 1 : 0) +
    (f.text.trim() ? 1 : 0)
  );
}

// ---------- 排序 ----------

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export function sortIssues(issues: Issue[], by: SortBy, desc: boolean): Issue[] {
  const dir = desc ? -1 : 1;
  /** 空日期无论升降序都排在最后：没有日期的任务不该挤到最前面。 */
  const byDate = (a: string | null, b: string | null) => {
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b) * dir;
  };
  return [...issues].sort((a, b) => {
    const r = (() => {
      switch (by) {
        case "manual":
          return (a.sort_order - b.sort_order) * dir;
        case "priority":
          return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
        case "due_date":
          return byDate(a.due_date, b.due_date);
        case "start_date":
          return byDate(a.start_date, b.start_date);
        case "updated_at":
          return a.updated_at.localeCompare(b.updated_at) * dir;
        case "created_at":
          return a.created_at.localeCompare(b.created_at) * dir;
        case "title":
          return a.title.localeCompare(b.title, "zh-CN") * dir;
      }
    })();
    return r || a.sort_order - b.sort_order;
  });
}

// ---------- 分组 ----------

export interface IssueGroup {
  key: string;
  title: string;
  state?: IssueState;
  priority?: Priority;
  /** 负责人分组的成员名 */
  member?: string;
  labelColor?: string;
  issues: Issue[];
  /** 把任务拖进本组时要改的字段；null 表示这个任务不能进这一组。 */
  patch?: (issue: Issue, fromKey: string) => IssuePatch | null;
}

const GROUP_ORDER: StateGroup[] = ["started", "unstarted", "backlog", "completed", "cancelled"];
const GROUP_NAMES: Record<StateGroup, string> = {
  started: "进行中",
  unstarted: "待处理",
  backlog: "待规划",
  completed: "已完成",
  cancelled: "已取消",
};
const GROUP_COLORS: Record<StateGroup, string> = {
  started: "#f59e0b",
  unstarted: "#737373",
  backlog: "#a3a3a3",
  completed: "#16a34a",
  cancelled: "#ef4444",
};
const PRIORITY_TITLES: [Priority, string][] = [
  ["urgent", "紧急"],
  ["high", "高"],
  ["medium", "中"],
  ["low", "低"],
  ["none", "无优先级"],
];

export interface GroupContext extends ViewContext {
  /** 项目视图的状态；缺省表示跨项目视图，按状态分组类型归并。 */
  states?: IssueState[];
  statesOf: (projectId: string) => IssueState[];
  members: Pick<Member, "id" | "name">[];
  labels: Label[];
  keepEmpty: boolean;
}

export function groupIssues(issues: Issue[], by: GroupBy, ctx: GroupContext): IssueGroup[] {
  const groups = ((): IssueGroup[] => {
    switch (by) {
      case "none":
        return [{ key: "all", title: "全部任务", issues }];
      case "state":
        if (ctx.states) {
          return ctx.states.map((st) => ({
            key: st.id,
            title: st.name,
            state: st,
            issues: issues.filter((i) => i.state_id === st.id),
            patch: () => ({ state_id: st.id }),
          }));
        }
        return GROUP_ORDER.map((g) => ({
          key: g,
          title: GROUP_NAMES[g],
          state: {
            id: g,
            project_id: "",
            name: GROUP_NAMES[g],
            group: g,
            color: GROUP_COLORS[g],
            position: 0,
          },
          issues: issues.filter((i) => ctx.groupOf(i) === g),
          // 跨项目时状态 id 各不相同，要换成任务所在项目里同类型的状态。
          patch: (issue: Issue) => {
            const target = ctx.statesOf(issue.project_id).find((s) => s.group === g);
            return target ? { state_id: target.id } : null;
          },
        }));
      case "priority":
        return PRIORITY_TITLES.map(([p, title]) => ({
          key: p,
          title,
          priority: p,
          issues: issues.filter((i) => i.priority === p),
          patch: () => ({ priority: p }),
        }));
      case "assignee":
        return [
          ...ctx.members.map((m) => ({
            key: m.id,
            title: m.name,
            member: m.name,
            issues: issues.filter((i) => i.assignee_id === m.id),
            patch: () => ({ assignee_id: m.id }),
          })),
          {
            key: "none",
            title: "未指派",
            issues: issues.filter((i) => !i.assignee_id),
            patch: () => ({ assignee_id: null }),
          },
        ];
      case "label":
        return [
          // 一个任务有多个标签时会出现在多个分组里。
          ...ctx.labels.map((l) => ({
            key: l.id,
            title: l.name,
            labelColor: l.color,
            issues: issues.filter((i) => i.label_ids.includes(l.id)),
            patch: (issue: Issue, from: string) =>
              issue.project_id === l.project_id
                ? {
                    label_ids: [...new Set([...issue.label_ids.filter((x) => x !== from), l.id])],
                  }
                : null,
          })),
          {
            key: "none",
            title: "无标签",
            issues: issues.filter((i) => i.label_ids.length === 0),
            patch: (issue: Issue, from: string) => ({
              label_ids: issue.label_ids.filter((x) => x !== from),
            }),
          },
        ];
    }
  })();
  return ctx.keepEmpty ? groups : groups.filter((g) => g.issues.length > 0);
}

// ---------- URL ----------

const csv = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 只写与基准配置不同的字段。清空保存视图里的条件时写空值（`st=`），解析时才能覆盖回来。 */
export function encodeConfig(c: ViewConfig, base: ViewConfig): URLSearchParams {
  const p = new URLSearchParams();
  const put = (k: string, v: unknown, b: unknown, s: string) => {
    if (!same(v, b)) p.set(k, s);
  };
  put("kind", c.kind, base.kind, c.kind);
  put("group", c.groupBy, base.groupBy, c.groupBy);
  put("sort", c.sortBy, base.sortBy, c.sortBy);
  put("desc", c.sortDesc, base.sortDesc, c.sortDesc ? "1" : "0");
  put("cols", c.columns, base.columns, c.columns.join(","));
  const f = c.filter;
  const bf = base.filter;
  put("st", f.states, bf.states, f.states.join(","));
  put("pr", f.priorities, bf.priorities, f.priorities.join(","));
  put("as", f.assignees, bf.assignees, f.assignees.join(","));
  put("lb", f.labels, bf.labels, f.labels.join(","));
  put("not", f.negate, bf.negate, f.negate.join(","));
  put("q", f.text, bf.text, f.text);
  put("due", f.due, bf.due, f.due);
  put("open", f.hideClosed, bf.hideClosed, f.hideClosed ? "1" : "0");
  return p;
}

export function decodeConfig(p: URLSearchParams, base: ViewConfig): ViewConfig {
  const list = <T extends string>(k: string, b: T[]) => (p.has(k) ? (csv(p.get(k)) as T[]) : b);
  const flag = (k: string, b: boolean) => (p.has(k) ? p.get(k) === "1" : b);
  return {
    kind: (p.get("kind") as ViewKind | null) ?? base.kind,
    groupBy: (p.get("group") as GroupBy | null) ?? base.groupBy,
    sortBy: (p.get("sort") as SortBy | null) ?? base.sortBy,
    sortDesc: flag("desc", base.sortDesc),
    columns: list("cols", base.columns),
    filter: {
      states: list("st", base.filter.states),
      priorities: list("pr", base.filter.priorities),
      assignees: list("as", base.filter.assignees),
      labels: list("lb", base.filter.labels),
      negate: list("not", base.filter.negate),
      text: p.get("q") ?? base.filter.text,
      due: (p.get("due") as IssueFilter["due"] | null) ?? base.filter.due,
      hideClosed: flag("open", base.filter.hideClosed),
    },
  };
}
