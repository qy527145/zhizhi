import type { Activity, Attachment, Comment, Issue } from "@zhizhi/shared";
import { Button, CloseButton, IconButton, Kbd } from "@zhizhi/ui/ui";
import { ArrowUpRight, Link2, MessageSquare, Paperclip, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "@/lib/api";
import { PRIORITIES } from "@/lib/constants";
import { modKey, relativeTime } from "@/lib/utils";
import { useIssues } from "@/stores/issues";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { AssigneeButton, DueButton, PriorityButton, StartButton, StateButton } from "./IssueProps";
import { Avatar, LabelDot } from "./icons";
import { AttachmentStrip, Markdown } from "./Markdown";
import { MarkdownEditor } from "./MarkdownEditor";

const FIELD_LABEL: Record<string, string> = {
  title: "标题",
  state_id: "状态",
  priority: "优先级",
  assignee_id: "负责人",
  due_date: "截止日期",
  start_date: "开始日期",
  labels: "标签",
};

function useTimeline(issue: Issue) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  // issue.updated_at 不是 effect 的输入，而是「任务被改动过」的信号：
  // 属性变化后需要重新拉取活动记录，因此显式出现在依赖里。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 见上
  useEffect(() => {
    let alive = true;
    Promise.all([api.comments(issue.id), api.activities(issue.id)]).then(([c, a]) => {
      if (alive) {
        setComments(c);
        setActivities(a);
      }
    });
    return () => {
      alive = false;
    };
  }, [issue.id, issue.updated_at]);
  return { comments, setComments, activities };
}

function ActivityText({ a, issue }: { a: Activity; issue: Issue }) {
  const members = useWorkspace((s) => s.members);
  const states = useIssues((s) => s.meta[issue.project_id]?.states);
  const fmt = (v: string | null) => {
    if (v === null) return "空";
    if (a.field === "state_id") return states?.find((s) => s.id === v)?.name ?? "未知状态";
    if (a.field === "priority") return PRIORITIES.find((p) => p.key === v)?.label ?? v;
    if (a.field === "assignee_id") return members.find((m) => m.id === v)?.name ?? "未知成员";
    return v;
  };
  if (a.field === "created") return <>创建了任务</>;
  if (a.field === "labels") return <>更新了标签</>;
  if (a.field === "assignee_id" && !a.new_value) return <>取消了指派</>;
  if (a.field === "due_date" && !a.new_value) return <>清除了截止日期</>;
  if (a.field === "start_date" && !a.new_value) return <>清除了开始日期</>;
  return (
    <>
      将{FIELD_LABEL[a.field] ?? a.field}改为{" "}
      <span className="font-medium text-zinc-700">{fmt(a.new_value)}</span>
    </>
  );
}

