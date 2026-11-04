import type { Priority, StateGroup } from "@zhizhi/shared";

export interface PriorityMeta {
  key: Priority;
  label: string;
  color: string;
}

const NONE_PRIORITY: PriorityMeta = { key: "none", label: "无", color: "#a1a1aa" };

export const PRIORITIES: PriorityMeta[] = [
  { key: "urgent", label: "紧急", color: "#ef4444" },
  { key: "high", label: "高", color: "#f97316" },
  { key: "medium", label: "中", color: "#eab308" },
  { key: "low", label: "低", color: "#3b82f6" },
  NONE_PRIORITY,
];

export const priorityMeta = (p: Priority): PriorityMeta =>
  PRIORITIES.find((x) => x.key === p) ?? NONE_PRIORITY;

export const STATE_GROUP_LABEL: Record<StateGroup, string> = {
  backlog: "待规划",
  unstarted: "待处理",
  started: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

export const LABEL_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#71717a",
];
