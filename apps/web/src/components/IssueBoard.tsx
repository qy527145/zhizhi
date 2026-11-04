import type { Issue, Project } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { MessageSquare, Paperclip, Plus } from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { useFlip } from "@/hooks/useFlip";
import { stateTone } from "@/lib/constants";
import { useIssues } from "@/stores/issues";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import { GroupIcon, type IssueGroup } from "./IssueList";
import { AssigneeButton, DueButton, LabelChips, PriorityButton } from "./IssueProps";
import { useAttachmentSrc } from "./Markdown";

function Cover({ issue }: { issue: Issue }) {
  const first = issue.attachments.find((a) => a.mime.startsWith("image/"));
  const { url } = useAttachmentSrc(first?.id);
  if (!first) return null;
  return url ? (
    <img
      src={url}
      alt={first.filename}
      draggable={false}
      className="-mx-3 -mt-3 mb-2 block h-28 w-[calc(100%+1.5rem)] max-w-none rounded-t-lg object-cover"
    />
  ) : (
    <span className="skeleton -mx-3 -mt-3 mb-2 block h-28 rounded-t-lg" />
  );
}

const Card = memo(function Card({
  issue,
  project,
  focused,
  groupKey,
  onOpen,
}: {
  issue: Issue;
  project?: Project;
  focused: boolean;
  groupKey: string;
  onOpen: (id: string) => void;
}) {
  const flash = useUi((s) => s.flashId === issue.id);
  const state = useIssues((s) =>
    s.meta[issue.project_id]?.states.find((x) => x.id === issue.state_id),
  );
  const tone = state ? stateTone(state.group) : null;
  const [dragging, setDragging] = useState(false);
  return (
    // 卡片内含属性按钮，不能整体换成 <button>；用 role + 键盘处理补齐可访问性。
    // biome-ignore lint/a11y/useSemanticElements: 内部还有属性按钮，不能嵌套 <button>
    <div
      role="button"
      tabIndex={-1}
      draggable
      data-issue={issue.id}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/issue", issue.id);
        e.dataTransfer.setData("text/group", groupKey);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onOpen(issue.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(issue.id);
      }}
      onMouseMove={() => !focused && useUi.getState().set({ focusedId: issue.id })}
      className={cn(
        "lift cursor-pointer overflow-hidden rounded-xl bg-card p-3 shadow-card",
        focused && "ring-1 ring-accent/40",
        dragging && "opacity-40",
        flash && "animate-flash",
      )}
    >
      <Cover issue={issue} />
      {/* 状态点 + 编号：一行里先说「在哪」，再读标题。 */}
      <div className="flex items-center gap-1.5">
        {state && (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: state.color }}
            aria-hidden
          />
        )}
        <span className="font-mono text-[11px] tracking-tight text-zinc-400">
          {project?.identifier}-{issue.seq}
        </span>
        <span className="flex-1" />
        {state && tone && (
          <span
            className="shrink-0 rounded px-1.5 py-px text-[10px] text-zinc-600"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {state.name}
          </span>
        )}
      </div>
      <div className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-zinc-800">
        {issue.title}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <PriorityButton issue={issue} />
        <LabelChips issue={issue} max={2} />
        <DueButton issue={issue} />
        {issue.attachments.length > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1 text-xs text-zinc-400">
            <Paperclip size={11} /> {issue.attachments.length}
          </span>
        )}
        {issue.comment_count > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1 text-xs text-zinc-400">
            <MessageSquare size={11} /> {issue.comment_count}
          </span>
        )}
        <span className="flex-1" />
        <AssigneeButton issue={issue} />
      </div>
    </div>
  );
});

/** 取相邻两张卡片 sort_order 的中值，不用重排整列。 */
function sortOrderAt(others: Issue[], idx: number) {
  const before = others[idx - 1]?.sort_order;
  const after = others[idx]?.sort_order;
  if (before === undefined && after === undefined) return 65536;
  if (before === undefined) return (after ?? 0) - 1024;
  if (after === undefined) return before + 1024;
  return (before + after) / 2;
}