export function IssueDetail({ issueId, mode }: { issueId: string; mode: "peek" | "page" }) {
  const issue = useIssues((s) => s.byId[issueId]);
  const labels = useIssues((s) => (issue ? s.meta[issue.project_id]?.labels : undefined));
  const update = useIssues((s) => s.update);
  const remove = useIssues((s) => s.remove);
  const members = useWorkspace((s) => s.members);
  const project = useWorkspace((s) => s.projects.find((p) => p.id === issue?.project_id));
  const set = useUi((s) => s.set);
  const { slug } = useParams();

  if (!issue) return null;
  const href = `/${slug}/projects/${issue.project_id}/issues/${issue.id}`;
  const del = () => {
    if (!confirm(`确定删除任务「${issue.title}」？此操作不可撤销。`)) return;
    set({ peekId: null });
    remove(issue.id);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-zinc-100 px-4">
        <span className="font-mono text-xs text-zinc-500">
          {project?.identifier}-{issue.seq}
        </span>
        <span className="flex-1" />
        <IconButton
          title="复制链接"
          onClick={() => {
            navigator.clipboard.writeText(location.origin + href);
            toast.success("链接已复制");
          }}
        >
          <Link2 size={14} />
        </IconButton>
        {mode === "peek" && (
          <Link to={href} onClick={() => set({ peekId: null })}>
            <IconButton title="全屏打开">
              <ArrowUpRight size={14} />
            </IconButton>
          </Link>
        )}
        <IconButton title={`删除（${modKey}⌫）`} onClick={del} className="hover:text-red-600">
          <Trash2 size={14} />
        </IconButton>
        {mode === "peek" && <CloseButton onClick={() => set({ peekId: null })} />}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <TitleEditor
            key={`t-${issue.id}-${issue.title}`}
            issue={issue}
            onSave={(title) => update(issue.id, { title })}
          />
          <DescriptionEditor
            key={`d-${issue.id}-${issue.description}`}
            issue={issue}
            onSave={(description, attachment_ids) =>
              update(issue.id, { description, attachment_ids })
            }
          />
          {issue.attachments.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                <Paperclip size={12} /> 附件 · {issue.attachments.length}
              </div>
              <AttachmentStrip items={issue.attachments} />
            </div>
          )}
          <Timeline issue={issue} members={members} />
        </div>
        <aside className="w-64 shrink-0 space-y-1 overflow-y-auto border-l border-zinc-100 px-3 py-4">
          <Prop label="状态" k="S">
            <StateButton issue={issue} withLabel />
          </Prop>
          <Prop label="优先级" k="P">
            <PriorityButton issue={issue} withLabel />
          </Prop>
          <Prop label="负责人" k="A">
            <AssigneeButton issue={issue} withLabel />
          </Prop>
          <Prop label="开始日期">
            <StartButton issue={issue} />
          </Prop>
          <Prop label="截止日期" k="D">
            <DueButton issue={issue} withLabel />
          </Prop>
          <Prop label="标签" k="L">
            <button
              type="button"
              onClick={() => set({ picker: { kind: "labels", issueId: issue.id } })}
              className="flex min-h-6 flex-wrap items-center gap-1 rounded-md px-1 text-xs hover:bg-zinc-100"
            >
              {issue.label_ids.length === 0 && <span className="text-zinc-400">添加标签</span>}
              {issue.label_ids.map((id) => {
                const l = labels?.find((x) => x.id === id);
                return (
                  l && (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-1.5 py-0.5 text-zinc-600"
                    >
                      <LabelDot color={l.color} />
                      {l.name}
                    </span>
                  )
                );
              })}
            </button>
          </Prop>
          <div className="mt-4 space-y-1 border-t border-zinc-100 pt-4 text-xs text-zinc-400">
            <div>创建者：{members.find((m) => m.id === issue.created_by)?.name ?? "—"}</div>
            <div>创建于 {relativeTime(issue.created_at)}</div>
            <div>更新于 {relativeTime(issue.updated_at)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Prop({ label, k, children }: { label: string; k?: string; children: React.ReactNode }) {
  return (
    <div className="group flex min-h-8 items-center">
      <span className="flex w-20 shrink-0 items-center gap-1 text-xs text-zinc-500">
        {label}
        {k && <Kbd className="hidden h-4 min-w-4 text-[10px] group-hover:inline-flex">{k}</Kbd>}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TitleEditor({ issue, onSave }: { issue: Issue; onSave: (t: string) => void }) {
  const [value, setValue] = useState(issue.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // 按 E 键进入标题编辑
    const onEdit = () => ref.current?.focus();
    window.addEventListener("zhizhi:edit-title", onEdit);
    return () => window.removeEventListener("zhizhi:edit-title", onEdit);
  }, []);
  // value 决定内容高度，必须作为依赖触发重算。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 见上
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "0";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  const commit = () => {
    const t = value.trim();
    if (t && t !== issue.title) onSave(t);
    else setValue(issue.title);
  };
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          ref.current?.blur();
        }
        if (e.key === "Escape") {
          e.stopPropagation();
          setValue(issue.title);
          setTimeout(() => ref.current?.blur());
        }
      }}
      className="w-full resize-none overflow-hidden bg-transparent text-xl font-semibold leading-snug text-zinc-900 outline-none"
    />
  );
}

/**
 * 描述：默认渲染 Markdown（图文混排），点击进入编辑；失焦或 ⌘↵ 保存。
 * 新上传的图片随保存一起绑定到任务。
 */
