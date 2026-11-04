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

/**
 * 状态分组 → 语义色。每个概念在所有视图里都是同一个颜色：
 * 进行中永远是蓝，完成永远是绿，取消和积压退回中性色。
 * 取的是 index.css 里的 tone token，换主题时跟着变。
 */
export const stateTone = (g: StateGroup): { fg: string; bg: string } => {
  switch (g) {
    case "started":
      return { fg: "var(--color-tone-blue)", bg: "var(--color-tone-blue-soft)" };
    case "completed":
      return { fg: "var(--color-tone-green)", bg: "var(--color-tone-green-soft)" };
    case "cancelled":
      return { fg: "var(--color-zinc-500)", bg: "var(--color-zinc-100)" };
    default:
      return { fg: "var(--color-zinc-500)", bg: "var(--color-zinc-100)" };
  }
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
