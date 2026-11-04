import { Kbd, Modal } from "@zhizhi/ui/ui";
import { CalendarDays, Tag, UserMinus, UserRound, XCircle } from "lucide-react";
import { useState } from "react";
import { LABEL_COLORS, PRIORITIES, STATE_GROUP_LABEL } from "@/lib/constants";
import { useIssues } from "@/stores/issues";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { type CommandItem, CommandList } from "./CommandList";
import { Avatar, LabelDot, PriorityIcon, StateIcon } from "./icons";

const TITLES = {
  state: "更改状态",
  priority: "设置优先级",
  assignee: "指派给",
  labels: "设置标签",
  due: "设置截止日期",
};

function addDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE"); // YYYY-MM-DD
}

/** 全局唯一的任务属性选择器，由 ui.picker 驱动。 */
export function PropertyPicker() {
  const picker = useUi((s) => s.picker);
  const set = useUi((s) => s.set);
  const issue = useIssues((s) => (picker ? s.byId[picker.issueId] : undefined));
  const meta = useIssues((s) => (issue ? s.meta[issue.project_id] : undefined));
  const update = useIssues((s) => s.update);
  const createLabel = useIssues((s) => s.createLabel);
  const members = useWorkspace((s) => s.members);
  const projects = useWorkspace((s) => s.projects);
  const [query, setQuery] = useState("");

  const close = () => {
    set({ picker: null });
    setQuery("");
  };
  const kind = picker?.kind;

  const items = ((): CommandItem[] => {
    if (!issue || !kind) return [];
    const done = (patch: Parameters<typeof update>[1]) => {
      update(issue.id, patch);
      close();
    };
    switch (kind) {
      case "state":
        return (meta?.states ?? []).map((st) => ({
          id: st.id,
          label: st.name,
          keywords: STATE_GROUP_LABEL[st.group],
          icon: <StateIcon group={st.group} color={st.color} />,
          selected: st.id === issue.state_id,
          onSelect: () => done({ state_id: st.id }),
        }));
      case "priority":
        return PRIORITIES.map((p) => ({
          id: p.key,
          label: p.key === "none" ? "无优先级" : `${p.label}优先级`,
          keywords: p.key,
          icon: <PriorityIcon priority={p.key} />,
          selected: p.key === issue.priority,
          onSelect: () => done({ priority: p.key }),
        }));
      case "assignee":
        return [
          {
            id: "__none",
            label: "取消指派",
            icon: <UserMinus size={14} />,
            selected: !issue.assignee_id,
            onSelect: () => done({ assignee_id: null }),
          },
          ...members.map((m) => ({
            id: m.id,
            label: m.name,
            keywords: m.email,
            icon: <Avatar name={m.name} size={16} />,
            hint: m.email,
            selected: m.id === issue.assignee_id,
            onSelect: () => done({ assignee_id: m.id }),
          })),
        ];
      case "labels": {
        // 标签为多选：选中后不关闭，便于连续勾选。
        const toggle = (id: string) => {
          const has = issue.label_ids.includes(id);
          update(issue.id, {
            label_ids: has ? issue.label_ids.filter((x) => x !== id) : [...issue.label_ids, id],
          });
        };
        const labels = meta?.labels ?? [];
        const q = query.trim();
        const list: CommandItem[] = labels.map((l) => ({
          id: l.id,
          label: l.name,
          icon: <LabelDot color={l.color} />,
          selected: issue.label_ids.includes(l.id),
          onSelect: () => toggle(l.id),
        }));
        if (q && !labels.some((l) => l.name === q)) {
          list.push({
            id: "__create",
            label: `创建标签「${q}」`,
            keywords: q,
            icon: <Tag size={14} />,
            onSelect: async () => {
              try {
                const color = LABEL_COLORS[labels.length % LABEL_COLORS.length] ?? "#71717a";
                const l = await createLabel(issue.project_id, q, color);
                const fresh = useIssues.getState().byId[issue.id];
                update(issue.id, { label_ids: [...(fresh?.label_ids ?? []), l.id] });
              } catch (e) {
                toast.error((e as Error).message);
              }
            },
          });
        }
        return list;
      }
      case "due":
        return [
          {
            id: "today",
            label: "今天",
            hint: addDays(0),
            onSelect: () => done({ due_date: addDays(0) }),
          },
          {
            id: "tomorrow",
            label: "明天",
            hint: addDays(1),
            onSelect: () => done({ due_date: addDays(1) }),
          },
          {
            id: "week",
            label: "一周后",
            hint: addDays(7),
            onSelect: () => done({ due_date: addDays(7) }),
          },
          {
            id: "twoweeks",
            label: "两周后",
            hint: addDays(14),
            onSelect: () => done({ due_date: addDays(14) }),
          },
          {
            id: "month",
            label: "一个月后",
            hint: addDays(30),
            onSelect: () => done({ due_date: addDays(30) }),
          },
          {
            id: "clear",
            label: "清除截止日期",
            icon: <XCircle size={14} />,
            onSelect: () => done({ due_date: null }),
          },
        ].map((x) => ({ icon: <CalendarDays size={14} />, ...x }));
    }
  })();

  if (!picker || !issue) return null;
  const project = projects.find((p) => p.id === issue.project_id);
  return (
    <Modal open onClose={close} className="max-w-md">
      <CommandList
        key={kind}
        items={items}
        numberShortcuts={kind !== "labels"}
        onQueryChange={setQuery}
        placeholder={
          kind === "labels" ? "搜索或创建标签…" : kind === "assignee" ? "搜索成员…" : "筛选…"
        }
        header={
          <div className="flex items-center gap-2 px-3.5 pt-3 text-xs text-zinc-500">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px]">
              {project?.identifier}-{issue.seq}
            </span>
            <span className="truncate">{issue.title}</span>
          </div>
        }
        footer={
          <span className="flex items-center gap-1.5">
            {kind === "assignee" ? <UserRound size={12} /> : null}
            {kind ? TITLES[kind] : ""} · <Kbd>↵</Kbd> 确认 <Kbd>Esc</Kbd>{" "}
            {kind === "labels" ? "完成" : "取消"}
          </span>
        }
      />
    </Modal>
  );
}
