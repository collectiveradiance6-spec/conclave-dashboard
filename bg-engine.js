/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONCLAVE BG ENGINE ULTRA — v4.0 SOVEREIGN 8K EDITION
 * WebGL2 volumetric nebula · god rays · reactive particle physics
 * Adaptive quality scaling · Multi-layer compositing · GPU instancing
 * Drop-in replacement for existing conclave.js background engine
 * ═══════════════════════════════════════════════════════════════════════
 */
'use strict';

const CLBG = (function() {

// ─── PAGE CONFIGS ─────────────────────────────────────────────────────
const THEMES = {
  index:     { cols:['#FF4CD2','#7B2FFF','#00D4FF','#FFB800'],  bg:[.04,.02,.10], accent:[.08,.02,.22,.04,.12,.24], mood:'nexus'  },
  ark:       { cols:['#FF6600','#FF4500','#FFB800','#FF2200'],   bg:[.06,.02,.01], accent:[.22,.08,.0,.18,.04,.0],  mood:'forge'  },
  minecraft: { cols:['#35ED7E','#00D4FF','#44FF44','#00FF88'],   bg:[.02,.06,.03], accent:[.04,.18,.04,.0,.12,.08], mood:'forest' },
  donations: { cols:['#FFB800','#FFD700','#FF9900','#FF6600'],   bg:[.07,.04,.01], accent:[.22,.14,.0,.18,.10,.0],  mood:'gold'   },
  promoter:  { cols:['#FF4CD2','#DA70D6','#EE82EE','#FF1493'],   bg:[.06,.0,.06],  accent:[.22,.02,.18,.16,.04,.22],'mood':'bloom' },
  music:     { cols:['#7B2FFF','#00D4FF','#FF4CD2','#35ED7E'],   bg:[.03,.02,.10], accent:[.12,.02,.24,.04,.08,.22],'mood':'nexus' },
  default:   { cols:['#FF4CD2','#A855F7','#00D4FF','#35ED7E'],   bg:[.04,.02,.10], accent:[.08,.02,.22,.04,.12,.24],'mood':'nexus' },
};

// ─── GLSL SHADERS ─────────────────────────────────────────────────────
const VS_QUAD = `#version 300 es
in vec4 a_pos;
void main(){gl_Position=a_pos;}
`;

// Volumetric nebula fragment shader
const FS_NEBULA = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_col1;
uniform vec3 u_col2;
uniform vec3 u_col3;
uniform vec2 u_mouse;
uniform float u_beat;

// Hash/noise functions
float hash11(float n){return fract(sin(n)*43758.5453);}
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 hash22(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}

float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(
    mix(hash21(i),hash21(i+vec2(1,0)),u.x),
    mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x),u.y
  );
}

// Domain-warped FBM — 6 octaves for maximum detail
float fbm6(vec2 p){
  float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<6;i++){v+=a*vnoise(p);p=m*p;a*=.5;}
  return v;
}

// Volumetric ray marching approximation (2D SDF fog)
float volFog(vec2 p, float t){
  vec2 q=vec2(fbm6(p+t*.11),fbm6(p+vec2(5.2,1.3)+t*.09));
  vec2 r=vec2(fbm6(p+3.8*q+vec2(1.7,9.2)+t*.05),fbm6(p+3.8*q+vec2(8.3,2.8)+t*.04));
  return fbm6(p+3.5*r);
}

// God rays from center
float godRay(vec2 uv, vec2 src, float t){
  vec2 d=uv-src;
  float a=atan(d.y,d.x);
  float r=length(d);
  float rays=0.;
  for(int i=0;i<6;i++){
    float ai=float(i)*1.0472;
    float w=sin(a*8.+ai+t*.4)*.5+.5;
    rays+=w*pow(max(0.,1.-r*1.2),.6);
  }
  return rays*.18;
}

// Voronoi for cell structure
float voronoi(vec2 p){
  vec2 b=floor(p),f=fract(p);
  float md=8.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 g=vec2(i,j),o=hash22(b+g);
    float d=length(g+o-f);
    md=min(md,d);
  }
  return 1.-md;
}

