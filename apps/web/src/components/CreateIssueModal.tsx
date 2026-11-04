import type { Priority } from "@zhizhi/shared";
import { Button, Kbd, Modal } from "@zhizhi/ui/ui";
import { CalendarDays, ChevronRight, Tag, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { PRIORITIES, priorityMeta } from "@/lib/constants";
import { cn, modKey } from "@/lib/utils";
import { useIssues } from "@/stores/issues";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { Avatar, LabelDot, PriorityIcon, StateIcon } from "./icons";

/** 新建任务弹窗。⌘↵ 提交，勾选「继续创建」可连续录入。 */
export function CreateIssueModal() {
  const open = useUi((s) => s.createOpen);
  const set = useUi((s) => s.set);
  const close = () => set({ createOpen: false, createStateId: null });
  // 每次打开都重新挂载表单，状态自然重置
  return (
    <Modal open={open} onClose={close} className="max-w-2xl" top="10vh">
      {open && <CreateIssueForm onClose={close} />}
    </Modal>
  );
}

function CreateIssueForm({ onClose }: { onClose: () => void }) {
  const presetState = useUi((s) => s.createStateId);
  const projects = useWorkspace((s) => s.projects);
  const members = useWorkspace((s) => s.members);
  const { projectId: routeProject } = useParams();
  const create = useIssues((s) => s.create);
  const loadMeta = useIssues((s) => s.loadMeta);

  const [projectId, setProjectId] = useState<string>(routeProject ?? projects[0]?.id ?? "");
  const meta = useIssues((s) => s.meta[projectId]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [stateId, setStateId] = useState<string | undefined>(presetState ?? undefined);
  const [priority, setPriority] = useState<Priority>("none");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectId) loadMeta(projectId);
  }, [projectId, loadMeta]);

  const close = onClose;

  const submit = async () => {
    if (!title.trim() || !projectId || busy) return;
    setBusy(true);
    try {
      const issue = await create(projectId, {
        title,
        description: desc,
        state_id: stateId,
        priority,
        assignee_id: assignee,
        due_date: due || null,
        label_ids: labelIds,
      });
      const p = projects.find((x) => x.id === projectId);
      toast.success(`已创建 ${p?.identifier}-${issue.seq}`);
      if (more) {
        setTitle("");
        setDesc("");
        titleRef.current?.focus();
      } else close();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const project = projects.find((p) => p.id === projectId);
  const defaultState = useMemo(
    () => meta?.states.find((s) => s.group === "unstarted") ?? meta?.states[0],
    [meta],
  );
  const currentState = meta?.states.find((s) => s.id === stateId) ?? defaultState;

  const chip =
    "inline-flex h-6 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-600 hover:bg-zinc-50";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex items-center gap-1.5 px-4 pt-3.5 text-xs text-zinc-500">
        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setStateId(undefined);
            setLabelIds([]);
          }}
          className="h-6 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 text-xs font-medium text-zinc-700 outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.identifier} · {p.name}
            </option>
          ))}
        </select>
        <ChevronRight size={13} />
        <span>新建任务</span>
      </div>
      <div className="px-4 pt-2">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="任务标题"
          className="w-full bg-transparent text-lg font-medium outline-none placeholder:text-zinc-300"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="添加描述…"
          rows={4}
          className="mt-1 w-full resize-none bg-transparent text-[13px] leading-relaxed text-zinc-700 outline-none placeholder:text-zinc-400"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        <label className={chip}>
          {currentState && (
            <StateIcon group={currentState.group} color={currentState.color} size={12} />
          )}
          <select
            value={currentState?.id ?? ""}
            onChange={(e) => setStateId(e.target.value)}
            className="bg-transparent outline-none"
          >
            {meta?.states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={chip}>
          <PriorityIcon priority={priority} size={12} />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="bg-transparent outline-none"
          >
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key === "none" ? "优先级" : priorityMeta(p.key).label}
              </option>
            ))}
          </select>
        </label>
        <label className={chip}>
          {assignee ? (
            <Avatar name={members.find((m) => m.id === assignee)?.name ?? "?"} size={14} />
          ) : (
            <UserRound size={12} />
          )}
          <select
            value={assignee ?? ""}
            onChange={(e) => setAssignee(e.target.value || null)}
            className="bg-transparent outline-none"
          >
            <option value="">负责人</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className={chip}>
          <CalendarDays size={12} />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="bg-transparent outline-none"
          />
        </label>
        {meta?.labels.map((l) => {
          const on = labelIds.includes(l.id);
          return (
            <button
              type="button"
              key={l.id}
              onClick={() =>
                setLabelIds(on ? labelIds.filter((x) => x !== l.id) : [...labelIds, l.id])
              }
              className={cn(chip, on && "border-zinc-400 bg-zinc-100 text-zinc-800")}
            >
              <LabelDot color={l.color} />
              {l.name}
            </button>
          );
        })}
        {meta && meta.labels.length === 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
            <Tag size={12} /> 暂无标签
          </span>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5">
        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={more}
            onChange={(e) => setMore(e.target.checked)}
            className="accent-zinc-900"
          />
          继续创建
        </label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim() || !project || busy}>
            创建任务
            <span className="flex gap-0.5 opacity-60">
              <Kbd className="border-white/20 bg-white/10 text-white">{modKey}</Kbd>
              <Kbd className="border-white/20 bg-white/10 text-white">↵</Kbd>
            </span>
          </Button>
        </div>
      </div>
    </form>
  );
}
