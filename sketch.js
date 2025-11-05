// ====== STATE ======
let permissionGranted = false;
let cx, cy, vx = 0, vy = 0;
let ballColor, bgColor;
const ballSize = 80;

// physics
const accel = 0.15, damping = 0.985, restitution = 0.75;

// collision debounce
let lastEdgeAt = 0;
const edgeCooldownMs = 220;

// audio
let samples = [];      // p5.SoundFile[]
let audioReady = false;

// ui
let enableBtn, testBtn, statusEl;

// ====== VISUALS (Patatap-ish) ======
const animations = [];
const MAX_ANIMS = 120;
const palettes = [
  ["#00D1B2","#14FFEC","#00A6FB","#3C91E6","#1B2CC1"],
  ["#FF3366","#FFBD00","#6BF178","#2D7DD2","#F79824"],
  ["#B794F4","#8BD3E6","#FF90E8","#FDE24F","#00E8FC"],
  ["#FF7F50","#7FFFD4","#F9F871","#BFFCC6","#B28DFF"]
];
let paletteIdx = 0;
const randCol = () => color(random(palettes[paletteIdx]));
const easeOutQuad = (t)=>1-(1-t)*(1-t);
const easeOutExpo = (t)=>t===1?1:1-Math.pow(2,-10*t);

class Ring {
  constructor(x,y,e,c){ this.x=x; this.y=y; this.col=c; this.life=0;
    this.dur=350+e*15; this.maxR=40+e*8; this.w=2+map(e,0,12,1,5,true);}
  draw(){
    const t=constrain(this.life/this.dur,0,1), k=easeOutExpo(t);
    noFill(); stroke(red(this.col),green(this.col),blue(this.col),255*(1-t));
    strokeWeight(this.w*(1-t)); circle(this.x,this.y,this.maxR*2*k);
    this.life+=deltaTime; return t<1;
  }
}
class Confetti {
  constructor(x,y,e,c){ this.x=x; this.y=y; this.col=c; this.life=0;
    this.vx=random(-2,2)*(1+e*0.08); this.vy=random(-3,-0.5)*(1+e*0.06);
    this.g=0.08; this.rot=random(TWO_PI); this.vr=random(-0.2,0.2);
    this.size=random(4,10); this.dur=500+e*20;}
  draw(){
    const t=constrain(this.life/this.dur,0,1);
    this.vy+=this.g; this.x+=this.vx; this.y+=this.vy; this.rot+=this.vr;
    push(); translate(this.x,this.y); rotate(this.rot);
    noStroke(); fill(red(this.col),green(this.col),blue(this.col),255*(1-t));
    rectMode(CENTER); rect(0,0,this.size,this.size*0.6,2); pop();
    this.life+=deltaTime; return t<1;
  }
}
class Rays {
  constructor(x,y,e,c){ this.x=x; this.y=y; this.col=c; this.life=0;
    this.n=8+floor(random(6))+floor(e); this.len=20+e*6; this.dur=300+e*10;}
  draw(){
    const t=constrain(this.life/this.dur,0,1), k=easeOutQuad(t);
    stroke(red(this.col),green(this.col),blue(this.col),200*(1-t));
    strokeWeight(2*(1-t));
    for(let i=0;i<this.n;i++){
      const a=(TWO_PI/this.n)*i+(1-k)*0.8, r0=8, r1=r0+this.len*(1-k);
      line(this.x+cos(a)*r0,this.y+sin(a)*r0,this.x+cos(a)*r1,this.y+sin(a)*r1);
    }
    this.life+=deltaTime; return t<1;
  }
}
class Blob {
  constructor(x,y,e,c){ this.x=x; this.y=y; this.col=c; this.life=0;
    this.rad=12+e*4; this.jit=6+e*0.8; this.pts=16; this.dur=380+e*15;}
  draw(){
    const t=constrain(this.life/this.dur,0,1), k=easeOutQuad(t);
    noStroke(); fill(red(this.col),green(this.col),blue(this.col),140*(1-t));
    beginShape();
    for(let i=0;i<this.pts;i++){
      const a=(TWO_PI/this.pts)*i;
      const r=this.rad*(1+k*0.6)+noise(i*0.2,t*3)*this.jit*(1-k);
      vertex(this.x+cos(a)*r,this.y+sin(a)*r);
    }
    endShape(CLOSE); this.life+=deltaTime; return t<1;
  }
}

