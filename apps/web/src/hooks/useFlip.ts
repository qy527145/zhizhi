import { type RefObject, useLayoutEffect, useRef } from "react";

const MAX_ANIMATED = 200;

function measure(root: HTMLElement) {
  const map = new Map<string, DOMRect>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
    map.set(el.dataset.flip ?? "", el.getBoundingClientRect());
  }
  return map;
}

/**
 * FLIP：任务换列或重排时从旧位置滑到新位置，只动 transform。
 * 旧位置在 signature 变化的那次渲染里量（此时 DOM 还没提交）。如果提前量好存着，
 * 中途滚动过就会算出错误的位移。signature 只包含顺序，j/k 移动焦点不会触发。
 */
export function useFlip(root: RefObject<HTMLElement | null>, signature: string) {
  const prev = useRef(signature);
  const first = useRef<Map<string, DOMRect> | null>(null);
  if (prev.current !== signature && root.current) {
    first.current = measure(root.current);
    prev.current = signature;
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: signature 是触发条件
  useLayoutEffect(() => {
    const before = first.current;
    const el = root.current;
    first.current = null;
    if (!before || !el || before.size > MAX_ANIMATED) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const node of el.querySelectorAll<HTMLElement>("[data-flip]")) {
      const from = before.get(node.dataset.flip ?? "");
      if (!from) continue;
      const to = node.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 220,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    }
  }, [signature, root]);
}
