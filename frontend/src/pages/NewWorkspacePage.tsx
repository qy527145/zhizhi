import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Field, Input } from '@/components/ui'
import { useWorkspace } from '@/stores/workspace'

export function NewWorkspacePage() {
  const createWorkspace = useWorkspace((s) => s.createWorkspace)
  const hasAny = useWorkspace((s) => s.workspaces.length > 0)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const ws = await createWorkspace(name, slug)
      navigate(`/${ws.slug}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 px-4">
      <form onSubmit={submit} className="w-full max-w-[400px] space-y-5 rounded-xl border border-zinc-200 bg-white p-7 shadow-xs">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">创建工作区</h1>
          <p className="mt-1 text-[13px] text-zinc-500">工作区是团队协作的空间，项目和成员都归属于它。</p>
        </div>
        <Field label="工作区名称">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：知之科技" required />
        </Field>
        <Field label="URL 标识" hint="小写字母、数字或连字符，创建后不可修改。">
          <div className="flex items-center rounded-md border border-zinc-200 focus-within:border-accent">
            <span className="pl-2.5 text-[13px] text-zinc-400">{location.host}/</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-team"
              className="h-8 flex-1 bg-transparent pr-2.5 text-[13px] outline-none"
              required
            />
          </div>
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</div>}
        <div className="flex gap-2">
          {hasAny && (
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              返回
            </Button>
          )}
          <Button type="submit" variant="primary" className="h-9 flex-1" disabled={busy || !name.trim() || slug.length < 2}>
            创建并进入
          </Button>
        </div>
      </form>
    </div>
  )
}
