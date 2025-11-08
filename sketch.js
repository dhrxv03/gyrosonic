// ================== STATE & UI ==================
let permissionGranted = false;
let running = true;             // Stop/Resume

let cx, cy;
let vx = 0, vy = 0;             // velocity
let ballColor, bgColor;
let ballSize = 80;

// UI refs (wired in setup)
let panel, controls, btn, hint, stopBtn, resumeBtn;

// ================== PHYSICS =====================
const accel = 0.25;             // tilt -> accel
const damping = 0.985;          // friction
const restitution = 0.75;       // bounce energy

// debounce for color/sound
let lastEdgeToggleAt = 0;
const edgeCooldownMs = 400;

// ================== BACKGROUND PULSE ============
let pulse = 0;                  // 0..1
const pulseDecay = 0.90;        // lower = stronger/longer

// ================== AUDIO (Web Audio, no p5.sound) ===
let AC = null;
let masterGain = null;
let buffers = [];               // AudioBuffer[]
let audioReady = false;
const LETTERS = "ABCDEFGHIJKLMN".split("");

async function initAudioAndLoad() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state !== "running") { try { await AC.resume(); } catch(_) {} }
    if (!masterGain) {
      masterGain = AC.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(AC.destination);
    }
    const loads = LETTERS.map(async (L, i) => {
      try {
        const res = await fetch(`assets/${L}.mp3`, { cache: "force-cache" });
        if (!res.ok) throw new Error(`${L}.mp3 ${res.status}`);
        const ab = await res.arrayBuffer();
        const buf = await AC.decodeAudioData(ab);
        buffers[i] = buf;
      } catch (e) { console.warn("Sound load failed:", L, e); }
    });
    await Promise.all(loads);
    audioReady = buffers.some(Boolean);
  } catch (e) {
    console.warn("Audio init failed:", e);
  }
}

