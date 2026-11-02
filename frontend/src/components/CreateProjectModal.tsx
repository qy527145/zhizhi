import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from '@/stores/toast'
import { useWorkspace } from '@/stores/workspace'
import { Button, CloseButton, Field, Input, Modal } from './ui'

/** 从项目名推导标识：英文取单词首字母，否则留空让用户填写。 */
function suggestIdentifier(name: string) {
  const words = name.match(/[A-Za-z0-9]+/g)
  if (!words) return ''
  const id = words.length > 1 ? words.map((w) => w[0]).join('') : words[0].slice(0, 4)
  return id.toUpperCase().slice(0, 8)
}

export function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createProject = useWorkspace((s) => s.createProject)
  const navigate = useNavigate()
  const { slug } = useParams()
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [touched, setTouched] = useState(false)
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setName('')
    setIdentifier('')
    setTouched(false)
    setDesc('')
    onClose()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const p = await createProject({ name, identifier, description: desc })
      toast.success(`项目「${p.name}」已创建`)
      close()
      navigate(`/${slug}/projects/${p.id}`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} className="max-w-md">
      <form onSubmit={submit}>
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-sm font-medium">新建项目</span>
          <CloseButton onClick={close} />
        </div>
        <div className="space-y-4 px-5 py-4">
          <Field label="项目名称">
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!touched) setIdentifier(suggestIdentifier(e.target.value))
              }}
              placeholder="例如：移动端 App"
            />
          </Field>
          <Field label="项目标识" hint="用于任务编号前缀，如 APP-12。1-8 位字母或数字。">
            <Input
              value={identifier}
              onChange={(e) => {
                setTouched(true)
                setIdentifier(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
              }}
              placeholder="APP"
              className="font-mono uppercase"
            />
          </Field>
          <Field label="描述（可选）">
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="一句话介绍这个项目" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3">
          <Button type="button" variant="ghost" onClick={close}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || !identifier || busy}>
            创建项目
          </Button>
        </div>
      </form>
    </Modal>
  )
}
