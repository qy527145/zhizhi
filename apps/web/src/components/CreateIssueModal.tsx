import type { Attachment, Priority } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { Button, Kbd, Modal } from "@zhizhi/ui/ui";
import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
  FolderKanban,
  Maximize2,
  Minimize2,
  Tag,
  UserRound,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { priorityMeta } from "@/lib/constants";
import { formatDue, modKey } from "@/lib/utils";
import { useIssues } from "@/stores/issues";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { type DraftPick, DraftPicker, Popover } from "./DraftPicker";
import { Avatar, LabelDot, PriorityIcon, StateIcon } from "./icons";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";

const LAST_PROJECT = "zhizhi.lastProject";
const DRAFT_KEY = (projectId: string) => `zhizhi.draft.${projectId}`;

interface Draft {
  title: string;
  desc: string;
  attachments: Attachment[];
}

const readDraft = (projectId: string): Draft | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY(projectId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
};

/** 新建任务弹窗。⌘↵ 提交，勾选「继续创建」可连续录入。 */
export function CreateIssueModal() {
  const open = useUi((s) => s.createOpen);
  const set = useUi((s) => s.set);
  const [wide, setWide] = useState(false);
  const close = () => set({ createOpen: false, createStateId: null });
  // 每次打开都重新挂载表单，状态自然重置（草稿从 sessionStorage 恢复）。
  return (
    <Modal
      open={open}
      onClose={close}
      className={cn("max-w-2xl transition-[max-width] duration-200", wide && "max-w-4xl")}
      top="9vh"
    >
      {open && <CreateIssueForm onClose={close} wide={wide} onToggleWide={() => setWide(!wide)} />}
    </Modal>
  );
}