function playCollisionSound(speed) {
  if (!audioReady || !AC) return;
  if (AC.state !== "running") { AC.resume().catch(()=>{}); }

  const t = constrain((speed - 1.5) / (12.0 - 1.5), 0, 1);
  const rate = lerp(0.8, 1.6, t);  // harder hit -> higher pitch

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

// ================== VISUALS (Patatap-ish) ============
const animations = [];
const MAX_ANIMS = 160;

const palettes = [
  ["#00D1B2","#14FFEC","#00A6FB","#3C91E6","#1B2CC1"],
  ["#FF3366","#FFBD00","#6BF178","#2D7DD2","#F79824"],
  ["#B794F4","#8BD3E6","#FF90E8","#FDE24F","#00E8FC"],
  ["#FF7F50","#7FFFD4","#F9F871","#BFFCC6","#B28DFF"]
];
let paletteIdx = 0;
const randCol = () => color(random(palettes[paletteIdx]));

const easeOutQuad = (t)=>1-(1-t)*(1-t);
const easeOutExpo = (t)=> t===1 ? 1 : 1 - Math.pow(2,-10*t);

// --- Effects ---
class Ring {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.life=0; this.col=col;
    this.dur = 320 + impact*12;
    this.maxR= 36 + impact*6;
    this.w   = 2  + map(impact,0,12,1,4,true);
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    const k = easeOutExpo(t);
    noFill();
    stroke(red(this.col),green(this.col),blue(this.col), 255*(1-t));
    strokeWeight(this.w*(1-t));
    circle(this.x, this.y, this.maxR*2*k);
    this.life += deltaTime;
    return t < 1;
  }
}
class Confetti {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    this.vx = random(-2,2) * (1 + impact*0.08);
    this.vy = random(-3,-0.5) * (1 + impact*0.06);
    this.g  = 0.08;
    this.rot = random(TWO_PI);
    this.vr  = random(-0.2,0.2);
    this.size = random(4,10);
    this.dur = 500 + impact*20;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    this.vy += this.g;
    this.x  += this.vx;
    this.y  += this.vy;
    this.rot += this.vr;
    push();
    translate(this.x, this.y);
    rotate(this.rot);
    noStroke();
    fill(red(this.col),green(this.col),blue(this.col), 255*(1-t));
    rectMode(CENTER);
    rect(0,0,this.size,this.size*0.6,2);
    pop();
    this.life += deltaTime;
    return t < 1;
  }
}
class Rays {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    this.n = 8 + floor(random(6)) + floor(impact);
    this.len = 20 + impact*6;
    this.dur = 300 + impact*10;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    const k = easeOutQuad(t);
    stroke(red(this.col),green(this.col),blue(this.col), 200*(1-t));
    strokeWeight(2*(1-t));
    for (let i=0;i<this.n;i++){
      const a = (TWO_PI/this.n)*i + (1-k)*0.8;
      const r0 = 8, r1 = r0 + this.len*(1-k);
      line(this.x+cos(a)*r0, this.y+sin(a)*r0, this.x+cos(a)*r1, this.y+sin(a)*r1);
    }
    this.life += deltaTime;
    return t < 1;
  }
}
class Blob {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    this.rad = 12 + impact*4; this.jit = 6 + impact*0.8; this.pts = 16;
    this.dur = 380 + impact*15;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1), k = easeOutQuad(t);
    noStroke();
    fill(red(this.col),green(this.col),blue(this.col), 140*(1-t));
    beginShape();
    for (let i=0;i<this.pts;i++){
      const a = (TWO_PI/this.pts)*i;
      const r = this.rad*(1+k*0.6) + noise(i*0.2, t*3)*this.jit*(1-k);
      vertex(this.x + cos(a)*r, this.y + sin(a)*r);
    }
    endShape(CLOSE);
    this.life += deltaTime;
    return t < 1;
  }
}
// New effects
class Spark {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    const sp = 1.5 + impact*0.15;
    this.vx = random(-sp, sp); this.vy = random(-sp, sp);
    this.size = random(2,4) + impact*0.1;
    this.dur = 280 + impact*10;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    this.x += this.vx; this.y += this.vy;
    noStroke(); fill(red(this.col),green(this.col),blue(this.col), 240*(1-t));
    circle(this.x, this.y, this.size*(1-t*0.5));
    this.life += deltaTime; return t < 1;
  }
}
class TriBurst {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    const sp = 2 + impact*0.2;
    this.vx = random(-sp, sp); this.vy = random(-sp, sp);
    this.rot = random(TWO_PI); this.vr = random(-0.15,0.15);
    this.size= 8 + impact*0.8; this.dur = 420 + impact*18;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    this.x += this.vx; this.y += this.vy; this.rot += this.vr;
    push(); translate(this.x, this.y); rotate(this.rot);
    noStroke(); fill(red(this.col),green(this.col),blue(this.col), 230*(1-t));
    triangle(-this.size, this.size*0.6, this.size, this.size*0.6, 0, -this.size);
    pop(); this.life += deltaTime; return t < 1;
  }
}
class WaveRing {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    this.rings = 3 + floor(random(3));
    this.baseR = 14 + impact*2; this.spread = 16 + impact*2.5;
    this.dur = 420 + impact*20;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1), k = easeOutExpo(t);
    noFill(); const alpha = 220*(1-t);
    stroke(red(this.col),green(this.col),blue(this.col), alpha);
    strokeWeight(1.5*(1-t));
    for (let i=0;i<this.rings;i++){
      const rr = this.baseR + this.spread*i * k;
      circle(this.x, this.y, rr*2);
    }
    this.life += deltaTime; return t < 1;
  }
}
class Comet {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    const sp = 2.2 + impact*0.18; const a = random(TWO_PI);
    this.vx = cos(a)*sp; this.vy = sin(a)*sp;
    this.len = 18 + impact*1.6; this.dur = 500 + impact*22;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    this.x += this.vx; this.y += this.vy;
    stroke(red(this.col),green(this.col),blue(this.col), 240*(1-t));
    strokeWeight(2*(1-t));
    line(this.x, this.y, this.x - this.vx*this.len, this.y - this.vy*this.len);
    noStroke(); fill(red(this.col),green(this.col),blue(this.col), 240*(1-t));
    circle(this.x, this.y, 4 + (1-t)*3);
    this.life += deltaTime; return t < 1;
  }
}
class Starburst {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    this.spokes = 6 + floor(random(5)); this.len = 16 + impact*2.8;
    this.dur = 360 + impact*14;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1), k = easeOutQuad(t);
    stroke(red(this.col),green(this.col),blue(this.col), 230*(1-t));
    strokeWeight(2*(1-t));
    for (let i=0;i<this.spokes;i++){
      const a = (TWO_PI/this.spokes)*i, r = this.len*(1-k);
      line(this.x, this.y, this.x + cos(a)*r, this.y + sin(a)*r);
    }
    this.life += deltaTime; return t < 1;
  }
}
class Sweep {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    this.rad = 30 + impact*5; this.span = PI * (0.6 + random(0.8));
    this.rot = random(TWO_PI); this.dur = 420 + impact*16;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1), k = easeOutQuad(t);
    noFill();
    stroke(red(this.col),green(this.col),blue(this.col), 200*(1-t));
    strokeWeight(6*(1-t));
    arc(this.x, this.y, this.rad*2*(1+k), this.rad*2*(1+k),
        this.rot, this.rot + this.span*(1-k));
    this.life += deltaTime; return t < 1;
  }
}

