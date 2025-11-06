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

// UI
let enableBtn = null, testBtn = null, statusEl = null;
const setStatus = (m)=>{ if(statusEl) statusEl.textContent = m; };

// ====== WEB AUDIO (no p5.sound) ======
let AC = null, masterGain = null;
let buffers = [];              // decoded AudioBuffer[]
let audioReady = false;
const LETTERS = "ABCDEFGHIJKLMN".split("");

// ====== Motion fallbacks & debug ======
let doBeta = null, doGamma = null, haveDO = false;      // deviceorientation
let dmAx = null, dmAy = null, haveDM = false;           // devicemotion (incl. gravity)
let sourceUsed = "none";                                 // which source drove movement

// simple HUD
function drawHUD(rx, ry){
  push();
  noStroke(); fill(0, 160);
  rect(10, height-74, 270, 64, 10);
  fill(255); textSize(12);
  text(
    `src: ${sourceUsed}
p5 rx=${nf(rx||0,1,2)}  ry=${nf(ry||0,1,2)}
DO β=${nf(doBeta??0,1,2)} γ=${nf(doGamma??0,1,2)}
DM ax=${nf(dmAx??0,1,2)} ay=${nf(dmAy??0,1,2)}`, 18, height-56
  );
  pop();
}

// ====== AUDIO LOADING / PLAYBACK ======
async function initAudioAndLoad() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state !== "running") { try { await AC.resume(); } catch(_){} }
  if (!masterGain) { masterGain = AC.createGain(); masterGain.gain.value = 0.9; masterGain.connect(AC.destination); }

  setStatus("Loading sounds…");
  const loads = LETTERS.map(async (L, i) => {
    try {
      const res = await fetch(`assets/${L}.mp3`, { cache: "force-cache" });
      if (!res.ok) throw new Error(`${L}.mp3 ${res.status}`);
      const ab = await res.arrayBuffer();
      const buf = await AC.decodeAudioData(ab);
      buffers[i] = buf;
    } catch (e) { console.warn("Failed to load", L, e); }
  });
  await Promise.all(loads);
  const loadedCount = buffers.filter(Boolean).length;
  audioReady = loadedCount > 0;
  setStatus(audioReady ? "Sound ready. Tilt to bounce ✨" : "No sounds loaded—check paths/case.");
  if (testBtn) testBtn.disabled = !audioReady;
}

function playCollision(speed) {
  if (!audioReady || !AC) return;
  if (AC.state !== "running") AC.resume().catch(()=>{});

  const t = constrain((speed - 1.5) / (12.0 - 1.5), 0, 1);
  const rate = lerp(0.75, 1.6, t);
  const loaded = buffers.filter(Boolean);
  if (!loaded.length) return;
  const buf = random(loaded);

  const src = AC.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;

  const g = AC.createGain();
  g.gain.value = lerp(0.5, 1.0, t);
  src.connect(g).connect(masterGain);
  try { src.start(); } catch(_) {}
}

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
  draw(){ const t=constrain(this.life/this.dur,0,1), k=easeOutExpo(t);
    noFill(); stroke(red(this.col),green(this.col),blue(this.col),255*(1-t));
    strokeWeight(this.w*(1-t)); circle(this.x,this.y,this.maxR*2*k);
    this.life+=deltaTime; return t<1; }
}
class Confetti {
  constructor(x,y,e,c){ this.x=x; this.y=y; this.col=c; this.life=0;
    this.vx=random(-2,2)*(1+e*0.08); this.vy=random(-3,-0.5)*(1+e*0.06);
    this.g=0.08; this.rot=random(TWO_PI); this.vr=random(-0.2,0.2);
    this.size=random(4,10); this.dur=500+e*20;}
  draw(){ const t=constrain(this.life/this.dur,0,1);
    this.vy+=this.g; this.x+=this.vx; this.y+=this.vy; this.rot+=this.vr;
    push(); translate(this.x,this.y); rotate(this.rot);
    noStroke(); fill(red(this.col),green(this.col),blue(this.col),255*(1-t));
    rectMode(CENTER); rect(0,0,this.size,this.size*0.6,2); pop();
    this.life+=deltaTime; return t<1; }
}
class Rays {
  constructor(x,y,e,c){ this.x=x; this.y=y; this.col=c; this.life=0;
    this.n=8+floor(random(6))+floor(e); this.len=20+e*6; this.dur=300+e*10;}
  draw(){ const t=constrain(this.life/this.dur,0,1), k=easeOutQuad(t);
    stroke(red(this.col),green(this.col),blue(this.col),200*(1-t));
    strokeWeight(2*(1-t));
    for(let i=0;i<this.n;i++){
      const a=(TWO_PI/this.n)*i+(1-k)*0.8, r0=8, r1=r0+this.len*(1-k);
      line(this.x+cos(a)*r0,this.y+sin(a)*r0, this.x+cos(a)*r1,this.y+sin(a)*r1);
    }
    this.life+=deltaTime; return t<1; }
}
class Blob {
  constructor(x,y,e,c){ this.x=x; this.y=y; this.col=c; this.life=0;
    this.rad=12+e*4; this.jit=6+e*0.8; this.pts=16; this.dur=380+e*15;}
  draw(){ const t=constrain(this.life/this.dur,0,1), k=easeOutQuad(t);
    noStroke(); fill(red(this.col),green(this.col),blue(this.col),140*(1-t));
    beginShape();
    for(let i=0;i<this.pts;i++){
      const a=(TWO_PI/this.pts)*i;
      const r=this.rad*(1+k*0.6)+noise(i*0.2,t*3)*this.jit*(1-k);
      vertex(this.x+cos(a)*r,this.y+sin(a)*r);
    }
    endShape(CLOSE);
    this.life+=deltaTime; return t<1; }
}
function spawnVisuals(x,y,impact){
  const count = 2 + floor(map(impact,0,12,0,5,true));
  for(let i=0;i<count;i++){
    const K = random([Ring, Confetti, Rays, Blob]);
    animations.push(new K(x,y,impact,randCol()));
  }
  if (animations.length > MAX_ANIMS) animations.splice(0, animations.length - MAX_ANIMS);
  if (random() < 0.2) paletteIdx = (paletteIdx + 1) % palettes.length;
}

