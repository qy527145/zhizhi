import { FolderKanban } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { IssuesView } from '@/components/IssuesView'
import { Spinner } from '@/components/ui'
import { useIssues } from '@/stores/issues'
import { useWorkspace } from '@/stores/workspace'

export function ProjectIssuesPage() {
  const { projectId } = useParams()
  const project = useWorkspace((s) => s.projects.find((p) => p.id === projectId))
  const ids = useIssues((s) => (projectId ? s.projectIssues[projectId] : undefined))
  const byId = useIssues((s) => s.byId)
  const states = useIssues((s) => (projectId ? s.meta[projectId]?.states : undefined))
  const loadProject = useIssues((s) => s.loadProject)
  const [error, setError] = useState('')

  useEffect(() => {
    if (projectId) loadProject(projectId).catch((e) => setError(e.message))
  }, [projectId, loadProject])

  const issues = useMemo(() => (ids ?? []).map((id) => byId[id]).filter(Boolean), [ids, byId])

  if (!project) return <div className="p-10 text-zinc-500">项目不存在或已被删除。</div>
  if (error) return <div className="p-10 text-zinc-500">{error}</div>
  if (!ids || !states) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )
  }
  return (
    <IssuesView
      key={projectId}
      title={project.name}
      icon={<FolderKanban size={15} />}
      issues={issues}
      states={states}
      emptyText="这个项目还没有任务"
    />
  )
}
