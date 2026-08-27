import type { OrgKind } from '../api/types'

/**
 * Pin and dot colour per kind of business.
 *
 * Here rather than in `map-view` because the network list uses the same colours
 * and must not import that module - doing so would pull Leaflet back into the
 * main bundle and undo the lazy split it exists for.
 */
export const PIN_COLOR: Record<OrgKind, string> = {
  STORE: '#C2502E',
  COURIER: '#1F9D6B',
}