function spawnVisuals(x,y,impact){
  const count = 2 + floor(map(impact,0,12,0,5,true));
  for(let i=0;i<count;i++){
    const K=random([Ring,Confetti,Rays,Blob]);
    animations.push(new K(x,y,impact,randCol()));
  }
  if (animations.length>MAX_ANIMS) animations.splice(0,animations.length-MAX_ANIMS);
  if (random()<0.2) paletteIdx=(paletteIdx+1)%palettes.length;
}

// ====== UTIL ======
const setStatus = (m)=>{ const el=document.getElementById("status"); if(el) el.textContent=m; };
const resumeAC = async()=>{ try{ const ac=getAudioContext(); if(ac&&ac.state!=="running") await ac.resume(); }catch(_){} };

// ====== P5 ======
function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2; cy = height / 2;
  ballColor = color(0); bgColor = color(255);

  enableBtn = document.getElementById("enableBtn") || document.getElementById("btn");
  testBtn   = document.getElementById("testBtn");
  statusEl  = document.getElementById("status");

  if (enableBtn) enableBtn.addEventListener("click", onEnableClicked, { once: true });
  if (testBtn)   testBtn.addEventListener("click", onTestSound);
}

async function onEnableClicked() {
  try { if (typeof userStartAudio==="function") await userStartAudio(); await resumeAC(); masterVolume(1.0); } catch(_){}
  try {
    if (typeof DeviceOrientationEvent!=="undefined" && typeof DeviceOrientationEvent.requestPermission==="function") {
      await DeviceOrientationEvent.requestPermission().catch(()=>{});
    }
    if (typeof DeviceMotionEvent!=="undefined" && typeof DeviceMotionEvent.requestPermission==="function") {
      await DeviceMotionEvent.requestPermission().catch(()=>{});
    }
  } catch(_){}

  // Load samples A–N
  setStatus?.("Loading sounds…");
  const letters="ABCDEFGHIJKLMN".split(""); let loaded=0;
  letters.forEach((L,i)=>{
    loadSound(`assets/${L}.mp3`,
      (s)=>{ s.playMode("restart"); s.setVolume(0.85); samples[i]=s; if(++loaded===letters.length){ audioReady=true; setStatus?.("Ready. Tilt to bounce ✨ (turn off Silent mode)."); if(testBtn) testBtn.disabled=false; }},
      ()=>{ if(testBtn) testBtn.disabled=false; }
    );
  });

  permissionGranted = true;
  if (enableBtn) enableBtn.disabled = true;
}

async function onTestSound(){
  await resumeAC();
  const s = samples.find(sf=>sf && sf.isLoaded());
  if (s){ s.rate(1); s.play(); setStatus?.("Test sound played."); }
  else { setStatus?.("Still loading…"); }
}

function draw() {
  background(bgColor);

  // draw animations (and prune)
  for(let i=animations.length-1;i>=0;i--){ if(!animations[i].draw()) animations.splice(i,1); }

  if (!permissionGranted){ noFill(); stroke(0); rect(12,12,340,70,12); return; }

  const dx = constrain(rotationY||0,-3,3);
  const dy = constrain(rotationX||0,-3,3);

  vx += dx*accel; vy += dy*accel; vx*=damping; vy*=damping;
  cx += vx; cy += vy;

  const r = ballSize/2;
  let collided = false;
  const impact = Math.hypot(vx,vy);

  if (cx < r) { cx=r; if (vx<0){ collided=true; vx=-vx*restitution; } }
  if (cx > width-r) { cx=width-r; if (vx>0){ collided=true; vx=-vx*restitution; } }
  if (cy < r) { cy=r; if (vy<0){ collided=true; vy=-vy*restitution; } }
  if (cy > height-r) { cy=height-r; if (vy>0){ collided=true; vy=-vy*restitution; } }

  if (collided && millis()-lastEdgeAt>edgeCooldownMs){
    // swap colors
    const tmp=ballColor; ballColor=bgColor; bgColor=tmp;
    lastEdgeAt=millis();

    // visuals
    spawnVisuals(cx, cy, impact);

    // audio w/ velocity->pitch
    playPitchedCollision(impact);
  }

  noStroke(); fill(ballColor); ellipse(cx, cy, ballSize);
}

function windowResized(){ resizeCanvas(windowWidth, windowHeight); }

// ====== AUDIO: velocity -> pitch ======
function playPitchedCollision(speed) {
  const loaded = samples.filter(s=>s && s.isLoaded());
  if (!loaded.length) return;
  resumeAC();

  const t = constrain((speed-1.5)/(12.0-1.5), 0, 1); // map speed
  const rate = lerp(0.75, 1.6, t);

  const s = random(loaded);
  s.rate(rate);
  s.play();
}