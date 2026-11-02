import { ArrowUpRight, Link2, MessageSquare, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '@/lib/api'
import { PRIORITIES } from '@/lib/constants'
import type { Activity, Comment, Issue } from '@/lib/types'
import { modKey, relativeTime } from '@/lib/utils'
import { useIssues } from '@/stores/issues'
import { toast } from '@/stores/toast'
import { useUi } from '@/stores/ui'
import { useWorkspace } from '@/stores/workspace'
import { Avatar, LabelDot } from './icons'
import { AssigneeButton, DueButton, PriorityButton, StateButton } from './IssueProps'
import { Button, CloseButton, IconButton, Kbd } from './ui'

const FIELD_LABEL: Record<string, string> = {
  title: '标题',
  state_id: '状态',
  priority: '优先级',
  assignee_id: '负责人',
  due_date: '截止日期',
  labels: '标签',
}

function useTimeline(issue: Issue) {
  const [comments, setComments] = useState<Comment[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  useEffect(() => {
    let alive = true
    Promise.all([api.comments(issue.id), api.activities(issue.id)]).then(([c, a]) => {
      if (alive) {
        setComments(c)
        setActivities(a)
      }
    })
    return () => {
      alive = false
    }
    // 任务属性变化时刷新活动记录
  }, [issue.id, issue.updated_at])
  return { comments, setComments, activities }
}

function ActivityText({ a, issue }: { a: Activity; issue: Issue }) {
  const members = useWorkspace((s) => s.members)
  const states = useIssues((s) => s.meta[issue.project_id]?.states)
  const fmt = (v: string | null) => {
    if (v === null) return '空'
    if (a.field === 'state_id') return states?.find((s) => s.id === v)?.name ?? '未知状态'
    if (a.field === 'priority') return PRIORITIES.find((p) => p.key === v)?.label ?? v
    if (a.field === 'assignee_id') return members.find((m) => m.id === v)?.name ?? '未知成员'
    return v
  }
  if (a.field === 'created') return <>创建了任务</>
  if (a.field === 'labels') return <>更新了标签</>
  if (a.field === 'assignee_id' && !a.new_value) return <>取消了指派</>
  if (a.field === 'due_date' && !a.new_value) return <>清除了截止日期</>
  return (
    <>
      将{FIELD_LABEL[a.field] ?? a.field}改为 <span className="font-medium text-zinc-700">{fmt(a.new_value)}</span>
    </>
  )
}

export function IssueDetail({ issueId, mode }: { issueId: string; mode: 'peek' | 'page' }) {
  const issue = useIssues((s) => s.byId[issueId])
  const labels = useIssues((s) => (issue ? s.meta[issue.project_id]?.labels : undefined))
  const update = useIssues((s) => s.update)
  const remove = useIssues((s) => s.remove)
  const members = useWorkspace((s) => s.members)
  const project = useWorkspace((s) => s.projects.find((p) => p.id === issue?.project_id))
  const set = useUi((s) => s.set)
  const { slug } = useParams()

  if (!issue) return null
  const href = `/${slug}/projects/${issue.project_id}/issues/${issue.id}`
  const del = () => {
    if (!confirm(`确定删除任务「${issue.title}」？此操作不可撤销。`)) return
    set({ peekId: null })
    remove(issue.id)
  }

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
            navigator.clipboard.writeText(location.origin + href)
            toast.success('链接已复制')
          }}
        >
          <Link2 size={14} />
        </IconButton>
        {mode === 'peek' && (
          <Link to={href} onClick={() => set({ peekId: null })}>
            <IconButton title="全屏打开">
              <ArrowUpRight size={14} />
            </IconButton>
          </Link>
        )}
        <IconButton title={`删除（${modKey}⌫）`} onClick={del} className="hover:text-red-600">
          <Trash2 size={14} />
        </IconButton>
        {mode === 'peek' && <CloseButton onClick={() => set({ peekId: null })} />}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <TitleEditor key={`t-${issue.id}-${issue.title}`} issue={issue} onSave={(title) => update(issue.id, { title })} />
          <DescriptionEditor key={`d-${issue.id}-${issue.description}`} issue={issue} onSave={(description) => update(issue.id, { description })} />
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
          <Prop label="截止日期" k="D">
            <DueButton issue={issue} withLabel />
          </Prop>
          <Prop label="标签" k="L">
            <button
              onClick={() => set({ picker: { kind: 'labels', issueId: issue.id } })}
              className="flex min-h-6 flex-wrap items-center gap-1 rounded-md px-1 text-xs hover:bg-zinc-100"
            >
              {issue.label_ids.length === 0 && <span className="text-zinc-400">添加标签</span>}
              {issue.label_ids.map((id) => {
                const l = labels?.find((x) => x.id === id)
                return (
                  l && (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-1.5 py-0.5 text-zinc-600">
                      <LabelDot color={l.color} />
                      {l.name}
                    </span>
                  )
                )
              })}
            </button>
          </Prop>
          <div className="mt-4 space-y-1 border-t border-zinc-100 pt-4 text-xs text-zinc-400">
            <div>创建者：{members.find((m) => m.id === issue.created_by)?.name ?? '—'}</div>
            <div>创建于 {relativeTime(issue.created_at)}</div>
            <div>更新于 {relativeTime(issue.updated_at)}</div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Prop({ label, k, children }: { label: string; k: string; children: React.ReactNode }) {
  return (
    <div className="group flex min-h-8 items-center">
      <span className="flex w-20 shrink-0 items-center gap-1 text-xs text-zinc-500">
        {label}
        <Kbd className="hidden h-4 min-w-4 text-[10px] group-hover:inline-flex">{k}</Kbd>
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function TitleEditor({ issue, onSave }: { issue: Issue; onSave: (t: string) => void }) {
  const [value, setValue] = useState(issue.title)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    // 按 E 键进入标题编辑
    const onEdit = () => ref.current?.focus()
    window.addEventListener('zhizhi:edit-title', onEdit)
    return () => window.removeEventListener('zhizhi:edit-title', onEdit)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = '0'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [value])
  const commit = () => {
    const t = value.trim()
    if (t && t !== issue.title) onSave(t)
    else setValue(issue.title)
  }
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          ref.current?.blur()
        }
        if (e.key === 'Escape') {
          e.stopPropagation()
          setValue(issue.title)
          setTimeout(() => ref.current?.blur())
        }
      }}
      className="w-full resize-none overflow-hidden bg-transparent text-xl font-semibold leading-snug text-zinc-900 outline-none"
    />
  )
}