function DescriptionEditor({
  issue,
  onSave,
}: {
  issue: Issue;
  onSave: (d: string, attachmentIds: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(issue.description);
  const [fresh, setFresh] = useState<Attachment[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  const commit = () => {
    if (value.includes("](uploading-")) return; // 等上传完再保存
    setEditing(false);
    const ids = fresh.filter((a) => value.includes(a.id)).map((a) => a.id);
    if (value !== issue.description || ids.length) onSave(value, ids);
    setFresh([]);
  };

  if (!editing) {
    return (
      // 整块可点击进入编辑；内部图片点击会冒泡到这里之前被灯箱拦截。
      // biome-ignore lint/a11y/useSemanticElements: 内部含图片按钮，不能嵌套 <button>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a")) return;
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(true);
        }}
        className="group mt-3 -mx-2 cursor-text rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-50"
      >
        {issue.description.trim() ? (
          <Markdown text={issue.description} />
        ) : (
          <span className="text-[13.5px] text-zinc-400">添加描述…支持 Markdown 与图片</span>
        )}
      </div>
    );
  }
  return (
    // onBlur 只用来侦测焦点离开整个编辑区（focusout 冒泡），不是交互入口。
    // biome-ignore lint/a11y/noStaticElementInteractions: 见上
    <div
      ref={wrap}
      className="mt-3 -mx-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-card"
      onBlur={(e) => {
        // 焦点仍在编辑器内部（如点工具栏按钮）时不保存。
        if (!wrap.current?.contains(e.relatedTarget as Node)) commit();
      }}
    >
      <MarkdownEditor
        value={value}
        onChange={setValue}
        autoFocus
        attachments={[...issue.attachments, ...fresh].filter((a) => value.includes(a.id))}
        onAttach={(a) => setFresh((xs) => [...xs, a])}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setValue(issue.description);
            setFresh([]);
            setEditing(false);
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        minRows={5}
      />
      <div className="mt-1 flex justify-end gap-2 text-xs text-zinc-400">
        <span>
          <Kbd>Esc</Kbd> 放弃 · <Kbd>{modKey}</Kbd>
          <Kbd>↵</Kbd> 保存
        </span>
      </div>
    </div>
  );
}

function Timeline({ issue, members }: { issue: Issue; members: { id: string; name: string }[] }) {
  const { comments, setComments, activities } = useTimeline(issue);
  const [body, setBody] = useState("");
  const [fresh, setFresh] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "未知成员";

  const items = [
    ...activities.map((a) => ({ t: a.created_at, kind: "activity" as const, a })),
    ...comments.map((c) => ({ t: c.created_at, kind: "comment" as const, c })),
  ].sort((x, y) => x.t.localeCompare(y.t));

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const ids = fresh.filter((a) => body.includes(a.id)).map((a) => a.id);
      const c = await api.createComment(issue.id, body, ids);
      setComments((cs) => [...cs, c]);
      setBody("");
      setFresh([]);
      // 刷新任务：评论数要变，评论里的图片也要进附件区。
      useIssues.getState().upsert([await api.issue(issue.id)]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 border-t border-zinc-100 pt-5">
      <div className="mb-4 text-[13px] font-medium text-zinc-800">动态</div>
      <div className="space-y-3">
        {items.map((it) =>
          it.kind === "activity" ? (
            <div key={it.a.id} className="flex items-center gap-2 pl-1 text-xs text-zinc-500">
              <Avatar name={name(it.a.actor_id)} size={16} />
              <span className="font-medium text-zinc-700">{name(it.a.actor_id)}</span>
              <span>
                <ActivityText a={it.a} issue={issue} />
              </span>
              <span className="text-zinc-400">· {relativeTime(it.a.created_at)}</span>
            </div>
          ) : (
            <div key={it.c.id} className="rounded-lg border border-zinc-200 px-3.5 py-2.5">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <Avatar name={name(it.c.author_id)} size={16} />
                <span className="font-medium text-zinc-800">{name(it.c.author_id)}</span>
                <span className="text-zinc-400">{relativeTime(it.c.created_at)}</span>
              </div>
              <Markdown text={it.c.body} />
            </div>
          ),
        )}
      </div>
      <div className="mt-4 rounded-lg border border-zinc-200 px-3.5 pt-2.5 pb-2 transition-[border-color,box-shadow] duration-150 focus-within:border-zinc-300 focus-within:shadow-card">
        <MarkdownEditor
          compact
          value={body}
          onChange={setBody}
          attachments={[]}
          onAttach={(a) => setFresh((xs) => [...xs, a])}
          placeholder="写下评论…支持 Markdown，可粘贴图片"
          minRows={2}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") (e.target as HTMLElement).blur();
          }}
        />
        <div className="-mt-6 flex items-center justify-end gap-2">
          <span className="text-xs text-zinc-400">{modKey} ↵ 发送</span>
          <Button variant="secondary" disabled={!body.trim() || busy} onClick={submit}>
            <MessageSquare size={13} /> 评论
          </Button>
        </div>
      </div>
    </div>
  );
}
