import { observeShaderTheme } from "./shader-theme"
import { useEffect, useRef } from "react"
/** A flowing color field, deliberately without sphere lighting or surface texture. */
export function Orb({ small = false }: { small?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    })
    if (!gl) {
      canvas.parentElement?.classList.add("orb-fallback")
      return
    }
    const vert = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"
    const frag = `precision highp float;uniform vec2 size;uniform float time;uniform vec3 accentColor;uniform vec3 secondaryColor;uniform vec3 baseColor;uniform float darkMode;
 float blob(vec2 p,vec2 c,vec2 s){vec2 q=(p-c)/s;return exp(-dot(q,q)*2.0);}
 void main(){vec2 p=(gl_FragCoord.xy-size*.5)/min(size.x,size.y)*2.38;float t=time*.73;float a=atan(p.y,p.x);float radius=.89+.038*sin(a*3.+t)+.024*cos(a*2.-t*.7);float d=length(p);float edge=1.-smoothstep(radius-.025,radius+.035,d);
 float halo=exp(-max(0.,d-radius)*15.)*.23*(1.-smoothstep(radius,1.3,d));
 if(d>radius+.035){gl_FragColor=vec4(mix(accentColor,vec3(1.),.32),halo);return;}
 vec2 q=p; q.x+=.12*sin(p.y*4.+t*.8);q.y+=.11*sin(p.x*3.5-t*.65);float turn=.25*sin(t*.7);q=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*q;
 float wave=q.y+.28*sin(q.x*3.8+t)+.15*sin(q.x*6.-t*.65);
 float blue=1.-smoothstep(-.38,.32,wave);vec3 c=mix(vec3(.96,.98,1.),mix(accentColor,secondaryColor,.18),blue);
 float cloud=blob(q,vec2(-.38+.18*sin(t),-.22+.15*cos(t*.8)),vec2(.69,.44));cloud+=.67*blob(q,vec2(.4+.1*cos(t),-.4+.15*sin(t*.7)),vec2(.56,.37));
 c=mix(c,mix(accentColor,vec3(1.),.82),clamp(cloud*.8,0.,.92));
 float ribbon=exp(-pow((wave+.3+.13*sin(q.x*3.+t))/ .15,2.));c=mix(c,mix(secondaryColor,vec3(1.),.35),ribbon*.30);
 c=mix(c,vec3(.96,.98,1.),smoothstep(.65,.93,d)*.22);c=mix(c,c*.93,darkMode==0.? .35:0.);gl_FragColor=vec4(c,max(edge,halo));}`
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      return s
    }
    const vs = shader(gl.VERTEX_SHADER, vert),
      fs = shader(gl.FRAGMENT_SHADER, frag),
      prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.parentElement?.classList.add("orb-fallback")
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return
    }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )
    const pos = gl.getAttribLocation(prog, "p")
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    const size = gl.getUniformLocation(prog, "size"),
      time = gl.getUniformLocation(prog, "time")
    let frame = 0,
      alive = true
    const motion = matchMedia("(prefers-reduced-motion: reduce)")
    const resize = () => {
      const r = canvas.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, r.width * dpr)
      canvas.height = Math.max(1, r.height * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(size, canvas.width, canvas.height)
      paint(performance.now())
    }
    function paint(ms: number) {
      gl.uniform1f(time, motion.matches ? 3 : ms * 0.001)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    function draw(ms: number) {
      if (!alive) return
      paint(ms)
      if (!motion.matches && !document.hidden)
        frame = requestAnimationFrame(draw)
    }
    const resume = () => {
      cancelAnimationFrame(frame)
      draw(performance.now())
    }
    const stopTheme = observeShaderTheme(gl, prog, () =>
      paint(performance.now())
    )
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    resume()
    motion.addEventListener("change", resume)
    document.addEventListener("visibilitychange", resume)
    return () => {
      alive = false
      stopTheme()
      cancelAnimationFrame(frame)
      observer.disconnect()
      motion.removeEventListener("change", resume)
      document.removeEventListener("visibilitychange", resume)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])
  return (
    <div className={"voice-orb" + (small ? " small-orb" : "")}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Fluid coach orb in your OneRep theme"
      />
    </div>
  )
}
