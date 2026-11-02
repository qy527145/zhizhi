import { Plus } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { Issue, Project } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useIssues } from '@/stores/issues'
import { useUi } from '@/stores/ui'
import { StateIcon } from './icons'
import type { IssueGroup } from './IssueList'
import { AssigneeButton, DueButton, LabelChips, PriorityButton } from './IssueProps'

const Card = memo(function Card({
  issue,
  project,
  focused,
  onOpen,
}: {
  issue: Issue
  project?: Project
  focused: boolean
  onOpen: (id: string) => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/issue', issue.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(issue.id)}
      onMouseMove={() => !focused && useUi.getState().set({ focusedId: issue.id })}
      className={cn(
        'cursor-pointer space-y-2 rounded-lg border bg-white p-3 shadow-xs transition',
        focused ? 'border-zinc-300 shadow-sm' : 'border-zinc-200/80 hover:border-zinc-300',
      )}
    >
      <div className="font-mono text-[11px] text-zinc-400">
        {project?.identifier}-{issue.seq}
      </div>
      <div className="line-clamp-2 text-[13px] leading-snug text-zinc-800">{issue.title}</div>
      <div className="flex flex-wrap items-center gap-1">
        <PriorityButton issue={issue} />
        <LabelChips issue={issue} max={2} />
        <DueButton issue={issue} />
        <span className="flex-1" />
        <AssigneeButton issue={issue} />
      </div>
    </div>
  )
})

/** 看板视图：按状态分列，支持拖拽卡片切换状态，并在目标位置重新计算排序值。 */
export function IssueBoard({
  groups,
  projects,
  onOpen,
  onQuickCreate,
}: {
  groups: IssueGroup[]
  projects: Project[]
  onOpen: (id: string) => void
  onQuickCreate?: (stateId: string) => void
}) {
  const focusedId = useUi((s) => s.focusedId)
  const update = useIssues((s) => s.update)
  const [over, setOver] = useState<string | null>(null)
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])

  const onDrop = (e: React.DragEvent, g: IssueGroup) => {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/issue')
    if (!id || !g.state) return
    // 根据落点 y 坐标找到插入位置，取相邻两张卡片 sort_order 的中值。
    const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-card]'))
    const others = g.issues.filter((i) => i.id !== id)
    let idx = others.length
    for (let k = 0, n = 0; k < cards.length; k++) {
      if (cards[k].dataset.card === id) continue
      const r = cards[k].getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) {
        idx = n
        break
      }
      n++
    }
    const before = others[idx - 1]?.sort_order
    const after = others[idx]?.sort_order
    const sort_order =
      before === undefined && after === undefined
        ? 65536
        : before === undefined
          ? after! - 1024
          : after === undefined
            ? before + 1024
            : (before + after) / 2
    update(id, { state_id: g.state.id, sort_order })
  }

  return (
    <div className="flex flex-1 gap-3 overflow-x-auto p-4">
      {groups.map((g) => (
        <div
          key={g.key}
          onDragOver={(e) => {
            e.preventDefault()
            if (over !== g.key) setOver(g.key)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
          }}
          onDrop={(e) => onDrop(e, g)}
          className={cn('flex w-72 shrink-0 flex-col rounded-xl bg-zinc-50 transition-colors', over === g.key && 'bg-accent-soft')}
        >
          <div className="flex h-10 items-center gap-2 px-3 text-[13px] font-medium text-zinc-700">
            {g.state && <StateIcon group={g.state.group} color={g.state.color} />}
            {g.title}
            <span className="font-normal text-zinc-400">{g.issues.length}</span>
            <span className="flex-1" />
            {onQuickCreate && g.state && (
              <button onClick={() => onQuickCreate(g.state!.id)} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700">
                <Plus size={13} />
              </button>
            )}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
            {g.issues.map((i) => (
              <div key={i.id} data-card={i.id}>
                <Card issue={i} project={projectById[i.project_id]} focused={focusedId === i.id} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
