/**
 * ═══════════════════════════════════════════════════════════════
 * CONCLAVE BG ENGINE v5.0 SOVEREIGN
 * WebGL1 Volumetric Nebula · Particle Field · 2D Drip Layer
 * Exposes: window.CLBG → CLBG.init(pageType)
 * NO cursor · NO reveal · NO spotlight — conclave.js owns those
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';
window.CLBG=(function(){

const THEMES={
  index:    {cols:['#FF4CD2','#7B2FFF','#00D4FF','#FFB800'],bg:'#030208'},
  ark:      {cols:['#FF7A00','#FF4500','#FFB800','#FF2200'],bg:'#060200'},
  minecraft:{cols:['#35ED7E','#00D4FF','#44FF44','#00FF88'],bg:'#020502'},
  donations:{cols:['#FFB800','#FF9900','#FFD700','#FF8800'],bg:'#060400'},
  promoter: {cols:['#FF4CD2','#DA70D6','#EE82EE','#FF1493'],bg:'#060005'},
  nitrado:  {cols:['#00D4FF','#0088FF','#44AAFF','#00BBFF'],bg:'#000408'},
  meet:     {cols:['#FF4CD2','#7B2FFF','#00D4FF','#35ED7E'],bg:'#050408'},
  hub:      {cols:['#FF4CD2','#7B2FFF','#00D4FF','#35ED7E'],bg:'#040308'},
  suzyqs:   {cols:['#FF8C00','#FF6B00','#FFB800','#FF5500'],bg:'#070300'},
  sandysartgalla:{cols:['#FF4CD2','#A855F7','#00D4FF','#FFB800'],bg:'#040308'},
  default:  {cols:['#FF4CD2','#7B2FFF','#00D4FF','#35ED7E'],bg:'#030208'},
};

/* WebGL1 GLSL — no #version, no in/out */
const VS_QUAD='attribute vec4 aPos;void main(){gl_Position=aPos;}';