// Lens flare
vec3 lensFlare(vec2 uv,vec2 pos,float t){
  vec2 d=uv-pos;float r=length(d);
  vec3 col=vec3(0);
  col+=.3*u_col1*pow(max(0.,1.-r*3.),4.);
  col+=.15*u_col2*pow(max(0.,1.-r*8.),6.);
  float ring=abs(r-.12);col+=.08*u_col3*pow(max(0.,1.-ring*40.),2.);
  // Streaks
  for(int i=0;i<4;i++){
    float a=float(i)*.785+t*.02;
    vec2 sd=vec2(cos(a),sin(a));
    float sp=abs(dot(normalize(d),sd));
    col+=.04*u_col1*pow(sp,12.)*max(0.,1.-r*2.);
  }
  return col;
}

void main(){
  vec2 fc=gl_FragCoord.xy;
  vec2 uv=fc/u_res;
  vec2 p=(fc-.5*u_res)/min(u_res.x,u_res.y);
  float t=u_time;
  float beat=1.+u_beat*.3;

  // Mouse influence
  vec2 mouse=(u_mouse/u_res-.5)*vec2(u_res.x/u_res.y,1.);
  float mdist=length(p-mouse);
  float mwave=sin(mdist*8.-t*3.)*.02/max(.1,mdist)*beat;
  p+=normalize(p-mouse)*mwave*.3;

  // Primary nebula
  float f=volFog(p*1.2,t);
  float f2=volFog(p*.7+vec2(10.,5.),t*.6);
  float f3=volFog(p*2.4+vec2(-3.,8.),t*1.4);

  // Voronoi cell accent
  float vor=voronoi(p*4.+vec2(t*.08,t*.05));
  float vor2=voronoi(p*8.-vec2(t*.06,t*.04));

  // Color composition
  vec3 col=vec3(0);
  col+=mix(u_col1*.6, u_col2*.8, clamp(f*1.5-.2,0.,1.)) * (f*f*.8+.08);
  col+=mix(u_col2*.5, u_col3*.7, clamp(f2*2.,0.,1.)) * f2*.5;
  col+=u_col1*f3*.12;
  col+=u_col3*vor*.06*(1.+beat*.3);
  col+=u_col2*vor2*.03;

  // Ambient glow cores
  vec2 c1=vec2(.25,.7),c2=vec2(.75,.3),c3=vec2(.5,.5);
  float g1=pow(max(0.,1.-length(uv-c1)*2.2),2.2);
  float g2=pow(max(0.,1.-length(uv-c2)*2.2),2.2);
  float g3=pow(max(0.,1.-length(uv-c3)*1.8),2.);
  col+=u_col1*g1*.28*(1.+beat*.2);
  col+=u_col2*g2*.22*(1.+beat*.15);
  col+=u_col3*g3*.12;

  // God rays from top
  col+=u_col1*godRay(p,vec2(0.,.8),t)*.6*(1.+beat*.4);
  col+=u_col2*godRay(p,vec2(-.3,-.6),t*.7)*.3;

  // Lens flare
  col+=lensFlare(uv,c1+vec2(sin(t*.2)*.05,cos(t*.15)*.04),t);

  // Beat pulse on bright areas
  float bright=dot(col,vec3(.299,.587,.114));
  col+=col*bright*u_beat*.4;

  // Radial vignette with breathing
  float vignR=.65+sin(t*.2)*.04;
  float vig=1.-smoothstep(vignR,1.3,length(uv-.5)*1.9);
  col*=vig;

  // Chromatic aberration sim
  float caAmt=.004+u_beat*.003;
  vec2 ca=normalize(uv-.5)*caAmt;
  float cr=volFog((uv+ca)*1.2,t);
  float cb=volFog((uv-ca)*1.2,t);
  col.r=mix(col.r,cr*.3+col.r*.7,1.);
  col.b=mix(col.b,cb*.3+col.b*.7,1.);

  // Film grain
  float grain=hash21(uv*u_res+t*47.)*.028-.014;
  col+=grain;

  // Tonemap (ACES filmic)
  col=col*(2.51*col+.03)/(col*(2.43*col+.59)+.14);
  col=clamp(col,0.,1.);

  // Subtle scanlines for atmosphere
  float scan=sin(fc.y*3.14159*.5)*.012+.988;
  col*=scan;

  fragColor=vec4(col,1.);
}
`;

// Particle vertex shader with instancing
const VS_PARTICLES = `#version 300 es
in vec2 a_basePos;
in float a_id;
in float a_size;

