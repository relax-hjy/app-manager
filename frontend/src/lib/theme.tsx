import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'app-manager:theme'

/** 读取持久化的主题偏好，非法值回退 system */
function readPreference(): ThemePreference {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

/** 按偏好与系统媒体查询解析出实际生效主题 */
function resolve(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 把生效主题写到 html 的 dark class 与 color-scheme 上 */
function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

interface ThemeState {
  preference: ThemePreference
  theme: 'light' | 'dark'
}

interface ThemeContextValue extends ThemeState {
  /** 切换偏好：浅色→深色→跟随系统循环 */
  toggle: () => void
  setPreference: (p: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(() => {
    const preference = readPreference()
    return { preference, theme: resolve(preference) }
  })

  // 落库偏好并把生效主题同步到 DOM（外部系统）
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, state.preference)
    applyTheme(state.theme)
  }, [state.preference, state.theme])

  // 「跟随系统」时订阅媒体查询；setState 只发生在系统主题变化的回调里
  useEffect(() => {
    if (state.preference !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setState(prev => ({ ...prev, theme: resolve(prev.preference) }))
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [state.preference])

  /** 主题循环切换：light → dark → system → light */
  const toggle = useCallback(() => {
    setState(prev => {
      const preference: ThemePreference = prev.preference === 'light' ? 'dark' : prev.preference === 'dark' ? 'system' : 'light'
      return { preference, theme: resolve(preference) }
    })
  }, [])

  const setPreference = useCallback((p: ThemePreference) => {
    setState({ preference: p, theme: resolve(p) })
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ preference: state.preference, theme: state.theme, toggle, setPreference }),
    [state.preference, state.theme, toggle, setPreference]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