function DescriptionEditor({ issue, onSave }: { issue: Issue; onSave: (d: string) => void }) {
  const [value, setValue] = useState(issue.description)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = '0'
      el.style.height = `${Math.max(el.scrollHeight, 96)}px`
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== issue.description && onSave(value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          ref.current?.blur()
        }
      }}
      placeholder="添加描述…"
      className="mt-3 w-full resize-none overflow-hidden bg-transparent text-[13.5px] leading-relaxed text-zinc-700 outline-none placeholder:text-zinc-400"
    />
  )
}

function Timeline({ issue, members }: { issue: Issue; members: { id: string; name: string }[] }) {
  const { comments, setComments, activities } = useTimeline(issue)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? '未知成员'

  const items = [
    ...activities.map((a) => ({ t: a.created_at, kind: 'activity' as const, a })),
    ...comments.map((c) => ({ t: c.created_at, kind: 'comment' as const, c })),
  ].sort((x, y) => x.t.localeCompare(y.t))

  const submit = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      const c = await api.createComment(issue.id, body)
      setComments((cs) => [...cs, c])
      setBody('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 border-t border-zinc-100 pt-5">
      <div className="mb-4 text-[13px] font-medium text-zinc-800">动态</div>
      <div className="space-y-3">
        {items.map((it) =>
          it.kind === 'activity' ? (
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
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">{it.c.body}</div>
            </div>
          ),
        )}
      </div>
      <div className="mt-4 rounded-lg border border-zinc-200 focus-within:border-zinc-300 focus-within:shadow-sm">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape') (e.target as HTMLElement).blur()
          }}
          placeholder="写下评论…"
          rows={2}
          className="block w-full resize-none bg-transparent px-3.5 pt-2.5 text-[13px] outline-none placeholder:text-zinc-400"
        />
        <div className="flex items-center justify-end gap-2 px-2 pb-2">
          <span className="text-xs text-zinc-400">
            {modKey} ↵ 发送
          </span>
          <Button variant="secondary" disabled={!body.trim() || busy} onClick={submit}>
            <MessageSquare size={13} /> 评论
          </Button>
        </div>
      </div>
    </div>
  )
}