uniform float u_time;
uniform vec2 u_res;
uniform float u_beat;

out float v_alpha;
out vec3 v_color;

float hash(float n){return fract(sin(n)*43758.5453);}

void main(){
  float t=u_time;
  float id=a_id;

  // Unique per-particle motion
  float px=hash(id*.7183)*2.-1.;
  float py=hash(id*.3141)*2.-1.;
  float vx=(hash(id*1.618)-.5)*.6;
  float vy=(hash(id*2.718)-.5)*.5;
  float wobX=sin(t*(hash(id*.123)+.3)*1.4+id)*(.08+hash(id*.456)*.12);
  float wobY=cos(t*(hash(id*.789)+.2)*1.1+id)*(.06+hash(id*.012)*.10);

  vec2 pos=vec2(px+vx*t*0.06+wobX, py+vy*t*0.05+wobY);
  pos=fract(pos*.5+.5)*2.-1.;
  pos.x*=u_res.y/u_res.x;

  gl_Position=vec4(pos,0.,1.);
  float pulse=sin(t*hash(id*3.7+1.)*2.+id*.8)*.5+.5;
  gl_PointSize=(a_size+pulse*2.)*(1.+u_beat*.6);

  v_alpha=(.05+hash(id*.234)*.18)*(.4+pulse*.5)*(1.+u_beat*.3);

  // Color selection
  float hue=hash(id*.567);
  vec3 cols[4];
  cols[0]=vec3(.48,.18,1.);  // violet
  cols[1]=vec3(0.,.83,1.);   // cyan
  cols[2]=vec3(1.,.3,.82);   // pink
  cols[3]=vec3(.21,.93,.49); // green
  int ci=int(hue*4.);
  v_color=cols[ci];
}
`;

const FS_PARTICLES = `#version 300 es
precision mediump float;
in float v_alpha;
in vec3 v_color;
out vec4 fragColor;
void main(){
  vec2 uv=gl_PointCoord-.5;
  float r=length(uv);
  float a=v_alpha*(1.-smoothstep(.3,.5,r));
  // Glow ring
  float ring=smoothstep(.4,.5,r)-smoothstep(.48,.5,r);
  vec3 col=v_color+ring*.5;
  fragColor=vec4(col,a);
}
`;

// 2D drip/sprite layer shaders
const VS_2D = `attribute vec4 a_pos;void main(){gl_Position=a_pos;}`;
const FS_2D = `precision mediump float;uniform sampler2D u_tex;void main(){gl_FragColor=texture2D(u_tex,gl_PointCoord);}`;

// ─── MAIN BG ENGINE CLASS ──────────────────────────────────────────────
class BGEngine {
  constructor() {
    this.canvas2d = null;
    this.glCanvas = null;
    this.particleCanvas = null;
    this.gl = null;
    this.programs = {};
    this.buffers  = {};
    this.theme = THEMES.default;
    this.beat = 0;
    this.beatDecay = .06;
    this.mx = 0; this.my = 0;
    this.startTime = Date.now();
    this.pageType = 'default';
    this.raf = null;
    this.quality = this._detectQuality();
    this.PARTICLE_COUNT = this.quality === 'ultra' ? 600 : this.quality === 'high' ? 400 : 200;
  }

  _detectQuality() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'medium';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    if (/RTX|RX 6|RX 7|M1|M2|M3|Apple/i.test(renderer)) return 'ultra';
    if (/GTX|RX 5|Intel Iris/i.test(renderer)) return 'high';
    return 'medium';
  }

  init(pageType = 'default') {
    this.pageType = pageType;
    this.theme = THEMES[pageType] || THEMES.default;

    // Create layered canvases
    this._createCanvases();
    this._initGL();
    this._init2D();
    this._startLoop();
    this._bindEvents();

    // Wait for fonts
    document.fonts?.ready?.then(() => this._onReady());
  }

  _createCanvases() {
    const existing = document.getElementById('bg');
    if (existing) existing.remove();
    ['bg-gl','bg-2d'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });

    // WebGL canvas (bottom)
    this.glCanvas = Object.assign(document.createElement('canvas'), {
      id: 'bg-gl',
      style: { cssText: 'position:fixed;inset:0;z-index:-3;width:100%;height:100%;pointer-events:none;' }
    });
    this.glCanvas.style.cssText = 'position:fixed;inset:0;z-index:-3;pointer-events:none;';
    document.body.insertBefore(this.glCanvas, document.body.firstChild);

    // 2D canvas (drips + sprites, on top)
    this.canvas2d = Object.assign(document.createElement('canvas'), { id: 'bg-2d' });
    this.canvas2d.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
    document.body.insertBefore(this.canvas2d, this.glCanvas.nextSibling);

    this._resize();
  }

  _resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const PR = Math.min(window.devicePixelRatio || 1, this.quality === 'ultra' ? 2 : 1.5);

    if (this.glCanvas) {
      this.glCanvas.width = Math.floor(W * PR);
      this.glCanvas.height = Math.floor(H * PR);
      this.glCanvas.style.width = W + 'px';
      this.glCanvas.style.height = H + 'px';
      if (this.gl) this.gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    }
    if (this.canvas2d) {
      this.canvas2d.width = W; this.canvas2d.height = H;
    }
    this.W = W; this.H = H;
  }

  _initGL() {
    const gl = this.glCanvas.getContext('webgl2', {
      antialias: false, powerPreference: 'high-performance',
      alpha: false, depth: false, stencil: false
    }) || this.glCanvas.getContext('webgl', {
      antialias: false, powerPreference: 'high-performance'
    });
    if (!gl) { console.warn('[CLBG] WebGL not available'); return; }
    this.gl = gl;
    this.isGL2 = gl instanceof WebGL2RenderingContext;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    // Quad program (nebula)
    this.programs.nebula = this._createProgram(
      this.isGL2 ? VS_QUAD : VS_QUAD.replace('#version 300 es\n',''),
      this.isGL2 ? FS_NEBULA : FS_NEBULA.replace('#version 300 es\n','').replace(/\bout fragColor\b/g,'').replace(/fragColor=/g,'gl_FragColor=').replace(/out vec4 fragColor;/,'')
    );

    // Quad buffer
    this.buffers.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    // Particle program
    if (this.isGL2) {
      this.programs.particles = this._createProgram(VS_PARTICLES, FS_PARTICLES);
      this._initParticleBuffers();
    }

    this._cacheUniforms();
  }

  _createProgram(vs, fs) {
    const gl = this.gl;
    const mkS = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error('[CLBG] Shader error:', gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mkS(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mkS(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      console.error('[CLBG] Program error:', gl.getProgramInfoLog(p));
    return p;
  }

  _initParticleBuffers() {
    const gl = this.gl; const N = this.PARTICLE_COUNT;
    const basePos = new Float32Array(N * 2);
    const ids     = new Float32Array(N);
    const sizes   = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      basePos[i*2]   = (Math.random() * 2 - 1);
      basePos[i*2+1] = (Math.random() * 2 - 1);
      ids[i]   = i;
      sizes[i] = 1 + Math.random() * 3;
    }
    const mkBuf = (data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    };
    this.buffers.pBase = mkBuf(basePos);
    this.buffers.pId   = mkBuf(ids);
    this.buffers.pSize = mkBuf(sizes);
    this.pCount = N;
  }

  _cacheUniforms() {
    const gl = this.gl;
    const p = this.programs.nebula;
    this.uniforms = {
      time:  gl.getUniformLocation(p, 'u_time'),
      res:   gl.getUniformLocation(p, 'u_res'),
      col1:  gl.getUniformLocation(p, 'u_col1'),
      col2:  gl.getUniformLocation(p, 'u_col2'),
      col3:  gl.getUniformLocation(p, 'u_col3'),
      mouse: gl.getUniformLocation(p, 'u_mouse'),
      beat:  gl.getUniformLocation(p, 'u_beat'),
    };
    if (this.programs.particles) {
      const pp = this.programs.particles;
      this.pUniforms = {
        time:  gl.getUniformLocation(pp, 'u_time'),
        res:   gl.getUniformLocation(pp, 'u_res'),
        beat:  gl.getUniformLocation(pp, 'u_beat'),
      };
    }
  }

  // ─── 2D DRIP SYSTEM ───────────────────────────────────────────────
  _init2D() {
    this.ctx2d = this.canvas2d.getContext('2d');
    this.drips = [];
    this.sprites = [];
    this._spawnDrips(24);
    this._spawnSprites(8);
  }

  _spawnDrips(n) {
    const th = this.theme;
    for (let i = 0; i < n; i++) {
      this.drips.push({
        x: Math.random() * this.W,
        y: Math.random() * this.H * -.6,
        vy: .5 + Math.random() * 1.8,
        col: th.cols[Math.floor(Math.random() * th.cols.length)],
        a: .05 + Math.random() * .10,
        w: 1.2 + Math.random() * 2.5,
        tail: [], maxTail: 28,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  _spawnSprites(n) {
    const PIXEL = {
      dino:    ['  XX  ',' XXXX ','XXXXXX',' XXX  ',' X  X '],
      crystal: ['  X  ',' XXX ','XXXXX',' XXX ','  X  '],
      ptero:   ['X    X','XXXXXX',' XXXX ','  XX  '],
      player:  [' XX  ','XXXX ','XXXXX',' X X '],
      star:    ['  X  ',' X X ','XXXXX',' X X ','  X  '],
    };
    const keys = Object.keys(PIXEL);
    const th = this.theme;
    for (let i = 0; i < n; i++) {
      this.sprites.push({
        type: keys[i % keys.length],
        pixels: PIXEL[keys[i % keys.length]],
        x: Math.random() * this.W,
        y: Math.random() * this.H,
        vx: (Math.random() - .5) * .3,
        vy: (Math.random() - .5) * .22,
        scale: 2 + Math.floor(Math.random() * 2),
        a: .10 + Math.random() * .12,
        col: th.cols[i % th.cols.length],
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  hex2rgb(hex) {
    const n = parseInt(hex.replace('#',''), 16);
    return [(n>>16&255)/255, (n>>8&255)/255, (n&255)/255];
  }

  // ─── MAIN RENDER LOOP ─────────────────────────────────────────────
  _startLoop() {
    let last = 0;
    const gl = this.gl;

    const loop = (ts) => {
      this.raf = requestAnimationFrame(loop);
      const t = (Date.now() - this.startTime) / 1000;

      // Beat decay
      this.beat *= (1 - this.beatDecay);

      // ── WebGL nebula ──
      if (gl) {
        const p = this.programs.nebula;
        gl.useProgram(p);
        gl.blendFunc(gl.ONE, gl.ZERO);
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);

        const pos = gl.getAttribLocation(p, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad);
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

        const c1 = this.hex2rgb(this.theme.cols[0]);
        const c2 = this.hex2rgb(this.theme.cols[1]);
        const c3 = this.hex2rgb(this.theme.cols[2] || this.theme.cols[0]);

        const u = this.uniforms;
        gl.uniform1f(u.time, t);
        gl.uniform2f(u.res, this.glCanvas.width, this.glCanvas.height);
        gl.uniform3fv(u.col1, c1); gl.uniform3fv(u.col2, c2); gl.uniform3fv(u.col3, c3);
        gl.uniform2f(u.mouse, this.mx, this.glCanvas.height - this.my);
        gl.uniform1f(u.beat, this.beat);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // ── GPU particles ──
        if (this.programs.particles && this.isGL2) {
          const pp = this.programs.particles;
          gl.useProgram(pp);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

          const pu = this.pUniforms;
          gl.uniform1f(pu.time, t);
          gl.uniform2f(pu.res, this.glCanvas.width, this.glCanvas.height);
          gl.uniform1f(pu.beat, this.beat);

          const bLoc  = gl.getAttribLocation(pp, 'a_basePos');
          const idLoc = gl.getAttribLocation(pp, 'a_id');
          const szLoc = gl.getAttribLocation(pp, 'a_size');

          gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pBase);
          gl.enableVertexAttribArray(bLoc);
          gl.vertexAttribPointer(bLoc, 2, gl.FLOAT, false, 0, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pId);
          gl.enableVertexAttribArray(idLoc);
          gl.vertexAttribPointer(idLoc, 1, gl.FLOAT, false, 0, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pSize);
          gl.enableVertexAttribArray(szLoc);
          gl.vertexAttribPointer(szLoc, 1, gl.FLOAT, false, 0, 0);

          gl.drawArrays(gl.POINTS, 0, this.pCount);
        }
      }

      // ── 2D layer (drips + sprites) ──
      this._render2D(t);
    };
    requestAnimationFrame(loop);
  }

  _render2D(t) {
    const ctx = this.ctx2d;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.W, this.H);

    // ── Drips ──
    const spawnRate = .25;
    if (Math.random() < spawnRate && this.drips.length < 32) {
      this.drips.push({
        x: Math.random() * this.W,
        y: -30,
        vy: .5 + Math.random() * 1.8,
        col: this.theme.cols[Math.floor(Math.random() * this.theme.cols.length)],
        a: .05 + Math.random() * .10,
        w: 1.2 + Math.random() * 2.5,
        tail: [], maxTail: 28,
        wobble: Math.random() * Math.PI * 2,
      });
    }

    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      d.wobble += .02;
      d.x += Math.sin(d.wobble) * .4;
      d.y += d.vy;
      d.tail.push({ x: d.x, y: d.y });
      if (d.tail.length > d.maxTail) d.tail.shift();

      if (d.tail.length > 2) {
        const grad = ctx.createLinearGradient(d.tail[0].x, d.tail[0].y, d.x, d.y);
        grad.addColorStop(0, d.col + '00');
        grad.addColorStop(1, d.col + Math.round(d.a * 255).toString(16).padStart(2,'0'));

        ctx.beginPath();
        ctx.moveTo(d.tail[0].x, d.tail[0].y);
        for (let j = 1; j < d.tail.length; j++) {
          const m = (d.tail[j].x + d.tail[j-1].x) / 2;
          const n = (d.tail[j].y + d.tail[j-1].y) / 2;
          ctx.quadraticCurveTo(d.tail[j-1].x, d.tail[j-1].y, m, n);
        }
        ctx.strokeStyle = grad;
        ctx.lineWidth = d.w;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Drophead glow
        const rg = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.w * 6);
        rg.addColorStop(0, d.col + 'CC');
        rg.addColorStop(1, d.col + '00');
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.w * 3, 0, Math.PI * 2);
        ctx.fillStyle = rg; ctx.fill();
      }
      if (d.y > this.H + 60) this.drips.splice(i, 1);
    }

    // ── Pixel Sprites ──
    this.sprites.forEach(sp => {
      sp.wobble += .012;
      sp.x += sp.vx + Math.sin(sp.wobble * .4) * .08;
      sp.y += sp.vy + Math.cos(sp.wobble * .3) * .06;
      if (sp.x < -60) sp.x = this.W + 10;
      if (sp.x > this.W + 60) sp.x = -10;
      if (sp.y < -60) sp.y = this.H + 10;
      if (sp.y > this.H + 60) sp.y = -10;

      const pulse = Math.sin(sp.wobble * 1.2) * .3 + .7;
      ctx.fillStyle = sp.col + Math.round(sp.a * pulse * 255).toString(16).padStart(2,'0');
      sp.pixels.forEach((row, ry) => {
        for (let cx = 0; cx < row.length; cx++) {
          if (row[cx] === 'X') {
            ctx.fillRect(
              Math.round(sp.x + cx * sp.scale),
              Math.round(sp.y + ry * sp.scale),
              sp.scale - 1, sp.scale - 1
            );
          }
        }
      });
    });
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────
  setTheme(pageType) {
    this.pageType = pageType;
    this.theme = THEMES[pageType] || THEMES.default;
    // Respawn drips with new colors
    this.drips.forEach(d => {
      d.col = this.theme.cols[Math.floor(Math.random() * this.theme.cols.length)];
    });
    this.sprites.forEach(sp => {
      sp.col = this.theme.cols[Math.floor(Math.random() * this.theme.cols.length)];
    });
  }

  // Call this on music beat for reactive pulsing
  triggerBeat(intensity = 1.0) {
    this.beat = Math.min(1.0, this.beat + intensity * .6);
  }

  // Update accent color dynamically (e.g. from album art)
  setAccentColor(hex) {
    if (this.theme) this.theme.cols[0] = hex;
  }

  _bindEvents() {
    window.addEventListener('mousemove', e => { this.mx = e.clientX; this.my = e.clientY; }, { passive: true });
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this._resize(), 150);
    }, { passive: true });
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.glCanvas) this.glCanvas.remove();
    if (this.canvas2d) this.canvas2d.remove();
  }

  _onReady() {
    // Smooth entrance reveal
    [this.glCanvas, this.canvas2d].forEach(c => {
      if (!c) return;
      c.style.opacity = '0';
      c.style.transition = 'opacity 1.2s ease';
      requestAnimationFrame(() => { c.style.opacity = '1'; });
    });
  }
}

// ─── CURSOR SYSTEM ─────────────────────────────────────────────────────
class CursorSystem {
  constructor() {
    this.outer = null; this.inner = null; this.dots = [];
    this.ox = -500; this.oy = -500;
    this.mx = -500; this.my = -500;
    this.TRAIL = 6;
    this.tx = []; this.ty = [];
    this.isHovering = false;
  }

  init() {
    if (window.matchMedia('(hover: none)').matches) return;

    this.inner = Object.assign(document.createElement('div'), { id: 'ci' });
    this.outer = Object.assign(document.createElement('div'), { id: 'co' });
    this.inner.style.cssText = 'position:fixed;width:8px;height:8px;background:#fff;border-radius:50%;pointer-events:none;z-index:99999;margin:-4px 0 0 -4px;transition:transform .08s;mix-blend-mode:difference;';
    this.outer.style.cssText = 'position:fixed;width:38px;height:38px;border:1.5px solid rgba(123,47,255,.6);border-radius:50%;pointer-events:none;z-index:99998;margin:-19px 0 0 -19px;transition:transform .35s cubic-bezier(.22,1,.36,1),border-color .2s;';
    document.body.appendChild(this.inner);
    document.body.appendChild(this.outer);

    const COLORS = ['rgba(123,47,255,.5)','rgba(0,212,255,.45)','rgba(255,76,210,.4)','rgba(53,237,126,.32)','rgba(255,184,0,.25)','rgba(123,47,255,.18)'];
    for (let i = 0; i < this.TRAIL; i++) {
      const d = document.createElement('div');
      const sz = 6 - i * .7;
      d.className = 'ct';
      d.style.cssText = `position:fixed;width:${sz}px;height:${sz}px;border-radius:50%;pointer-events:none;z-index:99997;margin:-${sz/2}px 0 0 -${sz/2}px;background:${COLORS[i]};`;
      document.body.appendChild(d);
      this.dots.push(d);
      this.tx.push(-500); this.ty.push(-500);
    }

    document.addEventListener('mousemove', e => { this.mx = e.clientX; this.my = e.clientY; }, { passive: true });
    document.addEventListener('mousedown', () => {
      this.inner.style.transform = 'scale(.7)';
      this.outer.style.transform = 'scale(.85)';
    });
    document.addEventListener('mouseup', () => {
      this.inner.style.transform = ''; this.outer.style.transform = '';
    });

    const hoverSel = 'a,button,[class*="btn"],[class*="card"],input,select,.genre-card,.mood-card,.ctrl-btn';
    document.addEventListener('mouseover', e => {
      if (e.target.closest(hoverSel)) {
        this.outer.style.width = '52px'; this.outer.style.height = '52px';
        this.outer.style.margin = '-26px 0 0 -26px';
        this.outer.style.borderColor = 'rgba(0,212,255,.8)';
        document.body.classList.add('ch');
      }
    }, { passive: true });
    document.addEventListener('mouseout', e => {
      if (e.target.closest(hoverSel)) {
        this.outer.style.width = '38px'; this.outer.style.height = '38px';
        this.outer.style.margin = '-19px 0 0 -19px';
        this.outer.style.borderColor = 'rgba(123,47,255,.6)';
        document.body.classList.remove('ch');
      }
    }, { passive: true });

    this._loop();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    this.inner.style.left = this.mx + 'px'; this.inner.style.top = this.my + 'px';
    this.ox += (this.mx - this.ox) * .12; this.oy += (this.my - this.oy) * .12;
    this.outer.style.left = this.ox + 'px'; this.outer.style.top = this.oy + 'px';

    this.tx[0] += (this.mx - this.tx[0]) * .3; this.ty[0] += (this.my - this.ty[0]) * .3;
    this.dots[0].style.left = this.tx[0] + 'px'; this.dots[0].style.top = this.ty[0] + 'px';
    for (let i = 1; i < this.TRAIL; i++) {
      this.tx[i] += (this.tx[i-1] - this.tx[i]) * .35;
      this.ty[i] += (this.ty[i-1] - this.ty[i]) * .35;
      this.dots[i].style.left = this.tx[i] + 'px';
      this.dots[i].style.top  = this.ty[i] + 'px';
    }
  }
}

// ─── SCROLL REVEAL ─────────────────────────────────────────────────────
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const delay = parseFloat(e.target.dataset.d || 0) * 80;
      setTimeout(() => {
        e.target.classList.add('in');
        e.target.querySelectorAll('.ki').forEach((s, i) =>
          setTimeout(() => { s.style.transform='translateY(0)'; s.style.opacity='1'; }, i * 55)
        );
      }, delay);
      obs.unobserve(e.target);
    });
  }, { threshold: .04, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.r,.rl,.rr,.rs,.kin').forEach((el, i) => {
    if (!el.dataset.d) el.dataset.d = i % 8;
    obs.observe(el);
  });
}

// ─── SCANLINE ──────────────────────────────────────────────────────────
function addScanline() {
  const s = document.createElement('div');
  s.id = 'bg-scanline';
  s.style.cssText = 'position:fixed;inset:0;z-index:-2;background:repeating-linear-gradient(0deg,rgba(0,0,0,.015) 0px,transparent 1px,transparent 3px);pointer-events:none;';
  document.body.insertBefore(s, document.body.firstChild);
}

// ─── SPOTLIGHT ─────────────────────────────────────────────────────────
function initSpotlight() {
  let af;
  document.addEventListener('mousemove', e => {
    cancelAnimationFrame(af);
    af = requestAnimationFrame(() => {
      document.querySelectorAll('.spc,.sp,.card,.glass,.svc,.member-card,.genre-card,.mood-card').forEach(el => {
        const r = el.getBoundingClientRect();
        if (Math.abs(e.clientX - (r.left + r.width/2)) > r.width * 1.6) return;
        el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
    });
  }, { passive: true });
}

// ─── MAGNETIC BUTTONS ──────────────────────────────────────────────────
function initMagnetic() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('[class*="btn"],[class*="card"]').forEach(btn => {
    let af;
    btn.addEventListener('mousemove', e => {
      cancelAnimationFrame(af);
      af = requestAnimationFrame(() => {
        const r = btn.getBoundingClientRect();
        btn.style.transform = `translate(${(e.clientX-(r.left+r.width/2))*.14}px,${(e.clientY-(r.top+r.height/2))*.14}px)`;
        btn.style.transition = 'transform .06s';
      });
    });
    btn.addEventListener('mouseleave', () => {
      cancelAnimationFrame(af);
      btn.style.transform = '';
      btn.style.transition = 'transform .55s cubic-bezier(.34,1.56,.64,1)';
    });
  });
}

// ─── SINGLETON INSTANCES ───────────────────────────────────────────────
let bgEngine = null;
let cursorSystem = null;

// ─── PUBLIC API ────────────────────────────────────────────────────────
function init(pageType = 'default') {
  bgEngine = new BGEngine();
  bgEngine.init(pageType);

  cursorSystem = new CursorSystem();
  cursorSystem.init();

  addScanline();
  initReveal();
  initSpotlight();
  initMagnetic();

  // NAV
  const nav = document.getElementById('nav') || document.getElementById('mainNav');
  if (nav) {
    window.addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 40), { passive: true });
  }
}

function triggerBeat(intensity = 1.0) {
  if (bgEngine) bgEngine.triggerBeat(intensity);
}

function setTheme(pageType) {
  if (bgEngine) bgEngine.setTheme(pageType);
}

function setAccentColor(hex) {
  if (bgEngine) bgEngine.setAccentColor(hex);
}

return { init, triggerBeat, setTheme, setAccentColor, BGEngine, CursorSystem };
})();

// ─── GLOBAL ALIASES (backwards compat) ───────────────────────────────────
const initBG = (type) => CLBG.init(type);
if (typeof module !== 'undefined') module.exports = CLBG;
