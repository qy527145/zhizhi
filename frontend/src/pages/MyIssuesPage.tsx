import { Inbox } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { IssuesView } from '@/components/IssuesView'
import { Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/stores/auth'
import { useIssues } from '@/stores/issues'

export function MyIssuesPage() {
  const { slug } = useParams()
  const me = useAuth((s) => s.user?.id)
  const byId = useIssues((s) => s.byId)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!slug) return
    api.myIssues(slug).then(async (list) => {
      const { upsert, loadMeta } = useIssues.getState()
      await Promise.all([...new Set(list.map((i) => i.project_id))].map(loadMeta))
      upsert(list)
      setLoaded(true)
    })
  }, [slug])

  // 直接从全局缓存派生，这样在本页新建或改派的任务能即时出现 / 消失。
  const issues = useMemo(() => Object.values(byId).filter((i) => i.assignee_id === me), [byId, me])

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )
  }
  return <IssuesView title="我的任务" icon={<Inbox size={15} />} issues={issues} emptyText="暂时没有指派给你的任务" />
}
