import { expect, test } from "bun:test";
import type { Issue } from "@zhizhi/shared";
import { computeStats } from "./stats";

const issue = (o: Partial<Issue>): Issue => ({
  id: Math.random().toString(),
  project_id: "p",
  seq: 1,
  title: "t",
  description: "",
  state_id: "todo",
  priority: "none",
  assignee_id: null,
  due_date: null,
  start_date: null,
  sort_order: 0,
  created_by: "u",
  created_at: "2026-11-01T10:00:00",
  updated_at: "2026-11-01T10:00:00",
  label_ids: [],
  attachments: [],
  comment_count: 0,
  ...o,
});

const groups = { todo: "unstarted", doing: "started", done: "completed", no: "cancelled" } as const;
const lookup = (id: string) => groups[id as keyof typeof groups];

test("汇总分组、完成率、逾期与负责人负载", () => {
  const now = new Date(2026, 10, 4, 12);
  const s = computeStats(
    [
      issue({ state_id: "todo", due_date: "2026-11-01", assignee_id: "a", priority: "urgent" }),
      issue({ state_id: "doing", due_date: "2026-11-08", assignee_id: "a" }),
      issue({ state_id: "done", updated_at: "2026-11-03T09:00:00", due_date: "2026-10-01" }),
      issue({ state_id: "no" }),
    ],
    lookup,
    now,
  );
  expect(s.total).toBe(4);
  expect(s.open).toBe(2);
  expect(s.completionRate).toBeCloseTo(1 / 3);
  expect(s.overdue).toBe(1);
  expect(s.dueSoon).toBe(1);
  expect(s.byPriority.urgent).toBe(1);
  expect(s.workload).toEqual([{ assigneeId: "a", open: 2, started: 1 }]);
  expect(s.trend).toHaveLength(14);
  expect(s.trend.find((p) => p.day === "2026-11-01")?.created).toBe(4);
  expect(s.trend.find((p) => p.day === "2026-11-03")?.completed).toBe(1);
});

test("空数据不除零", () => {
  expect(computeStats([], lookup).completionRate).toBe(0);
});
