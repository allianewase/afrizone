import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapNode, OrgKind } from '../api/types'
import { PIN_COLOR } from '../lib/orgColors'

/**
 * The Leaflet map, isolated so it can be lazy-loaded.
 *
 * ITS OWN MODULE FOR THE SAME REASON `chart-views` IS. Leaflet plus its CSS is
 * ~150KB, and bundled into the entry chunk every admin downloads it to open the
 * dashboard. Behind a lazy import it is fetched by the one screen that draws a
 * map. That is also why nothing outside this file imports leaflet.
 *
 * Bare Leaflet rather than react-leaflet: the wrapper pins its peer range to a
 * React major (v5 needs React 19, this app is on 18), which would make a routine
 * React upgrade wait on a mapping library. The imperative surface used here is a
 * dozen calls.
 */

/** Lagos, where the pilot is. Only used when there is nothing to fit to. */
const FALLBACK_CENTRE: [number, number] = [6.5244, 3.3792]

/**
 * A CSS pin rather than Leaflet's default marker image.
 *
 * The default icon resolves its PNG relative to the CSS file, which breaks under
 * every bundler and shows as markers that are simply absent — a well-known
 * Leaflet/Vite trap. A divIcon has no image to lose, and takes the brand colour
 * for free.
 */
function pinFor(kind: OrgKind): L.DivIcon {
  return L.divIcon({
    className: 'net-pin-wrap',
    html: `<span class="net-pin" style="--pin:${PIN_COLOR[kind]}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  })
}

interface Props {
  nodes: MapNode[]
  /** The point distances are measured from, or null. */
  from: { lat: number; lng: number } | null
  /**
   * Which node to centre on. The counter is what makes clicking the same row
   * twice work — an id alone is unchanged the second time, so nothing happens
   * and the map looks broken.
   */
  focus: { id: string; n: number } | null
  onPickOrigin: (p: { lat: number; lng: number }) => void
  onSelect: (id: string) => void
}

export default function NetworkMap({ nodes, from, focus, onPickOrigin, onSelect }: Props) {
  const holder = useRef<HTMLDivElement | null>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<Map<string, L.Marker>>(new Map())
  const originMarker = useRef<L.Marker | null>(null)

  // Callbacks live in a ref so the map is built once. Passing them into the
  // effect's deps would tear down and rebuild the whole map on every parent
  // render, which loses the viewer's pan and zoom.
  const handlers = useRef({ onPickOrigin, onSelect })
  handlers.current = { onPickOrigin, onSelect }

  useEffect(() => {
    if (!holder.current || map.current) return
    const m = L.map(holder.current, { center: FALLBACK_CENTRE, zoom: 11 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      handlers.current.onPickOrigin({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      })
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
      markers.current.clear()
      originMarker.current = null
    }
  }, [])

  // Pins follow the data.
  useEffect(() => {
    const m = map.current
    if (!m) return

    for (const marker of markers.current.values()) marker.remove()
    markers.current.clear()

    for (const n of nodes) {
      const marker = L.marker([n.lat, n.lng], { icon: pinFor(n.kind), title: n.name })
      marker.bindPopup(
        `<b>${escapeHtml(n.name)}</b><br/>${escapeHtml(n.address ?? 'No address recorded')}` +
          (n.distance ? `<br/><i>${escapeHtml(n.distance)} away</i>` : ''),
      )
      marker.on('click', () => handlers.current.onSelect(n.id))
      marker.addTo(m)
      markers.current.set(n.id, marker)
    }

    if (nodes.length) {
      const bounds = L.latLngBounds(nodes.map((n) => [n.lat, n.lng] as [number, number]))
      if (from) bounds.extend([from.lat, from.lng])
      m.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    }
  }, [nodes, from])

  // The reference point gets a marker of its own, so it is never mistaken for a
  // business that is actually there.
  useEffect(() => {
    const m = map.current
    if (!m) return
    originMarker.current?.remove()
    originMarker.current = null
    if (!from) return
    originMarker.current = L.marker([from.lat, from.lng], {
      icon: L.divIcon({
        className: 'net-pin-wrap',
        html: '<span class="net-origin"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      title: 'Measuring from here',
    }).addTo(m)
  }, [from])

  useEffect(() => {
    if (!focus) return
    const marker = markers.current.get(focus.id)
    if (!marker) return
    map.current?.setView(marker.getLatLng(), 16)
    marker.openPopup()
  }, [focus])

  return <div ref={holder} className="net-map" />
}

/** Popup content is built as an HTML string, so a business name must not be. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