/** 看板：按当前分组分列，拖动卡片修改对应字段；手动排序时还能调整列内位置。 */
export function IssueBoard({
  groups,
  projects,
  onOpen,
  onQuickCreate,
  manual,
}: {
  groups: IssueGroup[];
  projects: Project[];
  onOpen: (id: string) => void;
  onQuickCreate?: (stateId: string) => void;
  /** 手动排序时才有落位线：其他排序下位置由排序字段决定，拖了也不会生效。 */
  manual: boolean;
}) {
  const focusedId = useUi((s) => s.focusedId);
  const update = useIssues((s) => s.update);
  const byId = useIssues((s) => s.byId);
  const [over, setOver] = useState<{ key: string; idx: number } | null>(null);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const root = useRef<HTMLDivElement>(null);
  useFlip(root, groups.map((g) => `${g.key}:${g.issues.map((i) => i.id).join()}`).join("|"));

  /** 根据指针位置算出落在第几张卡片之前。 */
  const dropIndex = (e: React.DragEvent) => {
    const cards = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-flip]");
    let idx = 0;
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) break;
      idx++;
    }
    return idx;
  };

  const onDrop = (e: React.DragEvent, g: IssueGroup) => {
    e.preventDefault();
    const idx = over?.key === g.key ? over.idx : g.issues.length;
    setOver(null);
    const id = e.dataTransfer.getData("text/issue");
    const from = e.dataTransfer.getData("text/group");
    const issue = byId[id];
    if (!issue) return;
    const patch = from === g.key ? {} : g.patch?.(issue, from);
    if (patch === null || patch === undefined) {
      if (patch === null) toast.error("这个任务不能移到该分组");
      return;
    }
    if (manual) {
      // 落点下标算的是含被拖卡片的列表，要先换算成去掉它之后的下标。
      const self = g.issues.findIndex((i) => i.id === id);
      const others = g.issues.filter((i) => i.id !== id);
      if (self !== -1 && (idx === self || idx === self + 1)) {
        if (from === g.key) return; // 放回原位
      }
      update(id, {
        ...patch,
        sort_order: sortOrderAt(others, self !== -1 && idx > self ? idx - 1 : idx),
      });
    } else if (Object.keys(patch).length > 0) {
      update(id, patch);
    }
  };

  return (
    <div ref={root} className="stagger flex flex-1 gap-3 overflow-x-auto p-4">
      {groups.map((g) => (
        // 拖放落点：没有等价的键盘操作，键盘用户改用属性选择器移动任务。
        // biome-ignore lint/a11y/noStaticElementInteractions: 见上
        <div
          key={g.key}
          data-column={g.key}
          onDragOver={(e) => {
            e.preventDefault();
            const idx = dropIndex(e);
            if (over?.key !== g.key || over.idx !== idx) setOver({ key: g.key, idx });
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
          }}
          onDrop={(e) => onDrop(e, g)}
          className={cn(
            "flex w-72 shrink-0 flex-col overflow-hidden rounded-xl bg-surface transition-colors duration-150",
            over?.key === g.key && "bg-accent-soft",
          )}
        >
          {/* 列头的状态色条：颜色来自状态本身，换分组方式时退回中性灰。 */}
          <span
            aria-hidden
            className="h-[3px] shrink-0"
            style={{ backgroundColor: g.state?.color ?? g.labelColor ?? "#e4e4e2" }}
          />
          <div className="flex h-10 items-center gap-2 px-3 text-[13px] font-medium text-zinc-700">
            <GroupIcon group={g} />
            <span className="truncate">{g.title}</span>
            <span className="rounded-full bg-canvas/70 px-1.5 font-mono text-[11px] font-normal tabular-nums text-zinc-500">
              {g.issues.length}
            </span>
            <span className="flex-1" />
            {onQuickCreate && g.state && (
              <button
                type="button"
                aria-label="在此状态下新建任务"
                onClick={() => onQuickCreate(g.state?.id ?? "")}
                className="press rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
              >
                <Plus size={13} />
              </button>
            )}
          </div>
          <div className="min-h-16 flex-1 overflow-y-auto px-2 pb-2">
            {g.issues.length === 0 && over?.key !== g.key && (
              <div className="mt-1 grid h-20 place-items-center rounded-lg border border-dashed border-zinc-300/80 text-[12px] text-zinc-400">
                拖动任务到这里
              </div>
            )}
            {g.issues.map((i, idx) => (
              <div key={i.id} data-flip={i.id} className="relative pb-2">
                {manual && over?.key === g.key && over.idx === idx && <DropLine />}
                <Card
                  issue={i}
                  project={projectById[i.project_id]}
                  focused={focusedId === i.id}
                  groupKey={g.key}
                  onOpen={onOpen}
                />
              </div>
            ))}
            {manual && over?.key === g.key && over.idx >= g.issues.length && (
              <div className="relative h-1">
                <DropLine />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DropLine() {
  return (
    <span className="absolute -top-1 right-0 left-0 z-10 h-0.5 rounded-full bg-accent shadow-[0_0_0_2px_rgb(255_255_255)]" />
  );
}
