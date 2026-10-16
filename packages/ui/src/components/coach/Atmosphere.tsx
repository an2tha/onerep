import { observeShaderTheme } from "./shader-theme"
import { useEffect, useRef } from "react"
/** Low-resolution light field, separate from the native OneRep controls. */
export function Atmosphere({
  quiet = false,
  entrance = false,
}: {
  quiet?: boolean
  entrance?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false })
    if (!gl) return
    const vertex = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"
    const fragment = `precision highp float;uniform vec2 size;uniform float time;uniform vec3 accentColor;uniform vec3 secondaryColor;uniform vec3 baseColor;uniform float darkMode;uniform float intensity;
  void main(){vec2 uv=gl_FragCoord.xy/size;vec2 p=vec2(uv.x,1.-uv.y);float t=time*.13;
   float bend=p.x+.20*sin(p.y*4.4-t)+.075*sin(p.y*8.+t*.8);
   float fold=sin(bend*8.5+p.y*3.0-t*.65);
   float silk=pow(max(0.,fold),7.);float broad=pow(max(0.,sin(bend*6.3+p.y*2.2+t*.4)),3.);
   float shoulder=1.-smoothstep(.05,.42,abs(p.x-.5));
   float mask=1.-.76*shoulder*smoothstep(.30,.66,p.y);
   float depth=1.-smoothstep(.15,1.05,p.y);
   float core=exp(-dot((p-vec2(.5,.18))/vec2(.36,.30),(p-vec2(.5,.18))/vec2(.36,.30))*2.);
   float seam=pow(max(0.,sin(bend*8.5+p.y*3.-t*.65+.18)),32.);
   float light=(broad*.19+silk*.37+seam*.10)*depth*mask+core*.10;
   vec3 hue=mix(accentColor,secondaryColor,p.x*.7);
   vec3 c=mix(baseColor,hue,min(light*intensity,.88)*mix(.58,.95,darkMode));
   c=mix(c,baseColor,smoothstep(.65,1.15,p.y));
   gl_FragColor=vec4(c,1.);
  }`
    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, vertex),
      fs = compile(gl.FRAGMENT_SHADER, fragment),
      program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return
    }
    gl.useProgram(program)
    gl.uniform1f(
      gl.getUniformLocation(program, "intensity"),
      entrance ? 1.65 : 1,
    )
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const position = gl.getAttribLocation(program, "p")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const size = gl.getUniformLocation(program, "size"),
      time = gl.getUniformLocation(program, "time")
    const motion = matchMedia("(prefers-reduced-motion: reduce)")
    let frame = 0
    const paint = (ms: number) => {
      gl.uniform1f(time, motion.matches ? 4 : ms * 0.001)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    const draw = (ms: number) => {
      paint(ms)
      if (!motion.matches && !document.hidden)
        frame = requestAnimationFrame(draw)
    }
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(r.width * 0.7))
      canvas.height = Math.max(1, Math.round(r.height * 0.7))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(size, canvas.width, canvas.height)
      paint(performance.now())
    }
    const resume = () => {
      cancelAnimationFrame(frame)
      draw(performance.now())
    }
    const stopTheme = observeShaderTheme(gl, program, () =>
      paint(performance.now()),
    )
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    resume()
    motion.addEventListener("change", resume)
    document.addEventListener("visibilitychange", resume)
    return () => {
      stopTheme()
      cancelAnimationFrame(frame)
      observer.disconnect()
      motion.removeEventListener("change", resume)
      document.removeEventListener("visibilitychange", resume)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [entrance])
  return (
    <div
      aria-hidden="true"
      className={
        "coach-atmosphere" +
        (quiet ? " is-quiet" : "") +
        (entrance ? " is-entrance" : "")
      }
    >
      <canvas ref={ref} />
      <div className="atmosphere-vignette" />
    </div>
  )
}
