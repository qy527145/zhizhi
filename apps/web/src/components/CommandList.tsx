import { cn } from "@zhizhi/ui/lib/utils";
import { Kbd } from "@zhizhi/ui/ui";
import { Check, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

export interface CommandItem {
  id: string;
  label: string;
  /** 额外参与搜索的文本（如任务编号、拼音缩写、邮箱） */
  keywords?: string;
  icon?: ReactNode;
  hint?: ReactNode;
  group?: string;
  selected?: boolean;
  onSelect: () => void;
}

/**
 * 键盘优先的可搜索列表：↑↓ / Ctrl+N/P 移动，Enter 选中，数字键 1-9 在搜索框为空时直选。
 * 被命令面板和所有属性选择器共用，保证一致的操作手感。
 */
export function CommandList({
  items,
  placeholder = "搜索…",
  emptyText = "没有匹配的结果",
  footer,
  numberShortcuts = false,
  onQueryChange,
  header,
}: {
  items: CommandItem[];
  placeholder?: string;
  emptyText?: string;
  footer?: ReactNode;
  numberShortcuts?: boolean;
  onQueryChange?: (q: string) => void;
  header?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const terms = q.split(/\s+/);
    return items.filter((it) => {
      const hay = `${it.label} ${it.keywords ?? ""} ${it.group ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [items, query]);

  // 打开即聚焦搜索框：命令面板由快捷键唤起，用户期望直接输入。
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    const down = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n");
    const up = e.key === "ArrowUp" || (e.ctrlKey && e.key === "p");
    if (down || up) {
      e.preventDefault();
      const n = filtered.length;
      if (n) setActive((a) => (a + (down ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.onSelect();
    } else if (numberShortcuts && !query && /^[1-9]$/.test(e.key)) {
      const it = filtered[Number(e.key) - 1];
      if (it) {
        e.preventDefault();
        it.onSelect();
      }
    }
  };

  return (
    // 键盘事件统一在容器上处理，输入框与列表项共享焦点。
    // biome-ignore lint/a11y/noStaticElementInteractions: 见上
    <div className="flex flex-col" onKeyDown={onKeyDown}>
      {header}
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3.5">
        <Search size={15} className="shrink-0 text-zinc-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            onQueryChange?.(e.target.value);
          }}
          placeholder={placeholder}
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
        />
      </div>
      <div ref={listRef} className="max-h-[min(360px,50vh)] overflow-y-auto p-1.5">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] text-zinc-400">{emptyText}</div>
        )}
        {filtered.map((it, idx) => {
          const showGroup = it.group && it.group !== filtered[idx - 1]?.group;
          return (
            <div key={it.id}>
              {showGroup && (
                <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium text-zinc-400">
                  {it.group}
                </div>
              )}
              <button
                type="button"
                data-idx={idx}
                onMouseMove={() => active !== idx && setActive(idx)}
                onClick={it.onSelect}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] text-zinc-700",
                  idx === active && "bg-zinc-100 text-zinc-900",
                )}
              >
                {it.icon && (
                  <span className="flex w-4 shrink-0 justify-center text-zinc-500">{it.icon}</span>
                )}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && <span className="shrink-0 text-xs text-zinc-400">{it.hint}</span>}
                {it.selected && <Check size={14} className="shrink-0 text-zinc-700" />}
                {numberShortcuts && !query && idx < 9 && (
                  <Kbd className="opacity-70">{idx + 1}</Kbd>
                )}
              </button>
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="border-t border-zinc-100 px-3.5 py-2 text-xs text-zinc-400">{footer}</div>
      )}
    </div>
  );
}