function CreateIssueForm({
  onClose,
  wide,
  onToggleWide,
}: {
  onClose: () => void;
  wide: boolean;
  onToggleWide: () => void;
}) {
  const presetState = useUi((s) => s.createStateId);
  const projects = useWorkspace((s) => s.projects);
  const members = useWorkspace((s) => s.members);
  const { projectId: routeProject, slug } = useParams();
  const navigate = useNavigate();
  const create = useIssues((s) => s.create);
  const loadMeta = useIssues((s) => s.loadMeta);

  // 当前项目页优先，其次记住上一次选择的项目。
  const initialProject =
    routeProject ??
    projects.find((p) => p.id === localStorage.getItem(LAST_PROJECT))?.id ??
    projects[0]?.id ??
    "";
  const [projectId, setProjectId] = useState<string>(initialProject);
  const meta = useIssues((s) => s.meta[projectId]);
  const restored = useMemo(() => readDraft(initialProject), [initialProject]);
  const [title, setTitle] = useState(restored?.title ?? "");
  const [desc, setDesc] = useState(restored?.desc ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(restored?.attachments ?? []);
  const [stateId, setStateId] = useState<string | undefined>(presetState ?? undefined);
  const [priority, setPriority] = useState<Priority>("none");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ el: HTMLElement; p: DraftPick } | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  useEffect(() => {
    if (projectId) loadMeta(projectId);
  }, [projectId, loadMeta]);

  useEffect(() => {
    titleRef.current?.focus();
    if (restored?.title) toast.success("已恢复未提交的草稿");
  }, [restored]);

  // 草稿按项目暂存：误关弹窗、切走页面都不会丢内容。
  useEffect(() => {
    if (!projectId) return;
    if (title || desc) {
      sessionStorage.setItem(DRAFT_KEY(projectId), JSON.stringify({ title, desc, attachments }));
    } else {
      sessionStorage.removeItem(DRAFT_KEY(projectId));
    }
  }, [projectId, title, desc, attachments]);

  // 标题自动撑高，长标题不会被截断。
  // biome-ignore lint/correctness/useExhaustiveDependencies: title 决定高度
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = "0";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [title]);

  const project = projects.find((p) => p.id === projectId);
  const defaultState = useMemo(
    () => meta?.states.find((s) => s.group === "unstarted") ?? meta?.states[0],
    [meta],
  );
  const currentState = meta?.states.find((s) => s.id === stateId) ?? defaultState;
  const assigneeName = members.find((m) => m.id === assignee)?.name;
  const labels = meta?.labels.filter((l) => labelIds.includes(l.id)) ?? [];

  const open = (e: React.MouseEvent<HTMLElement> | HTMLElement, p: DraftPick) =>
    setPick({ el: "currentTarget" in e ? e.currentTarget : e, p });

  const submit = async () => {
    if (!title.trim() || !projectId || busy) return;
    if (desc.includes("](uploading-")) {
      toast.error("图片还在上传，请稍候");
      return;
    }
    setBusy(true);
    try {
      // 正文里已删除的图片不再绑定，避免产生无人引用的附件。
      const used = attachments.filter((a) => desc.includes(a.id));
      const issue = await create(projectId, {
        title: title.trim(),
        description: desc,
        state_id: stateId,
        priority,
        assignee_id: assignee,
        due_date: due,
        start_date: start,
        label_ids: labelIds,
        attachment_ids: used.map((a) => a.id),
      });
      sessionStorage.removeItem(DRAFT_KEY(projectId));
      localStorage.setItem(LAST_PROJECT, projectId);
      useUi.getState().set({ focusedId: issue.id, flashId: issue.id });
      toast.success(`已创建 ${project?.identifier}-${issue.seq}`, {
        label: "查看",
        run: () => navigate(`/${slug}/projects/${projectId}/issues/${issue.id}`),
      });
      if (more) {
        // 连续创建：保留属性，只清空正文，方便批量录入同类任务。
        setTitle("");
        setDesc("");
        setAttachments([]);
        titleRef.current?.focus();
      } else onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
      className="flex max-h-[80vh] flex-col"
    >
      <div className="flex items-center gap-1.5 px-5 pt-4 text-xs text-zinc-500">
        <button
          type="button"
          onClick={(e) =>
            open(e, {
              kind: "project",
              value: projectId,
              onChange: (id) => {
                setProjectId(id);
                setStateId(undefined);
                setLabelIds([]);
              },
            })
          }
          className="press inline-flex h-6 items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 font-medium text-zinc-700 hover:bg-zinc-100"
        >
          <FolderKanban size={12} className="text-zinc-400" />
          {project ? project.name : "选择项目"}
          {project && (
            <span className="font-mono text-[10px] text-zinc-400">{project.identifier}</span>
          )}
        </button>
        <ChevronRight size={13} className="text-zinc-300" />
        <span>新建任务</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onToggleWide}
          title={wide ? "收起" : "展开"}
          className="press rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          {wide ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-2">
        <textarea
          ref={titleRef}
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
          onKeyDown={(e) => {
            // 标题里回车直接进入描述，符合「先写标题再补细节」的节奏。
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              editorRef.current?.focus();
            }
          }}
          placeholder="任务标题"
          className="w-full resize-none overflow-hidden bg-transparent text-xl font-semibold leading-snug text-zinc-900 outline-none placeholder:text-zinc-300"
        />
        <MarkdownEditor
          ref={editorRef}
          value={desc}
          onChange={setDesc}
          attachments={attachments}
          onAttach={(a) => setAttachments((xs) => [...xs, a])}
          onRemoveAttachment={(id) => {
            setAttachments((xs) => xs.filter((a) => a.id !== id));
            setDesc((d) => d.replace(new RegExp(`!?\\[[^\\]]*\\]\\(${id}\\)\\n?`, "g"), ""));
          }}
          minRows={wide ? 10 : 5}
          className="mt-2"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
        <Chip
          onClick={(e) =>
            open(e, { kind: "state", projectId, value: currentState?.id, onChange: setStateId })
          }
        >
          {currentState && (
            <StateIcon group={currentState.group} color={currentState.color} size={12} />
          )}
          {currentState?.name ?? "状态"}
        </Chip>
        <Chip
          active={priority !== "none"}
          onClick={(e) => open(e, { kind: "priority", value: priority, onChange: setPriority })}
        >
          <PriorityIcon priority={priority} size={12} />
          {priority === "none" ? "优先级" : priorityMeta(priority).label}
        </Chip>
        <Chip
          active={!!assignee}
          onClick={(e) => open(e, { kind: "assignee", value: assignee, onChange: setAssignee })}
        >
          {assigneeName ? <Avatar name={assigneeName} size={14} /> : <UserRound size={12} />}
          {assigneeName ?? "负责人"}
        </Chip>
        <Chip
          active={labels.length > 0}
          onClick={(e) =>
            open(e, { kind: "labels", projectId, value: labelIds, onChange: setLabelIds })
          }
        >
          {labels.length ? (
            <>
              <span className="flex -space-x-0.5">
                {labels.slice(0, 3).map((l) => (
                  <LabelDot key={l.id} color={l.color} />
                ))}
              </span>
              {labels.length === 1 ? labels[0]?.name : `${labels.length} 个标签`}
            </>
          ) : (
            <>
              <Tag size={12} /> 标签
            </>
          )}
        </Chip>
        <Chip
          active={!!start}
          onClick={(e) =>
            open(e, { kind: "date", title: "开始日期", value: start, onChange: setStart })
          }
        >
          <CalendarClock size={12} />
          {start ? `开始 ${formatDue(start)}` : "开始日期"}
        </Chip>
        <Chip
          active={!!due}
          onClick={(e) =>
            open(e, { kind: "date", title: "截止日期", value: due, onChange: setDue })
          }
        >
          <CalendarDays size={12} />
          {due ? `截止 ${formatDue(due)}` : "截止日期"}
        </Chip>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-5 py-2.5">
        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={more}
            onChange={(e) => setMore(e.target.checked)}
            className="accent-accent"
          />
          继续创建
        </label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="accent" disabled={!title.trim() || !project || busy}>
            {busy ? "创建中…" : "创建任务"}
            <span className="flex gap-0.5 opacity-70">
              <Kbd className="border-white/20 bg-white/10 text-white">{modKey}</Kbd>
              <Kbd className="border-white/20 bg-white/10 text-white">↵</Kbd>
            </span>
          </Button>
        </div>
      </div>

      {pick && (
        <Popover anchor={pick.el} onClose={() => setPick(null)}>
          <DraftPicker pick={pick.p} onClose={() => setPick(null)} />
        </Popover>
      )}
    </form>
  );
}

function Chip({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
        active
          ? "border-zinc-300 bg-white text-zinc-800 shadow-card"
          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
      )}
    >
      {children}
    </button>
  );
}
