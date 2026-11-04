import { create } from "zustand";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
  /** 可选的操作按钮，例如「查看」新建的任务。 */
  action?: { label: string; run: () => void };
  leaving?: boolean;
}

export const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));

let seq = 0;
const LIFETIME = 3600;
const EXIT_MS = 160;

function dismiss(id: number) {
  // 先标记离场，播放完退出动画再移除，避免卡片瞬间消失。
  useToasts.setState((s) => ({
    items: s.items.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
  }));
  setTimeout(
    () => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })),
    EXIT_MS,
  );
}

function push(kind: Toast["kind"], text: string, action?: Toast["action"]) {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items, { id, kind, text, action }].slice(-3) }));
  setTimeout(() => dismiss(id), LIFETIME);
}

export const toast = {
  success: (t: string, action?: Toast["action"]) => push("success", t, action),
  error: (t: string) => push("error", t),
  dismiss,
};
