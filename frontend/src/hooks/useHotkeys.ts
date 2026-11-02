import { useEffect, useRef } from 'react'
import { isTyping } from '@/lib/utils'

/**
 * 注册键盘快捷键。key 形如：
 *  - "c" / "?" / "Escape"        单键
 *  - "mod+k" / "mod+Enter"        mod 在 macOS 上为 ⌘，其它平台为 Ctrl
 *  - "g i"                       按键序列（1 秒内依次按下）
 * 单键与序列在输入框中自动屏蔽；带 mod 的组合键始终生效。
 */
export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>

const SEQ_TIMEOUT = 1000

export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map)
  useEffect(() => {
    ref.current = map
  })

  useEffect(() => {
    if (!enabled) return
    let pending: string | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return
      const bindings = ref.current
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (mod) {
        const h = bindings[`mod+${key}`]
        if (h) {
          e.preventDefault()
          h(e)
        }
        return
      }
      if (e.altKey) return
      const typing = isTyping(e)
      if (typing && key !== 'Escape') return

      if (pending) {
        const h = bindings[`${pending} ${key}`]
        pending = null
        clearTimeout(timer)
        if (h) {
          e.preventDefault()
          h(e)
          return
        }
      }
      const h = bindings[key] ?? (e.key === '?' ? bindings['?'] : undefined)
      if (h) {
        e.preventDefault()
        h(e)
        return
      }
      if (Object.keys(bindings).some((k) => k.startsWith(`${key} `))) {
        pending = key
        timer = setTimeout(() => (pending = null), SEQ_TIMEOUT)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [enabled])
}
