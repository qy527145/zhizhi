import { CircleAlert, CircleCheck } from 'lucide-react'
import { useToasts } from '@/stores/toast'

export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className="flex animate-in items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2.5 text-[13px] text-white shadow-pop">
          {t.kind === 'success' ? <CircleCheck size={15} className="text-emerald-400" /> : <CircleAlert size={15} className="text-red-400" />}
          {t.text}
        </div>
      ))}
    </div>
  )
}
