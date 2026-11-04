import type { Issue, IssueState, Priority, StateGroup } from "@zhizhi/shared";

export const GROUP_ORDER: StateGroup[] = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "cancelled",
];
const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low", "none"];

export interface TrendPoint {
  day: string;
  created: number;
  completed: number;
}

export interface Stats {
  total: number;
  open: number;
  started: number;
  completed: number;
  overdue: number;
  dueSoon: number;
  /** 已完成 / (总数 - 已取消)，无有效任务时为 0。 */
  completionRate: number;
  byGroup: Record<StateGroup, number>;
  byPriority: Record<Priority, number>;
  /** 未关闭任务按负责人计数，null 表示未分配。 */
  workload: { assigneeId: string | null; open: number; started: number }[];
  trend: TrendPoint[];
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * 汇总任务统计。stateGroup 把 state_id 映射到分组。
 * 「完成于」没有专门字段，用已完成任务的 updated_at 近似。
 */
export function computeStats(
  issues: Issue[],
  stateGroup: (stateId: string) => StateGroup | undefined,
  now: Date = new Date(),
  days = 14,
): Stats {
  const byGroup = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<StateGroup, number>;
  const byPriority = Object.fromEntries(PRIORITY_ORDER.map((p) => [p, 0])) as Record<
    Priority,
    number
  >;
  const load = new Map<string | null, { open: number; started: number }>();
  const today = dayKey(now);
  const soon = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));

  const trend: TrendPoint[] = [];
  const trendIdx = new Map<string, TrendPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const p = {
      day: dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)),
      created: 0,
      completed: 0,
    };
    trend.push(p);
    trendIdx.set(p.day, p);
  }

  let overdue = 0;
  let dueSoon = 0;
  for (const issue of issues) {
    const g = stateGroup(issue.state_id) ?? "backlog";
    byGroup[g]++;
    byPriority[issue.priority]++;
    const closed = g === "completed" || g === "cancelled";
    if (!closed) {
      const w = load.get(issue.assignee_id) ?? { open: 0, started: 0 };
      w.open++;
      if (g === "started") w.started++;
      load.set(issue.assignee_id, w);
      if (issue.due_date) {
        if (issue.due_date < today) overdue++;
        else if (issue.due_date <= soon) dueSoon++;
      }
    }
    const c = trendIdx.get(dayKey(new Date(issue.created_at)));
    if (c) c.created++;
    if (g === "completed") {
      const d = trendIdx.get(dayKey(new Date(issue.updated_at)));
      if (d) d.completed++;
    }
  }

  const effective = issues.length - byGroup.cancelled;
  return {
    total: issues.length,
    open: byGroup.backlog + byGroup.unstarted + byGroup.started,
    started: byGroup.started,
    completed: byGroup.completed,
    overdue,
    dueSoon,
    completionRate: effective > 0 ? byGroup.completed / effective : 0,
    byGroup,
    byPriority,
    workload: [...load.entries()]
      .map(([assigneeId, w]) => ({ assigneeId, ...w }))
      .sort((a, b) => b.open - a.open),
    trend,
  };
}

export const groupLookup = (states: IssueState[]) => {
  const m = new Map(states.map((s) => [s.id, s.group]));
  return (id: string) => m.get(id);
};
