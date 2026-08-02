/** Animated gradient-mesh background + grain + chevron-motif overlay (fixed, behind everything). */
export default function Background() {
  return (
    <>
      <div className="mesh" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>
      <div className="grain" aria-hidden="true" />
      <div className="app-motif" aria-hidden="true" />
    </>
  )
}
