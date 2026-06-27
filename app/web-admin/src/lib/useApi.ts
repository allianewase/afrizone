import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'

interface ApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
  setData: (updater: (prev: T | null) => T | null) => void
}

/**
 * Generic GET hook with loading/error/empty handling and a manual reload.
 * `fetcher` receives an AbortSignal so in-flight requests are cancelled.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): ApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFetcher = useCallback(fetcher, deps)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    stableFetcher(ctrl.signal)
      .then((res) => setData(res))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof ApiError ? err.message : 'Unexpected error')
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [stableFetcher, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const update = useCallback(
    (updater: (prev: T | null) => T | null) => setData((prev) => updater(prev)),
    [],
  )

  return { data, loading, error, reload, setData: update }
}