// ====== P5 ======
function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2; cy = height / 2;
  ballColor = color(0); bgColor = color(255);

  enableBtn = document.getElementById("enableBtn");
  testBtn   = document.getElementById("testBtn");
  statusEl  = document.getElementById("status");

  if (enableBtn) enableBtn.addEventListener("click", onEnableClicked, { once: true });
  if (testBtn)   testBtn.addEventListener("click", onTestSound);
}

async function onEnableClicked() {
  // 1) Unlock audio + load buffers (user gesture)
  await initAudioAndLoad();

  // 2) Request motion/orientation (iOS 13+)
  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      await DeviceOrientationEvent.requestPermission().catch(()=>{});
    }
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      await DeviceMotionEvent.requestPermission().catch(()=>{});
    }
  } catch(_) {}

  // 3) Attach BOTH fallbacks
  window.addEventListener('deviceorientation', (e) => {
    if (typeof e.beta === 'number' && typeof e.gamma === 'number') {
      doBeta  = e.beta;
      doGamma = e.gamma;
      haveDO = true;
    }
  }, true);

  window.addEventListener('devicemotion', (e) => {
    if (e && e.accelerationIncludingGravity) {
      // Safari gives m/s^2; scale to [-3..3] later
      dmAx = e.accelerationIncludingGravity.x; // left/right
      dmAy = e.accelerationIncludingGravity.y; // front/back
      haveDM = true;
    }
  }, true);

  permissionGranted = true;
  if (enableBtn) enableBtn.disabled = true;

  setStatus("Sensors enabled. If Safari still doesn't move, check Settings → Safari → Motion & Orientation Access (ON).");
}

async function onTestSound() {
  if (!audioReady) { setStatus("Still loading or failed — check assets/ case."); return; }
  if (AC && AC.state !== "running") await AC.resume();
  const buf = buffers.find(Boolean);
  if (!buf) return;
  const src = AC.createBufferSource(); src.buffer = buf;
  const g = AC.createGain(); g.gain.value = 1.0;
  src.connect(g).connect(masterGain);
  try { src.start(); } catch(_){}
  setStatus("Test sound played (turn off Silent switch if muted).");
}

function draw() {
  background(bgColor);

  // draw animations
  for (let i = animations.length - 1; i >= 0; i--) {
    if (!animations[i].draw()) animations.splice(i, 1);
  }

  if (!permissionGranted) {
    noFill(); stroke(0); rect(12,12,340,70,12);
    return;
  }

  // Pick a motion source
  const rx = (typeof rotationX === 'number') ? rotationX : 0;
  const ry = (typeof rotationY === 'number') ? rotationY : 0;

  let dx = 0, dy = 0;
  if (Math.abs(rx) > 0.01 || Math.abs(ry) > 0.01) {
    // p5 sensor data available
    dx = constrain(ry, -3, 3);
    dy = constrain(rx, -3, 3);
    sourceUsed = "p5 rotation";
  } else if (haveDO && doBeta !== null && doGamma !== null) {
    // deviceorientation fallback
    const scaledY = (doGamma / 45) * 3; // left/right
    const scaledX = (doBeta  / 45) * 3; // front/back
    dx = constrain(scaledY, -3, 3);
    dy = constrain(scaledX, -3, 3);
    sourceUsed = "deviceorientation";
  } else if (haveDM && dmAx !== null && dmAy !== null) {
    // devicemotion fallback (gravity). Signs vary by orientation; tweak if inverted.
    const scaledY = (-dmAx / 3.0); // divide ~9.8 to get ~[-3..3], use smaller divisor for sensitivity
    const scaledX = ( dmAy / 3.0);
    dx = constrain(scaledY, -3, 3);
    dy = constrain(scaledX, -3, 3);
    sourceUsed = "devicemotion";
  } else {
    sourceUsed = "none";
  }

  // integrate physics
  vx += dx * accel; vy += dy * accel;
  vx *= damping; vy *= damping;
  cx += vx; cy += vy;

  // collisions
  const r = ballSize/2;
  let collided = false;
  const impact = Math.hypot(vx, vy);

  if (cx < r) { cx = r; if (vx < 0){ collided = true; vx = -vx * restitution; } }
  if (cx > width - r) { cx = width - r; if (vx > 0){ collided = true; vx = -vx * restitution; } }
  if (cy < r) { cy = r; if (vy < 0){ collided = true; vy = -vy * restitution; } }
  if (cy > height - r) { cy = height - r; if (vy > 0){ collided = true; vy = -vy * restitution; } }

  if (collided && millis() - lastEdgeAt > edgeCooldownMs) {
    const tmp = ballColor; ballColor = bgColor; bgColor = tmp;
    lastEdgeAt = millis();
    spawnVisuals(cx, cy, impact);
    playCollision(impact);
  }

  // ball
  noStroke(); fill(ballColor); ellipse(cx, cy, ballSize);

  // HUD (comment out if you don’t want it)
  drawHUD(rx, ry);
}

function windowResized(){ resizeCanvas(windowWidth, windowHeight); }