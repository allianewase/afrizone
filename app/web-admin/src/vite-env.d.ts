/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Google OAuth client id. When unset, Google SSO is disabled. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** API origin, e.g. https://api.afrizoneparttime.com. Unset = same-origin/dev proxy. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