function spawnVisuals(x,y,impact){
  const count = 3 + floor(map(impact,0,12,0,4,true));
  const choices = [Ring, Confetti, Rays, Blob, Spark, TriBurst, WaveRing, Comet, Starburst, Sweep];
  for (let i=0;i<count;i++){
    const col = randCol();
    const K = random(choices);
    animations.push(new K(x,y,impact,col));
  }
  if (random() < 0.2) paletteIdx = (paletteIdx + 1) % palettes.length;
  if (animations.length > MAX_ANIMS) animations.splice(0, animations.length - MAX_ANIMS);
}

// ================== BG PULSE ====================
function drawBackgroundPulse() {
  if (pulse <= 0.001) return;

  const ctx = drawingContext;
  const cxp = width / 2, cyp = height / 2;
  const maxR = Math.hypot(width, height);

  const inv = color(255 - red(bgColor), 255 - green(bgColor), 255 - blue(bgColor));
  const r = red(inv), g = green(inv), b = blue(inv);
  const a = 0.35 * pulse;

  const grad = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, maxR);
  grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  pulse *= pulseDecay;
}

// ================== FLICK IMPULSE (devicemotion) =====
let pendingImpulseX = 0;       // applied next frame
const FLICK_THRESH = 7.0;      // m/s^2 to count as flick
const FLICK_GAIN   = 0.35;     // strength of flick
const FLICK_COOLDOWN = 220;    // ms
let lastFlickAt = 0;
const FLICK_SIGN = 1;          // flip to -1 if inverted

// ================== SETUP & PERMISSIONS =========
function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2; cy = height / 2;
  ballColor = color(0); bgColor = color(255);

  // UI
  panel     = document.getElementById("panel");
  controls  = document.getElementById("controls");
  btn       = document.getElementById("btn");
  hint      = document.getElementById("hint");
  stopBtn   = document.getElementById("stop");
  resumeBtn = document.getElementById("resume");

  const needsPermission =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  if (needsPermission) {
    panel.hidden = false;                        // show centered enable card
    btn.addEventListener("click", requestAccess, { once: true });
  } else {
    permissionGranted = true;
    controls.hidden = false;
    wireControlButtons();
  }
}

