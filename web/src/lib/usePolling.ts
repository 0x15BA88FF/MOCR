import { useCallback, useEffect, useRef, useState } from "react"

export interface PollState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export function usePolling<T>(
  path: string,
  opts: {
    enabled?: boolean
    intervalMs?: number
    initial?: T | null
    quiet?: boolean
  } = {},
): PollState<T> & { refresh: () => void } {
  const { enabled = true, intervalMs = 60_000, initial = null, quiet = false } =
    opts
  const [state, setState] = useState<PollState<T>>({
    data: initial,
    error: null,
    loading: false,
  })
  const timerRef = useRef<number | null>(null)
  const pathRef = useRef(path)
  pathRef.current = path

  const refresh = useCallback(async () => {
    if (!enabled) return
    if (!quiet) setState((s) => ({ ...s, loading: true }))
    try {
      const res = await fetch(pathRef.current)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as T
      setState({ data: json, error: null, loading: false })
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : "request failed",
        loading: false,
      }))
    }
  }, [enabled, quiet])

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }
    refresh()
    timerRef.current = window.setInterval(refresh, intervalMs)
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [enabled, intervalMs, refresh])

  return { ...state, refresh }
}