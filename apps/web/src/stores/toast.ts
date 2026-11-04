import { create } from "zustand";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

export const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));

let seq = 0;
function push(kind: Toast["kind"], text: string) {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items, { id, kind, text }].slice(-3) }));
  setTimeout(
    () => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })),
    3200,
  );
}

export const toast = {
  success: (t: string) => push("success", t),
  error: (t: string) => push("error", t),
};
