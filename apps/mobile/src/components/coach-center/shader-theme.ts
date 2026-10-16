/** Keep WebGL in sync with the same root tokens as OneRep's native UI. */
export function observeShaderTheme(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  paint: () => void,
) {
  const root = document.documentElement
  const probe = document.createElement("span")
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none"
  document.body.appendChild(probe)
  const pixel = document.createElement("canvas")
  pixel.width = 1
  pixel.height = 1
  const colors = pixel.getContext("2d", { willReadFrequently: true })
  const color = (token: string) => {
    probe.style.color = `var(${token})`
    const raw = getComputedStyle(probe).color
    if (!colors) return [0.5, 0.5, 0.5]
    colors.clearRect(0, 0, 1, 1)
    colors.fillStyle = raw
    colors.fillRect(0, 0, 1, 1)
    return Array.from(colors.getImageData(0, 0, 1, 1).data)
      .slice(0, 3)
      .map((n) => n / 255)
  }
  const sync = () => {
    gl.useProgram(program)
    gl.uniform3fv(
      gl.getUniformLocation(program, "accentColor"),
      color("--accent-workout"),
    )
    gl.uniform3fv(
      gl.getUniformLocation(program, "secondaryColor"),
      color("--accent-water"),
    )
    gl.uniform3fv(
      gl.getUniformLocation(program, "baseColor"),
      color("--surface-app"),
    )
    gl.uniform1f(
      gl.getUniformLocation(program, "darkMode"),
      root.classList.contains("dark") ? 1 : 0,
    )
    paint()
  }
  const observer = new MutationObserver(sync)
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["class", "style", "data-visual-identity"],
  })
  sync()
  return () => {
    observer.disconnect()
    probe.remove()
  }
}
