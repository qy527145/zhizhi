import { Settings, Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Avatar, LabelDot } from '@/components/icons'
import { Button, Input } from '@/components/ui'
import { LABEL_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useIssues } from '@/stores/issues'
import { toast } from '@/stores/toast'
import { useWorkspace } from '@/stores/workspace'

const ROLE: Record<string, string> = { owner: '所有者', admin: '管理员', member: '成员' }

export function SettingsPage() {
  const ws = useWorkspace((s) => s.workspaces.find((w) => w.slug === s.slug))
  const members = useWorkspace((s) => s.members)
  const projects = useWorkspace((s) => s.projects)
  const addMember = useWorkspace((s) => s.addMember)
  const me = useAuth((s) => s.user)
  const myRole = members.find((m) => m.id === me?.id)?.role
  const [email, setEmail] = useState('')

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await addMember(email)
      setEmail('')
      toast.success('已添加成员')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200/80 px-5">
        <Settings size={15} className="text-zinc-400" />
        <h1 className="text-[14px] font-medium">工作区设置</h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-10 px-6 py-8">
          <section>
            <h2 className="text-base font-semibold">{ws?.name}</h2>
            <p className="mt-1 text-[13px] text-zinc-500">
              {location.host}/{ws?.slug} · 创建于 {ws && new Date(ws.created_at).toLocaleDateString('zh-CN')}
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-[13px] font-medium">成员 · {members.length}</h3>
            {(myRole === 'owner' || myRole === 'admin') && (
              <form onSubmit={invite} className="mb-3 flex gap-2">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="输入已注册用户的邮箱" required />
                <Button type="submit" variant="primary" className="h-8 shrink-0">
                  <UserPlus size={14} /> 添加
                </Button>
              </form>
            )}
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={m.name} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">
                      {m.name} {m.id === me?.id && <span className="font-normal text-zinc-400">（你）</span>}
                    </div>
                    <div className="text-xs text-zinc-500">{m.email}</div>
                  </div>
                  <span className="text-xs text-zinc-500">{ROLE[m.role]}</span>
                </div>
              ))}
            </div>
          </section>

          {projects.map((p) => (
            <ProjectSettings key={p.id} projectId={p.id} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectSettings({ projectId }: { projectId: string }) {
  const project = useWorkspace((s) => s.projects.find((p) => p.id === projectId))!
  const updateProject = useWorkspace((s) => s.updateProject)
  const deleteProject = useWorkspace((s) => s.deleteProject)
  const meta = useIssues((s) => s.meta[projectId])
  const loadMeta = useIssues((s) => s.loadMeta)
  const createLabel = useIssues((s) => s.createLabel)
  const deleteLabel = useIssues((s) => s.deleteLabel)
  const [name, setName] = useState(project.name)
  const [labelName, setLabelName] = useState('')
  const [color, setColor] = useState(LABEL_COLORS[0])

  useEffect(() => {
    loadMeta(projectId)
  }, [projectId, loadMeta])

  const run = (fn: () => Promise<unknown>, ok?: string) => async () => {
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium">
        项目 · {project.name} <span className="font-mono text-xs font-normal text-zinc-400">{project.identifier}</span>
      </h3>
      <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            className="h-8 shrink-0"
            disabled={!name.trim() || name === project.name}
            onClick={run(() => updateProject(projectId, { name }), '项目名称已更新')}
          >
            保存
          </Button>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-zinc-500">标签</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {meta?.labels.map((l) => (
              <span key={l.id} className="group inline-flex h-6 items-center gap-1.5 rounded-full border border-zinc-200 pl-2 pr-1 text-xs text-zinc-700">
                <LabelDot color={l.color} />
                {l.name}
                <button
                  onClick={run(() => deleteLabel(projectId, l.id))}
                  className="rounded-full p-0.5 text-zinc-300 hover:bg-zinc-100 hover:text-red-500"
                  aria-label={`删除标签 ${l.name}`}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
            {meta?.labels.length === 0 && <span className="text-xs text-zinc-400">还没有标签</span>}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                await createLabel(projectId, labelName.trim(), color)
                setLabelName('')
              })()
            }}
          >
            <div className="flex gap-1">
              {LABEL_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn('size-4 rounded-full ring-offset-2 transition', c === color && 'ring-2 ring-zinc-400')}
                  style={{ background: c }}
                />
              ))}
            </div>
            <Input value={labelName} onChange={(e) => setLabelName(e.target.value)} placeholder="新标签名称" className="h-7" />
            <Button type="submit" className="shrink-0" disabled={!labelName.trim()}>
              添加
            </Button>
          </form>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
          <span className="text-xs text-zinc-500">删除项目将同时删除其中所有任务，且无法恢复。</span>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`确定删除项目「${project.name}」及其全部任务？`)) run(() => deleteProject(projectId), '项目已删除')()
            }}
          >
            删除项目
          </Button>
        </div>
      </div>
    </section>
  )
}
