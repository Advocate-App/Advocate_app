'use client'

/**
 * Detects when a new version has been deployed while this tab/installed
 * app has been sitting open, and offers a one-tap refresh instead of
 * leaving things silently broken (stale JS chunks, API shape mismatches)
 * until someone thinks to log out and back in. Checks on load, whenever
 * the tab/app regains focus (the common case — you switch back to it
 * after a deploy happened), and every few minutes while it stays open.
 */
import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const loadedSha = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        const { sha } = await res.json()
        if (cancelled) return
        if (loadedSha.current === null) {
          loadedSha.current = sha
        } else if (sha !== loadedSha.current) {
          setUpdateAvailable(true)
        }
      } catch {
        // Offline or a blip — not worth surfacing, next check will catch it.
      }
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    function onVisible() { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm" style={{ background: '#1e3a5f' }}>
      <span>A new version is ready.</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-medium transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Update Now
      </button>
    </div>
  )
}
