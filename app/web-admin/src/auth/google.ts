// Lazy loader for Google Identity Services (GIS). The script is only injected
// when a client id is present, so an unconfigured deployment never loads it.

export const GOOGLE_CLIENT_ID: string | undefined =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined

interface GisCredentialResponse {
  credential: string
}

interface GisId {
  initialize(config: {
    client_id: string
    callback: (resp: GisCredentialResponse) => void
  }): void
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void
  prompt(): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GisId } }
  }
}

let loadPromise: Promise<GisId> | null = null

/** Inject and resolve the GIS client. Rejects if no client id is configured. */
export function loadGoogleIdentity(): Promise<GisId> {
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(new Error('Google SSO not configured'))
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise<GisId>((resolve, reject) => {
    const existing = window.google?.accounts?.id
    if (existing) {
      resolve(existing)
      return
    }
    const script = document.createElement('script')
    // hl=en pins the rendered button/consent text to English regardless of
    // the browser's or the signed-in Google account's language setting -
    // otherwise GIS auto-localizes ("Se connecter avec Google" for French
    // browsers/accounts), which doesn't match the rest of the admin console.
    script.src = 'https://accounts.google.com/gsi/client?hl=en'
    script.async = true
    script.defer = true
    script.onload = () => {
      const id = window.google?.accounts?.id
      if (id) resolve(id)
      else reject(new Error('Google Identity Services failed to initialise'))
    }
    script.onerror = () => reject(new Error('Could not load Google Identity Services'))
    document.head.appendChild(script)
  })
  return loadPromise
}
