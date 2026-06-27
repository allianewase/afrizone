/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Google OAuth client id. When unset, Google SSO is disabled. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
