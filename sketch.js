let permissionGranted = false;
let cx, cy;
let vx = 0, vy = 0;      // velocity
let btn, hint;
let ballColor, bgColor;
let ballSize = 80;

// physics params (tweak to taste)
const accel = 0.15;      // how much tilt adds to velocity
const damping = 0.985;   // friction each frame
const restitution = 0.75;// bounce energy: 1 = full, <1 = loses energy

// debounce for color swap / sound
let lastEdgeToggleAt = 0;
const edgeCooldownMs = 400;

// ---------- Web Audio (no p5.sound) ----------
let AC = null;                 // AudioContext
let masterGain = null;
let buffers = [];              // decoded AudioBuffer[]
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

    // Load A..N once (user gesture context)
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

  // map speed -> playbackRate (velocity-based pitch)
  const t = constrain((speed - 1.5) / (12.0 - 1.5), 0, 1);
  const rate = lerp(0.8, 1.6, t);

  const loaded = buffers.filter(Boolean);
  if (!loaded.length) return;
  const buf = random(loaded);

  const src = AC.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;

  const g = AC.createGain();
  g.gain.value = lerp(0.5, 1.0, t); // optional: louder on harder hits
  src.connect(g).connect(masterGain);

  try { src.start(); } catch(_) {}
}

// ---------- Patatap-style animations ----------
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

// Easing helpers
const easeOutQuad = (t)=>1-(1-t)*(1-t);
const easeOutExpo = (t)=> t===1 ? 1 : 1 - Math.pow(2,-10*t);

// RING
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

// CONFETTI
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

// RAYS
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
      const r0 = 8;
      const r1 = r0 + this.len*(1-k);
      line(this.x+cos(a)*r0, this.y+sin(a)*r0,
           this.x+cos(a)*r1, this.y+sin(a)*r1);
    }
    this.life += deltaTime;
    return t < 1;
  }
}

// BLOB
class Blob {
  constructor(x,y,impact,col){
    this.x=x; this.y=y; this.col=col; this.life=0;
    this.rad = 12 + impact*4;
    this.jit = 6  + impact*0.8;
    this.pts = 16;
    this.dur = 380 + impact*15;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    const k = easeOutQuad(t);
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

function spawnVisuals(x,y,impact){
  // choose 2–6 effects depending on impact
  const count = 2 + floor(map(impact,0,12,0,4,true));
  for (let i=0;i<count;i++){
    const col = randCol();
    const K = random([Ring, Confetti, Rays, Blob]);
    animations.push(new K(x,y,impact,col));
  }
  // rotate palette sometimes
  if (random() < 0.2) paletteIdx = (paletteIdx + 1) % palettes.length;
  // cap to avoid overload on mobile
  if (animations.length > MAX_ANIMS) animations.splice(0, animations.length - MAX_ANIMS);
}

// -----------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;
  ballColor = color(0);
  bgColor = color(255);

  btn = document.getElementById("btn");
  hint = document.getElementById("hint");

  const needsPermission =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  if (needsPermission) {
    btn.hidden = false;
    hint.hidden = false;
    btn.addEventListener("click", requestAccess, { once: true });
  } else {
    permissionGranted = true;
    // (Audio stays off until user interacts; we keep your simple flow.)
  }
}

async function requestAccess() {
  try {
    const o = await DeviceOrientationEvent.requestPermission();
    let m = "denied";
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      m = await DeviceMotionEvent.requestPermission();
    }
    if (o === "granted" || m === "granted") {
      permissionGranted = true;
      // init audio & load samples **inside user gesture**
      await initAudioAndLoad();
    }
  } catch (e) {
    // console.error(e);
  } finally {
    btn.hidden = true;
    hint.hidden = true;
  }
}

function draw() {
  background(bgColor);

  // draw and prune animations
  for (let i=animations.length-1;i>=0;i--){
    if (!animations[i].draw()) animations.splice(i,1);
  }

  if (!permissionGranted) {
    noFill(); stroke(0); rect(16, 16, 240, 60, 12);
    return;
  }

  // Use tilt to accelerate the ball
  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);

  // integrate motion
  vx += dx * accel;
  vy += dy * accel;
  vx *= damping;
  vy *= damping;
  cx += vx;
  cy += vy;

  const r = ballSize / 2;
  let collided = false;

  if (cx < r) { cx = r; if (vx < 0) { vx = -vx * restitution; collided = true; } }
  if (cx > width - r) { cx = width - r; if (vx > 0) { vx = -vx * restitution; collided = true; } }
  if (cy < r) { cy = r; if (vy < 0) { vy = -vy * restitution; collided = true; } }
  if (cy > height - r) { cy = height - r; if (vy > 0) { vy = -vy * restitution; collided = true; } }

  if (collided && millis() - lastEdgeToggleAt > edgeCooldownMs) {
    // swap colors
    const tmp = ballColor; ballColor = bgColor; bgColor = tmp;
    lastEdgeToggleAt = millis();

    const impact = Math.hypot(vx, vy);
    playCollisionSound(impact);
    spawnVisuals(cx, cy, impact);
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}