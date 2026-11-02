import { create } from 'zustand'
import { api } from '@/lib/api'
import type { Issue, IssuePatch, IssueState, Label } from '@/lib/types'
import { toast } from './toast'

interface ProjectMeta {
  states: IssueState[]
  labels: Label[]
}

interface IssuesState {
  /** 所有已加载的任务，按 id 索引，跨项目共享，保证同一任务在各视图中一致。 */
  byId: Record<string, Issue>
  /** 每个项目的任务 id 列表；存在即表示已加载。 */
  projectIssues: Record<string, string[]>
  meta: Record<string, ProjectMeta>
  loadProject: (projectId: string) => Promise<void>
  loadMeta: (projectId: string) => Promise<ProjectMeta>
  upsert: (issues: Issue[]) => void
  create: (projectId: string, b: IssuePatch & { title: string }) => Promise<Issue>
  update: (id: string, patch: IssuePatch) => Promise<void>
  remove: (id: string) => Promise<void>
  createLabel: (projectId: string, name: string, color: string) => Promise<Label>
  deleteLabel: (projectId: string, id: string) => Promise<void>
}

const inflightMeta = new Map<string, Promise<ProjectMeta>>()

export const useIssues = create<IssuesState>((set, get) => ({
  byId: {},
  projectIssues: {},
  meta: {},
  loadProject: async (projectId) => {
    const [issues] = await Promise.all([api.issues(projectId), get().loadMeta(projectId)])
    get().upsert(issues)
    set((s) => ({ projectIssues: { ...s.projectIssues, [projectId]: issues.map((i) => i.id) } }))
  },
  loadMeta: (projectId) => {
    const cached = get().meta[projectId]
    if (cached) return Promise.resolve(cached)
    let p = inflightMeta.get(projectId)
    if (!p) {
      p = Promise.all([api.states(projectId), api.labels(projectId)]).then(([states, labels]) => {
        const m = { states, labels }
        set((s) => ({ meta: { ...s.meta, [projectId]: m } }))
        inflightMeta.delete(projectId)
        return m
      })
      inflightMeta.set(projectId, p)
    }
    return p
  },
  upsert: (issues) => set((s) => ({ byId: { ...s.byId, ...Object.fromEntries(issues.map((i) => [i.id, i])) } })),
  create: async (projectId, b) => {
    const issue = await api.createIssue(projectId, b)
    get().upsert([issue])
    set((s) => {
      const ids = s.projectIssues[projectId]
      return ids ? { projectIssues: { ...s.projectIssues, [projectId]: [issue.id, ...ids] } } : {}
    })
    return issue
  },
  // 乐观更新：先改本地，失败再回滚，让交互零等待。
  update: async (id, patch) => {
    const prev = get().byId[id]
    if (!prev) return
    get().upsert([{ ...prev, ...patch }])
    try {
      get().upsert([await api.updateIssue(id, patch)])
    } catch (e) {
      get().upsert([prev])
      toast.error((e as Error).message)
    }
  },
  remove: async (id) => {
    const prev = get().byId[id]
    if (!prev) return
    const strip = (s: IssuesState) => {
      const byId = { ...s.byId }
      delete byId[id]
      const ids = s.projectIssues[prev.project_id]
      return {
        byId,
        projectIssues: ids ? { ...s.projectIssues, [prev.project_id]: ids.filter((x) => x !== id) } : s.projectIssues,
      }
    }
    const snapshot = { byId: get().byId, projectIssues: get().projectIssues }
    set(strip)
    try {
      await api.deleteIssue(id)
    } catch (e) {
      set(snapshot)
      toast.error((e as Error).message)
    }
  },
  createLabel: async (projectId, name, color) => {
    const label = await api.createLabel(projectId, { name, color })
    set((s) => {
      const m = s.meta[projectId]
      return m ? { meta: { ...s.meta, [projectId]: { ...m, labels: [...m.labels, label] } } } : {}
    })
    return label
  },
  deleteLabel: async (projectId, id) => {
    await api.deleteLabel(id)
    set((s) => {
      const m = s.meta[projectId]
      const byId = Object.fromEntries(
        Object.entries(s.byId).map(([k, v]) => [k, { ...v, label_ids: v.label_ids.filter((l) => l !== id) }]),
      )
      return m ? { byId, meta: { ...s.meta, [projectId]: { ...m, labels: m.labels.filter((l) => l.id !== id) } } } : {}
    })
  },
}))
