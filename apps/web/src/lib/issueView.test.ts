import { describe, expect, test } from "bun:test";
import type { Issue, IssueState } from "@zhizhi/shared";

import {
  addDays,
  DEFAULT_CONFIG,
  decodeConfig,
  diffDays,
  EMPTY_FILTER,
  encodeConfig,
  filterIssues,
  groupIssues,
  monthGrid,
  normalizeConfig,
  sortIssues,
  weekday,
} from "./issueView";

const issue = (o: Partial<Issue>): Issue => ({
  id: "i",
  project_id: "p",
  seq: 1,
  title: "任务",
  description: "",
  state_id: "s1",
  priority: "none",
  assignee_id: null,
  due_date: null,
  start_date: null,
  sort_order: 0,
  created_by: "u",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  label_ids: [],
  attachments: [],
  comment_count: 0,
  ...o,
});
const ctx = { groupOf: () => "unstarted" as const, today: "2026-05-10" };
const ids = (xs: Issue[]) => xs.map((i) => i.id);

describe("filterIssues", () => {
  const a = issue({ id: "a", priority: "urgent", label_ids: ["l1"], assignee_id: "m" });
  const b = issue({ id: "b", priority: "low", title: "写文档" });

  test("不同维度是「且」，同一维度是「或」", () => {
    const f = { ...EMPTY_FILTER, priorities: ["urgent" as const, "low" as const], labels: ["l1"] };
    expect(ids(filterIssues([a, b], f, ctx))).toEqual(["a"]);
  });

  test("排除只影响选中的维度", () => {
    const f = { ...EMPTY_FILTER, priorities: ["urgent" as const], negate: ["priorities" as const] };
    expect(ids(filterIssues([a, b], f, ctx))).toEqual(["b"]);
  });

  test("排除但没选值时不过滤", () => {
    const f = { ...EMPTY_FILTER, negate: ["labels" as const] };
    expect(ids(filterIssues([a, b], f, ctx))).toEqual(["a", "b"]);
  });

  test("none 匹配未指派", () => {
    const f = { ...EMPTY_FILTER, assignees: ["none"] };
    expect(ids(filterIssues([a, b], f, ctx))).toEqual(["b"]);
  });

  test("逾期不含已关闭的任务", () => {
    const late = issue({ id: "late", due_date: "2026-05-01" });
    const f = { ...EMPTY_FILTER, due: "overdue" as const };
    expect(ids(filterIssues([late], f, ctx))).toEqual(["late"]);
    expect(filterIssues([late], f, { ...ctx, groupOf: () => "completed" })).toEqual([]);
  });

  test("文本同时搜标题和描述", () => {
    const c = issue({ id: "c", description: "Safari 错位" });
    const f = { ...EMPTY_FILTER, text: "safari" };
    expect(ids(filterIssues([b, c], f, ctx))).toEqual(["c"]);
  });
});

describe("sortIssues", () => {
  test("空日期升降序都排最后", () => {
    const xs = [
      issue({ id: "none" }),
      issue({ id: "early", due_date: "2026-01-01" }),
      issue({ id: "late", due_date: "2026-02-01" }),
    ];
    expect(ids(sortIssues(xs, "due_date", false))).toEqual(["early", "late", "none"]);
    expect(ids(sortIssues(xs, "due_date", true))).toEqual(["late", "early", "none"]);
  });

  test("不修改原数组", () => {
    const xs = [issue({ id: "b", sort_order: 2 }), issue({ id: "a", sort_order: 1 })];
    sortIssues(xs, "manual", false);
    expect(xs[0]?.id).toBe("b");
  });
});

describe("groupIssues", () => {
  const states: IssueState[] = [
    { id: "x1", project_id: "p1", name: "做", group: "started", color: "#000", position: 1 },
    { id: "y1", project_id: "p2", name: "干", group: "started", color: "#000", position: 1 },
  ];
  const base = {
    ...ctx,
    statesOf: (p: string) => states.filter((s) => s.project_id === p),
    members: [{ id: "m", name: "小明" }],
    labels: [{ id: "l1", project_id: "p1", name: "缺陷", color: "#f00" }],
    keepEmpty: false,
  };

  test("跨项目拖动换成任务所在项目的同类状态", () => {
    const groups = groupIssues([], "state", { ...base, keepEmpty: true });
    const started = groups.find((g) => g.key === "started");
    expect(started?.patch?.(issue({ project_id: "p2" }), "")).toEqual({ state_id: "y1" });
  });

  test("默认隐藏空分组，看板保留作为落点", () => {
    expect(groupIssues([], "priority", base)).toEqual([]);
    expect(groupIssues([], "priority", { ...base, keepEmpty: true })).toHaveLength(5);
  });

  test("拖到别的标签是替换来源标签，别的项目不能用", () => {
    const groups = groupIssues([], "label", { ...base, keepEmpty: true });
    const bug = groups.find((g) => g.key === "l1");
    const own = issue({ project_id: "p1", label_ids: ["l0", "l9"] });
    expect(bug?.patch?.(own, "l0")).toEqual({ label_ids: ["l9", "l1"] });
    expect(bug?.patch?.(issue({ project_id: "p2" }), "none")).toBeNull();
  });
});

describe("URL 编解码", () => {
  test("默认配置不产生参数", () => {
    expect(encodeConfig(DEFAULT_CONFIG, DEFAULT_CONFIG).toString()).toBe("");
  });

  test("往返不丢信息", () => {
    const c = normalizeConfig({
      kind: "table",
      groupBy: "priority",
      sortBy: "due_date",
      sortDesc: true,
      columns: ["state"],
      filter: {
        ...EMPTY_FILTER,
        states: ["a", "b"],
        priorities: ["high"],
        negate: ["states"],
        text: "你好, world",
        due: "week",
        hideClosed: true,
      },
    });
    const url = encodeConfig(c, DEFAULT_CONFIG).toString();
    expect(decodeConfig(new URLSearchParams(url), DEFAULT_CONFIG)).toEqual(c);
  });

  test("能把保存视图里的条件清空", () => {
    const base = normalizeConfig({ filter: { ...EMPTY_FILTER, labels: ["l1"] } });
    const cleared = normalizeConfig({ filter: EMPTY_FILTER });
    const url = encodeConfig(cleared, base).toString();
    expect(decodeConfig(new URLSearchParams(url), base).filter.labels).toEqual([]);
  });

  test("补齐旧配置缺失的字段", () => {
    const c = normalizeConfig({ kind: "board" });
    expect(c.groupBy).toBe("state");
    expect(c.filter.negate).toEqual([]);
  });
});

describe("日期", () => {
  test("跨月加减", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-03-01", "2026-02-27")).toBe(2);
  });

  test("月历从周一开始、固定 6 周、包含当月 1 号", () => {
    const grid = monthGrid(2026, 4); // 2026 年 5 月
    expect(grid).toHaveLength(42);
    expect(weekday(grid[0] ?? "")).toBe(0);
    expect(grid).toContain("2026-05-01");
    expect(grid).toContain("2026-05-31");
  });
});
