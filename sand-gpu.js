// ============================================================ GPU sand
// The grains live in a float texture and are advanced by a fragment shader (the same rules as the CPU
// loop), so there can be ten times as many. Positions are drawn as additive points into a density
// texture, which a last pass turns into sand colours. Falls back to the CPU path if WebGL2 can't do it.
const GPU_TEX = 256, GPU_N = GPU_TEX * GPU_TEX;
const GLSL_HASH = `uint pcg(uint v){ uint s=v*747796405u+2891336453u; uint w=((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }
float rnd(uint a){ return float(pcg(a))/4294967296.0; }`;
function initGpu() {
  if (/[?&]cpu\b/.test(location.search)) return null;
  try {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = GRID;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); plate.gpu = null; plate.reset();
      setStatus('Graphics context lost. Continuing with CPU sand.');
    });
    const prog = (vs, fs) => {
      const mk = (t, src) => { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, "#version 300 es\n" + vs));
      gl.attachShader(p, mk(gl.FRAGMENT_SHADER, "#version 300 es\n" + fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
      return { p, u };
    };
    const tri = "void main(){ vec2 q=vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position=vec4(q*2.0-1.0,0.0,1.0); }";
    const update = prog(tri, `precision highp float; precision highp int;
uniform sampler2D uState, uField, uDensity; uniform float uDrift,uKick,uMaxStep,uEnergyFloor,uActive,uFrame,uFallT; uniform int uCircle,uMode;
out vec4 o;
${GLSL_HASH}
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy); int gid=c.y*${GPU_TEX}+c.x;
  vec4 s=texelFetch(uState,c,0);
  uint h=uint(gid)*9781u+uint(uFrame)*6271u+1u;
  float r1=rnd(h),r2=rnd(h+101u),r3=rnd(h+202u),r4=rnd(h+303u),r5=rnd(h+404u),r6=rnd(h+505u);
  float n1=(r1+r2+r3-1.5)*2.0, n2=(r4+r5+r6-1.5)*2.0;
  if(uMode==3){                                   // fresh sand
    vec2 p=vec2(r1,r2);
    if(uCircle==1){ float rr=0.49*sqrt(r1), th=6.2831853*r2; p=0.5+rr*vec2(cos(th),sin(th)); }
    o=vec4(p,0.0,r3); return;
  }
  if(float(gid)>=uActive){ o=s; return; }
  vec2 p=s.xy;
  if(uMode==1){ o=vec4(clamp(p+vec2(n1,n2)*0.006,0.0,1.0),s.z,s.w); return; }       // the plate is jolted
  if(uMode==2){                                                                       // grains fall off
    float delay=floor(s.w*45.0), v=s.z;
    if(uFallT-16.0>delay){ v+=0.0016; p.y+=v; p.x+=n1*0.0015; }
    o=vec4(p,v,s.w); return;
  }
  vec2 cell=clamp(p*${FG}.0-0.5,vec2(0.0),vec2(${FG-1}.0));
  ivec2 fi=ivec2(floor(cell)), fj=min(fi+1,ivec2(${FG-1})); vec2 blend=fract(cell);
  vec3 f=mix(mix(texelFetch(uField,fi,0).xyz,texelFetch(uField,ivec2(fj.x,fi.y),0).xyz,blend.x),
             mix(texelFetch(uField,ivec2(fi.x,fj.y),0).xyz,texelFetch(uField,fj,0).xyz,blend.x),blend.y);                                                  // E, dE/dx, dE/dy
  if(f.x<=uEnergyFloor){o=s;return;}
  float stableStep=min(uDrift,0.45*f.x/(dot(f.yz,f.yz)+1e-8));
  vec2 g=stableStep*f.yz; float m=length(g); if(m>uMaxStep) g*=uMaxStep/m;
  float kk=uKick*sqrt(max(f.x,0.0));
  // Finite grain contact pressure prevents unlimited overlap at a node.
  // Density is from the preceding render, in the same unflipped plate coordinates.
  vec2 pixel=vec2(1.0/${GRID}.0), delta=2.0*pixel;
  float center=texture(uDensity,p).r;
  vec2 pressure=vec2(texture(uDensity,p+vec2(delta.x,0)).r-texture(uDensity,p-vec2(delta.x,0)).r,
                     texture(uDensity,p+vec2(0,delta.y)).r-texture(uDensity,p-vec2(0,delta.y)).r);
  pressure/=1.0+length(pressure);
  float crowded=smoothstep(1.0,5.0,center);
  vec2 contact=pressure*(0.7/${GRID}.0)*crowded*min(1.0,uDrift/0.008);
  p=abs(p-g-contact+vec2(n1,n2)*(kk+0.5/${GRID}.0*crowded*min(1.0,uDrift/0.008)));
  p=vec2(p.x>1.0?2.0-p.x:p.x, p.y>1.0?2.0-p.y:p.y); p=clamp(p,0.0,1.0);
  if(uCircle==1){ vec2 d=p-0.5; float q=dot(d,d); if(q>0.2401) p=0.5+d*(0.49/sqrt(q)); }
  o=vec4(p,s.z,s.w);
}`);
    const dots = prog(`precision highp float; uniform sampler2D uState; uniform float uActive; out float grainShade;
void main(){ int gid=gl_VertexID; vec4 s=texelFetch(uState,ivec2(gid&${GPU_TEX - 1},gid>>8),0);
  gl_PointSize=1.2+s.w*0.9; grainShade=0.7+0.3*s.w;
  if(float(gid)>=uActive||s.y>1.0){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  gl_Position=vec4(s.x*2.0-1.0,s.y*2.0-1.0,0.0,1.0); }`,
      `precision highp float; uniform float uW; in float grainShade; out vec4 o; void main(){
        vec2 q=gl_PointCoord*2.0-1.0; float coverage=1.0-smoothstep(0.45,1.0,length(q));
        o=vec4(uW*coverage*grainShade,0.0,0.0,1.0); }`);
    const shade = prog(tri, `precision highp float; uniform sampler2D uDens; out vec4 o;
float d(ivec2 c){ return (c.x<0||c.y<0||c.x>=${GRID}||c.y>=${GRID})?0.0:texelFetch(uDens,c,0).r; }
void main(){
  ivec2 fc=ivec2(gl_FragCoord.xy), c=ivec2(fc.x,${GRID - 1}-fc.y);            // image row 0 is the top
  float v=d(c), t=1.0-exp(-v*1.35);
  o=vec4(mix(vec3(16.0,21.0,28.0),vec3(243.0,215.0,162.0),t)/255.0,1.0);
}`);
    const tex = (w, h, ifmt, fmt, type, filter = gl.NEAREST) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t;
    };
    const fbo = t => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("framebuffer incomplete"); return f; };
    const st = [0, 1].map(() => tex(GPU_TEX, GPU_TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT)), sf = st.map(fbo);
    const field = tex(FG, FG, gl.RGBA32F, gl.RGBA, gl.FLOAT), fieldBuf = new Float32Array(FG * FG * 4);
    const dens = tex(GRID, GRID, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT), df = fbo(dens);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    let cur = 0, frame = 0;
    const bind = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };
    return {
      canvas, N: GPU_N,
      // one simulation step. mode: 0 normal, 1 jolt, 2 fall, 3 reset
      step(P, E, EX, EY) {
        if (P.mode === 0) {
          for (let i = 0, n = FG * FG; i < n; i++) { fieldBuf[4 * i] = E[i]; fieldBuf[4 * i + 1] = EX[i]; fieldBuf[4 * i + 2] = EY[i]; }
          bind(1, field); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FG, FG, gl.RGBA, gl.FLOAT, fieldBuf);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, sf[1 - cur]); gl.viewport(0, 0, GPU_TEX, GPU_TEX); gl.disable(gl.BLEND);
        gl.useProgram(update.p); bind(0, st[cur]); bind(1, field); bind(2, dens);
        const u = update.u;
        gl.uniform1i(u.uState, 0); gl.uniform1i(u.uField, 1); gl.uniform1i(u.uDensity, 2);
        gl.uniform1f(u.uDrift, P.drift); gl.uniform1f(u.uKick, P.kick); gl.uniform1f(u.uMaxStep, 0.45 / FG);
        gl.uniform1f(u.uEnergyFloor, P.energyFloor || 0);
        gl.uniform1f(u.uActive, P.active); gl.uniform1f(u.uFrame, frame++); gl.uniform1f(u.uFallT, P.fallT);
        gl.uniform1i(u.uCircle, P.circle ? 1 : 0); gl.uniform1i(u.uMode, P.mode);
        gl.drawArrays(gl.TRIANGLES, 0, 3); cur = 1 - cur;
        this.active = P.active; this.mode = P.mode;
      },
      render() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, df); gl.viewport(0, 0, GRID, GRID);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(dots.p); bind(0, st[cur]);
        gl.uniform1i(dots.u.uState, 0); gl.uniform1f(dots.u.uActive, this.active || 0); gl.uniform1f(dots.u.uW, 1.0);
        gl.drawArrays(gl.POINTS, 0, GPU_N);
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, GRID, GRID);
        gl.useProgram(shade.p); bind(0, dens); gl.uniform1i(shade.u.uDens, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  } catch (e) { console.warn("GPU sand unavailable:", e); return null; }
}

