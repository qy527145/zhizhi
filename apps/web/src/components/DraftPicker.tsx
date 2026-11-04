import type { Priority } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { useEscapeLayer } from "@zhizhi/ui/ui";
import { CalendarDays, Tag, UserMinus, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LABEL_COLORS, PRIORITIES } from "@/lib/constants";
import { useIssues } from "@/stores/issues";
import { toast } from "@/stores/toast";
import { useWorkspace } from "@/stores/workspace";
import { type CommandItem, CommandList } from "./CommandList";
import { Avatar, LabelDot, PriorityIcon, StateIcon } from "./icons";

/**
 * 锚定在触发按钮下方的弹出层。和居中 Modal 不同，它从触发点展开（origin-aware），
 * 用于表单里的属性选择，不打断用户在弹窗里的上下文。
 */
export function Popover({
  anchor,
  onClose,
  children,
  width = 260,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // 先测量一次再定位，避免贴边时溢出视口。
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const up = r.bottom + 320 > window.innerHeight && r.top > 320;
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left, up });
  }, [anchor, width]);

  useEscapeLayer(true, onClose);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node))
        onClose();
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [onClose, anchor]);

  // 关闭后把焦点还给触发按钮：搜索框卸载后焦点会落回 body，键盘操作就断了。
  useEffect(() => () => anchor?.focus(), [anchor]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={box}
      className="fixed z-[55] animate-in overflow-hidden rounded-xl bg-white shadow-pop"
      style={{
        top: pos.top,
        left: pos.left,
        width,
        transform: pos.up ? "translateY(-100%)" : undefined,
        transformOrigin: pos.up ? "bottom left" : "top left",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function addDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
}

export const DATE_PRESETS: { id: string; label: string; days: number }[] = [
  { id: "today", label: "今天", days: 0 },
  { id: "tomorrow", label: "明天", days: 1 },
  { id: "week", label: "一周后", days: 7 },
  { id: "twoweeks", label: "两周后", days: 14 },
  { id: "month", label: "一个月后", days: 30 },
];

/** 新建任务表单里的各类属性选择；值由调用方持有，选择后回调。 */
export type DraftPick =
  | { kind: "project"; value: string; onChange: (id: string) => void }
  | { kind: "state"; projectId: string; value?: string; onChange: (id: string) => void }
  | { kind: "priority"; value: Priority; onChange: (p: Priority) => void }
  | { kind: "assignee"; value: string | null; onChange: (id: string | null) => void }
  | {
      kind: "labels";
      projectId: string;
      value: string[];
      onChange: (ids: string[]) => void;
    }
  | {
      kind: "date";
      title: string;
      value: string | null;
      onChange: (d: string | null) => void;
    };

export function DraftPicker({ pick, onClose }: { pick: DraftPick; onClose: () => void }) {
  const projects = useWorkspace((s) => s.projects);
  const members = useWorkspace((s) => s.members);
  const meta = useIssues((s) => ("projectId" in pick ? s.meta[pick.projectId] : undefined));
  const createLabel = useIssues((s) => s.createLabel);
  const [query, setQuery] = useState("");

  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const items = ((): CommandItem[] => {
    switch (pick.kind) {
      case "project":
        return projects.map((p) => ({
          id: p.id,
          label: p.name,
          keywords: p.identifier,
          hint: p.identifier,
          selected: p.id === pick.value,
          onSelect: done(() => pick.onChange(p.id)),
        }));
      case "state":
        return (meta?.states ?? []).map((st) => ({
          id: st.id,
          label: st.name,
          icon: <StateIcon group={st.group} color={st.color} />,
          selected: st.id === pick.value,
          onSelect: done(() => pick.onChange(st.id)),
        }));
      case "priority":
        return PRIORITIES.map((p) => ({
          id: p.key,
          label: p.key === "none" ? "无优先级" : `${p.label}优先级`,
          keywords: p.key,
          icon: <PriorityIcon priority={p.key} />,
          selected: p.key === pick.value,
          onSelect: done(() => pick.onChange(p.key)),
        }));
      case "assignee":
        return [
          {
            id: "__none",
            label: "不指派",
            icon: <UserMinus size={14} />,
            selected: !pick.value,
            onSelect: done(() => pick.onChange(null)),
          },
          ...members.map((m) => ({
            id: m.id,
            label: m.name,
            keywords: m.email,
            hint: m.email,
            icon: <Avatar name={m.name} size={16} />,
            selected: m.id === pick.value,
            onSelect: done(() => pick.onChange(m.id)),
          })),
        ];
      case "labels": {
        const labels = meta?.labels ?? [];
        const toggle = (id: string) =>
          pick.onChange(
            pick.value.includes(id) ? pick.value.filter((x) => x !== id) : [...pick.value, id],
          );
        const list: CommandItem[] = labels.map((l) => ({
          id: l.id,
          label: l.name,
          icon: <LabelDot color={l.color} />,
          selected: pick.value.includes(l.id),
          onSelect: () => toggle(l.id),
        }));
        const q = query.trim();
        if (q && !labels.some((l) => l.name === q)) {
          list.push({
            id: "__create",
            label: `创建标签「${q}」`,
            keywords: q,
            icon: <Tag size={14} />,
            onSelect: async () => {
              try {
                const color = LABEL_COLORS[labels.length % LABEL_COLORS.length] ?? "#71717a";
                const l = await createLabel(pick.projectId, q, color);
                pick.onChange([...pick.value, l.id]);
              } catch (e) {
                toast.error((e as Error).message);
              }
            },
          });
        }
        return list;
      }
      case "date":
        return [
          ...DATE_PRESETS.map((p) => ({
            id: p.id,
            label: p.label,
            hint: addDays(p.days),
            icon: <CalendarDays size={14} />,
            selected: pick.value === addDays(p.days),
            onSelect: done(() => pick.onChange(addDays(p.days))),
          })),
          {
            id: "clear",
            label: "清除",
            icon: <XCircle size={14} />,
            onSelect: done(() => pick.onChange(null)),
          },
        ];
    }
  })();

  return (
    <>
      <CommandList
        items={items}
        numberShortcuts={pick.kind !== "labels"}
        onQueryChange={setQuery}
        placeholder={
          pick.kind === "labels"
            ? "搜索或创建标签…"
            : pick.kind === "assignee"
              ? "搜索成员…"
              : "筛选…"
        }
      />
      {pick.kind === "date" && (
        <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2">
          <span className="text-xs text-zinc-500">{pick.title}</span>
          <input
            type="date"
            value={pick.value ?? ""}
            onChange={(e) => {
              pick.onChange(e.target.value || null);
              onClose();
            }}
            className={cn(
              "h-7 flex-1 rounded-md border border-zinc-200 px-2 text-xs outline-none focus:border-accent",
            )}
          />
        </div>
      )}
    </>
  );
}