const FS_NEBULA=`precision highp float;
uniform float uT;uniform vec2 uRes;uniform vec3 uC1,uC2,uC3;uniform vec2 uMouse;uniform float uBeat;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes,p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);float t=uT*.22;
  vec2 q=vec2(fbm(p*1.15+t*.38),fbm(p*1.15+vec2(5.2,1.3)+t*.3));
  vec2 r=vec2(fbm(p*.85+2.6*q+vec2(1.7,9.2)+t*.16),fbm(p*.85+2.6*q+vec2(8.3,2.8)+t*.13));
  float f=fbm(p*.75+3.*r);
  vec3 col=mix(uC1*.28,uC2*.72,clamp(f*1.9,0.,1.));col=mix(col,uC3*.9,clamp(f*f*4.2,0.,1.));col*=.22+f*.78;
  float s1=sin(t*.55),c1x=cos(t*.42),s2=sin(t*.38+1.2),c2x=cos(t*.48+.8),s3=sin(t*.62+2.4),c3x=cos(t*.33+1.6);
  col+=uC1*exp(-length(p-vec2(s1*.32,c1x*.26))*2.5)*(.48+uBeat*.55);
  col+=uC2*exp(-length(p-vec2(c2x*.38+.12,s2*.28))*3.)*0.34;
  col+=uC3*exp(-length(p-vec2(s3*.28-.14,c3x*.32-.08))*3.6)*.22;
  vec2 ms=(uMouse/uRes-.5)*vec2(uRes.x/uRes.y,1.);
  col+=uC3*exp(-length(p-ms)*6.5)*.18;
  col*=1.-smoothstep(.38,1.32,length(uv-.5)*2.);
  col+=(h(uv*uRes+uT*79.)-.5)*.024;
  col*=1.-sin(gl_FragCoord.y*3.14159*.5)*.011;
  gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;

const VS_PART=`attribute float aId;attribute vec2 aBase;attribute float aSz;
uniform float uT;uniform vec2 uRes;uniform float uBeat;uniform vec3 uC1,uC2,uC3;
varying float vA;varying vec3 vC;
float hf(float n){return fract(sin(n)*43758.5453);}
void main(){
  float sp=hf(aId*.713)+.12,ph=aId*2.3999;
  float ox=sin(uT*sp*.58+ph)*.054+cos(uT*sp*.37+ph*1.4)*.032;
  float oy=cos(uT*sp*.46+ph+1.1)*.046+sin(uT*sp*.31+ph*.9)*.028;
  vec2 pos=aBase+vec2(ox,oy);pos.x*=uRes.y/uRes.x;gl_Position=vec4(pos,0.,1.);
  float pulse=sin(uT*(hf(aId*2.7)+.25)*2.2+aId)*.5+.5;
  gl_PointSize=(aSz+pulse*2.2)*(1.+uBeat*.7)*(uRes.y/800.);
  vA=(0.04+hf(aId*.81)*.17)*(.36+pulse*.58)*(1.+uBeat*.3);
  float cc=hf(aId*.567);vC=cc<.33?uC1:(cc<.66?uC2:uC3);
}`;

const FS_PART=`precision mediump float;varying float vA;varying vec3 vC;
void main(){vec2 uv=gl_PointCoord-.5;float r=length(uv);float a=vA*(1.-smoothstep(.25,.5,r));gl_FragColor=vec4(vC,a);}`;

/* state */
let gl=null,ctx2=null,cvGL=null,cv2d=null,progs={},bufs={};
let theme=THEMES.default,beat=0,mxp=0,myp=0,W=0,H=0,PR=1,t0=Date.now(),rafId=null,nPart=2400;
const drips=[],sprites=[];

const PIX={
  dino:   ['  XX  ',' XXXX ','XXXXXX',' XXX  ',' X  X '],
  crystal:['  X  ',' XXX ','XXXXX',' XXX ','  X  '],
  ptero:  ['X    X','XXXXXX',' XXXX ','  XX  '],
  star:   ['  X  ',' X X ','XXXXX',' X X ','  X  '],
};
const PKEYS=Object.keys(PIX);

function h3(hex){const n=parseInt(hex.replace('#',''),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
function mkS(type,src){const s=gl.createShader(type);gl.shaderSource(s,src.trim());gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))console.warn('[CLBG]',gl.getShaderInfoLog(s));return s;}
function mkP(vs,fs){const p=gl.createProgram();gl.attachShader(p,mkS(gl.VERTEX_SHADER,vs));gl.attachShader(p,mkS(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))console.warn('[CLBG link]',gl.getProgramInfoLog(p));return p;}
function sU(p,nm,fn,...a){const l=gl.getUniformLocation(p,nm);if(l!==null)gl[fn](l,...a);}
function bAt(b,nm,sz){const l=gl.getAttribLocation(progs.pt,nm);if(l<0)return;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,sz,gl.FLOAT,false,0,0);}

function init(pageType){
  theme=THEMES[pageType]||THEMES.default;
  W=window.innerWidth;H=window.innerHeight;
  PR=Math.min(window.devicePixelRatio||1,W<768?1:1.5);
  nPart=W<600?900:W<1440?1800:3000;
  document.body.style.backgroundColor=theme.bg;
  _gl();_2d();_ev();
  if(rafId)cancelAnimationFrame(rafId);
  _loop();
}

function _gl(){
  cvGL=document.getElementById('bg');
  if(!cvGL){cvGL=document.createElement('canvas');cvGL.id='bg';document.body.insertBefore(cvGL,document.body.firstChild);}
  cvGL.style.cssText='position:fixed;inset:0;z-index:0;pointer-events:none;';
  cvGL.width=Math.floor(W*PR);cvGL.height=Math.floor(H*PR);
  const opt={antialias:false,powerPreference:'high-performance',alpha:false,depth:false,stencil:false};
  gl=cvGL.getContext('webgl',opt)||cvGL.getContext('experimental-webgl',opt);
  if(!gl){_css();return;}
  gl.enable(gl.BLEND);gl.viewport(0,0,cvGL.width,cvGL.height);
  /* nebula */
  progs.neb=mkP(VS_QUAD,FS_NEBULA);
  bufs.q=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,bufs.q);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  /* particles */
  progs.pt=mkP(VS_PART,FS_PART);
  const ids=new Float32Array(nPart),bs=new Float32Array(nPart*2),sz=new Float32Array(nPart);
  for(let i=0;i<nPart;i++){ids[i]=i;bs[i*2]=Math.random()*2-1;bs[i*2+1]=Math.random()*2-1;sz[i]=.8+Math.random()*3.8;}
  const mk=d=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,d,gl.STATIC_DRAW);return b;};
  bufs.pi=mk(ids);bufs.pb=mk(bs);bufs.ps=mk(sz);
}

function _css(){
  const c=theme.cols;
  document.body.style.background=`radial-gradient(ellipse 80% 60% at 25% 35%,${c[0]}28,transparent 55%),radial-gradient(ellipse 70% 50% at 75% 65%,${c[1]}20,transparent 50%),${theme.bg}`;
}

function _2d(){
  const old=document.getElementById('bg2d');if(old)old.remove();
  cv2d=document.createElement('canvas');cv2d.id='bg2d';
  cv2d.style.cssText='position:fixed;inset:0;z-index:1;pointer-events:none;';
  cv2d.width=W;cv2d.height=H;
  if(cvGL&&cvGL.parentNode)cvGL.after(cv2d);else document.body.insertBefore(cv2d,document.body.firstChild);
  ctx2=cv2d.getContext('2d');
  drips.length=0;for(let i=0;i<16;i++)_sd(Math.random()*H);
  sprites.length=0;
  for(let i=0;i<5;i++)sprites.push({type:PKEYS[i%PKEYS.length],x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.28,vy:(Math.random()-.5)*.2,sc:2+Math.floor(Math.random()*2),a:.09+Math.random()*.12,col:theme.cols[i%theme.cols.length],wb:Math.random()*Math.PI*2});
}

function _sd(sy){
  drips.push({x:Math.random()*W,y:sy!==undefined?sy:-12,vy:.55+Math.random()*1.9,col:theme.cols[Math.floor(Math.random()*theme.cols.length)],a:.05+Math.random()*.09,w:1+Math.random()*2.4,tail:[],mt:26,wb:Math.random()*Math.PI*2});
}

function _ev(){
  window.addEventListener('mousemove',e=>{mxp=e.clientX;myp=e.clientY;},{passive:true});
  let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(_rz,160);},{passive:true});
}

function _rz(){
  W=window.innerWidth;H=window.innerHeight;PR=Math.min(window.devicePixelRatio||1,W<768?1:1.5);
  if(cvGL){cvGL.width=Math.floor(W*PR);cvGL.height=Math.floor(H*PR);if(gl)gl.viewport(0,0,cvGL.width,cvGL.height);}
  if(cv2d){cv2d.width=W;cv2d.height=H;}
}

function _loop(){
  rafId=requestAnimationFrame(_loop);
  const t=(Date.now()-t0)*.001;beat*=.92;
  if(gl){_neb(t);_pts(t);}
  _d2(t);
}

function _neb(t){
  const p=progs.neb;gl.useProgram(p);gl.blendFunc(gl.ONE,gl.ZERO);
  gl.bindBuffer(gl.ARRAY_BUFFER,bufs.q);
  const ap=gl.getAttribLocation(p,'aPos');gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,2,gl.FLOAT,false,0,0);
  sU(p,'uT','uniform1f',t);sU(p,'uRes','uniform2f',cvGL.width,cvGL.height);
  sU(p,'uMouse','uniform2f',mxp*PR,(H-myp)*PR);sU(p,'uBeat','uniform1f',beat);
  sU(p,'uC1','uniform3fv',h3(theme.cols[0]));sU(p,'uC2','uniform3fv',h3(theme.cols[1]));sU(p,'uC3','uniform3fv',h3(theme.cols[2]||theme.cols[0]));
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}

function _pts(t){
  const p=progs.pt;gl.useProgram(p);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  sU(p,'uT','uniform1f',t);sU(p,'uRes','uniform2f',cvGL.width,cvGL.height);sU(p,'uBeat','uniform1f',beat);
  sU(p,'uC1','uniform3fv',h3(theme.cols[0]));sU(p,'uC2','uniform3fv',h3(theme.cols[1]));sU(p,'uC3','uniform3fv',h3(theme.cols[2]||theme.cols[0]));
  bAt(bufs.pi,'aId',1);bAt(bufs.pb,'aBase',2);bAt(bufs.ps,'aSz',1);
  gl.drawArrays(gl.POINTS,0,nPart);
}

function _d2(t){
  if(!ctx2)return;ctx2.clearRect(0,0,W,H);
  if(Math.random()<.18&&drips.length<24)_sd();
  for(let i=drips.length-1;i>=0;i--){
    const d=drips[i];d.wb+=.016;d.x+=Math.sin(d.wb)*.5;d.y+=d.vy;
    d.tail.push({x:d.x,y:d.y});if(d.tail.length>d.mt)d.tail.shift();
    if(d.tail.length>2){
      const hx=Math.round(d.a*255).toString(16).padStart(2,'0');
      const gr=ctx2.createLinearGradient(d.tail[0].x,d.tail[0].y,d.x,d.y);
      gr.addColorStop(0,d.col+'00');gr.addColorStop(1,d.col+hx);
      ctx2.beginPath();ctx2.moveTo(d.tail[0].x,d.tail[0].y);
      for(let j=1;j<d.tail.length;j++){const mx2=(d.tail[j].x+d.tail[j-1].x)*.5,my2=(d.tail[j].y+d.tail[j-1].y)*.5;ctx2.quadraticCurveTo(d.tail[j-1].x,d.tail[j-1].y,mx2,my2);}
      ctx2.strokeStyle=gr;ctx2.lineWidth=d.w;ctx2.lineCap='round';ctx2.stroke();
      const rg=ctx2.createRadialGradient(d.x,d.y,0,d.x,d.y,d.w*5);rg.addColorStop(0,d.col+'BB');rg.addColorStop(1,d.col+'00');
      ctx2.beginPath();ctx2.arc(d.x,d.y,d.w*2.5,0,Math.PI*2);ctx2.fillStyle=rg;ctx2.fill();
    }
    if(d.y>H+55)drips.splice(i,1);
  }
  sprites.forEach(sp=>{
    sp.wb+=.01;sp.x+=sp.vx+Math.sin(sp.wb*.28)*.06;sp.y+=sp.vy+Math.cos(sp.wb*.22)*.05;
    if(sp.x<-80)sp.x=W+20;if(sp.x>W+80)sp.x=-20;if(sp.y<-80)sp.y=H+20;if(sp.y>H+80)sp.y=-20;
    ctx2.fillStyle=sp.col+Math.round(sp.a*(Math.sin(sp.wb*.9)*.25+.75)*255).toString(16).padStart(2,'0');
    (PIX[sp.type]||[]).forEach((row,ry)=>{for(let cx=0;cx<row.length;cx++){if(row[cx]==='X')ctx2.fillRect(Math.round(sp.x+cx*sp.sc),Math.round(sp.y+ry*sp.sc),sp.sc-1,sp.sc-1);}});
  });
}

function setTheme(type){
  theme=THEMES[type]||THEMES.default;
  document.body.style.backgroundColor=theme.bg;
  sprites.forEach(sp=>{sp.col=theme.cols[Math.floor(Math.random()*theme.cols.length)];});
  drips.forEach(d=>{d.col=theme.cols[Math.floor(Math.random()*theme.cols.length)];});
}

function triggerBeat(intensity){beat=Math.min(1.,beat+(intensity||1)*.85);}
function destroy(){if(rafId){cancelAnimationFrame(rafId);rafId=null;}}

return{init,setTheme,triggerBeat,destroy};
})();
