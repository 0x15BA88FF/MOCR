import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { disablePush, enablePush, isPushEnabled, pushSupported, sendTestPush } from "./push"

export interface PushState {
  supported: boolean
  enabled: boolean
  busy: boolean
  testBusy: boolean
}

export function usePush() {
  const [supported] = useState(() => pushSupported())
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)

  const enable = useCallback(async () => {
    setBusy(true)
    const result = await enablePush()
    setBusy(false)
    if (result.ok) {
      setEnabled(true)
      toast.success("Push notifications enabled")
    } else {
      const errText =
        result.reason === "unsupported"
          ? "Push is not supported in this browser, or not on https/localhost."
          : result.reason === "denied"
            ? "Notification permission was denied in the browser."
            : `Could not enable push: ${result.reason ?? "unknown"}`
      toast.error(errText)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    await disablePush()
    setBusy(false)
    setEnabled(false)
    toast.success("Push notifications disabled")
  }, [])

  const test = useCallback(async () => {
    setTestBusy(true)
    const result = await sendTestPush()
    setTestBusy(false)
    if (result.ok) {
      toast.success("Test push sent (may take a few seconds to arrive).")
    } else {
      toast.error(`Test push failed: ${result.error ?? "unknown"}`)
    }
  }, [])

  useEffect(() => {
    if (!supported) return
    let cancelled = false
    isPushEnabled()
      .then((en) => {
        if (cancelled) return
        setEnabled(en)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [supported])

  return { supported, enabled, busy, testBusy, enable, disable, test }
}