async function requestAccess() {
  // Immediately hide button to avoid double taps; show a temporary hint
  if (btn) { btn.hidden = true; btn.disabled = true; }
  if (hint) { hint.hidden = false; hint.textContent = "Requesting permission… If nothing happens, try again."; }

  try {
    const o = (typeof DeviceOrientationEvent !== "undefined" &&
               typeof DeviceOrientationEvent.requestPermission === "function")
              ? await DeviceOrientationEvent.requestPermission()
              : "granted";

    let m = "denied";
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      m = await DeviceMotionEvent.requestPermission();
    } else {
      m = "granted"; // non-iOS
    }

    if (o === "granted" || m === "granted") {
      permissionGranted = true;
      await initAudioAndLoad();

      // Attach devicemotion for flicks (keep as you had)
      window.addEventListener('devicemotion', (e) => {
        if (!e || !e.accelerationIncludingGravity) return;
        const ax = e.accelerationIncludingGravity.x || 0;
        const now = Date.now();
        if (Math.abs(ax) > FLICK_THRESH && (now - lastFlickAt) > FLICK_COOLDOWN) {
          pendingImpulseX += FLICK_SIGN * ax * FLICK_GAIN;
          lastFlickAt = now;
        }
      }, true);

      // ✅ Clean up UI on success
      if (hint) { hint.textContent = ""; hint.hidden = true; }
      if (btn)  { btn.hidden = true; }
      if (panel){ panel.hidden = true; panel.style.display = "none"; } // belt & suspenders
      if (controls) { controls.hidden = false; }
      wireControlButtons();
      return;
    }

    // fallthrough to finally if not granted
  } catch (_) {
    // ignore
  } finally {
    if (!permissionGranted) {
      // Show retry UI
      if (btn)  { btn.hidden = false; btn.disabled = false; }
      if (hint) { hint.hidden = false; hint.textContent = "Permission was not granted. Tap the button again."; }
      if (panel){ panel.hidden = false; panel.style.display = ""; }
    }
  }
}

function wireControlButtons() {
  if (!stopBtn || !resumeBtn) return;

  stopBtn.onclick = async () => {
    running = false;
    stopBtn.hidden = true;
    resumeBtn.hidden = false;
    try { if (AC && AC.state === "running") await AC.suspend(); } catch(_) {}
  };

  resumeBtn.onclick = async () => {
    running = true;
    resumeBtn.hidden = true;
    stopBtn.hidden = false;
    try { if (AC && AC.state !== "running") await AC.resume(); } catch(_) {}
  };

  // initial:
  stopBtn.hidden = !permissionGranted ? true : false;
  resumeBtn.hidden = true;
}

// ================== DRAW LOOP ===================
function draw() {
  background(bgColor);
  drawBackgroundPulse();

  // draw & prune animations (kept animating even if paused)
  for (let i=animations.length-1;i>=0;i--){
    if (!animations[i].draw()) animations.splice(i,1);
  }

  if (!permissionGranted) {
  background(0); // 👈 keep black before enabling
  return;
}

  // if paused: render ball only (no physics)
  if (!running) {
    noStroke(); fill(ballColor); ellipse(cx, cy, ballSize);
    return;
  }

  // tilt-driven acceleration
  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);

  vx += dx * accel;
  vy += dy * accel;

  // apply flick impulse captured from devicemotion
  if (pendingImpulseX !== 0) {
    vx += pendingImpulseX;
    pendingImpulseX = 0;
  }

  // damping & integrate
  vx *= damping; vy *= damping;
  cx += vx;      cy += vy;

  const r = ballSize / 2;
  let collided = false;

  if (cx < r) { cx = r; if (vx < 0) { vx = -vx * restitution; collided = true; } }
  if (cx > width - r) { cx = width - r; if (vx > 0) { vx = -vx * restitution; collided = true; } }
  if (cy < r) { cy = r; if (vy < 0) { vy = -vy * restitution; collided = true; } }
  if (cy > height - r) { cy = height - r; if (vy > 0) { vy = -vy * restitution; collided = true; } }

  if (collided && millis() - lastEdgeToggleAt > edgeCooldownMs) {
    lastEdgeToggleAt = millis();

    const impact = Math.hypot(vx, vy);

    // occasionally switch palette
    if (random() < 0.25) paletteIdx = (paletteIdx + 1) % palettes.length;

    // choose two different random colors from current palette
    const palette = palettes[paletteIdx];
    let newBall = color(random(palette));
    let newBg   = color(random(palette));
    while (
      red(newBall) === red(newBg) &&
      green(newBall) === green(newBg) &&
      blue(newBall) === blue(newBg)
    ) { newBg = color(random(palette)); }
    ballColor = newBall;
    bgColor   = newBg;

    // pulse bump
    pulse = min(1, pulse + map(impact, 0, 12, 0.25, 0.8, true));

    playCollisionSound(impact);
    spawnVisuals(cx, cy, impact);
  }

  noStroke(); fill(ballColor); ellipse(cx, cy, ballSize);
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }