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

// ---------- Minimal Patatap-style rings ----------
const rings = [];
class Ring {
  constructor(x,y,impact,col){
    this.x=x; this.y=y;
    this.life=0;
    this.dur = 320 + impact*12;          // ms
    this.maxR= 36 + impact*6;
    this.w   = 2  + map(impact,0,12,1,4,true);
    this.col = col;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    const k = t === 1 ? 1 : 1 - Math.pow(2, -10*t); // easeOutExpo
    noFill();
    stroke(red(this.col), green(this.col), blue(this.col), 255*(1-t));
    strokeWeight(this.w*(1-t));
    circle(this.x, this.y, this.maxR*2*k);
    this.life += deltaTime;
    return t < 1;
  }
}
function spawnRings(x,y,impact){
  const n = 2 + floor(map(impact,0,12,0,3,true));
  for (let i=0;i<n;i++){
    rings.push(new Ring(x,y,impact, color(0,0,0)));
  }
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
    // No explicit button click → still allow audio init on first interaction?
    // (We leave audio off in this path to avoid policy conflicts.)
  }
}

async function requestAccess() {
  try {
    // Request motion/orientation first
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
      // SAFARI SAFE: init audio & load samples **inside user gesture**
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

  // draw and prune rings
  for (let i=rings.length-1;i>=0;i--){
    if (!rings[i].draw()) rings.splice(i,1);
  }

  if (!permissionGranted) {
    noFill(); stroke(0); rect(16, 16, 240, 60, 12);
    return;
  }

  // Use tilt to accelerate the ball; small deadzone for steadiness
  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);

  // add acceleration from tilt
  vx += dx * accel;
  vy += dy * accel;

  // apply damping/friction
  vx *= damping;
  vy *= damping;

  // update position
  cx += vx;
  cy += vy;

  const r = ballSize / 2;
  let collided = false;

  // left edge
  if (cx < r) {
    cx = r;
    if (vx < 0) { vx = -vx * restitution; collided = true; }
  }
  // right edge
  if (cx > width - r) {
    cx = width - r;
    if (vx > 0) { vx = -vx * restitution; collided = true; }
  }
  // top edge
  if (cy < r) {
    cy = r;
    if (vy < 0) { vy = -vy * restitution; collided = true; }
  }
  // bottom edge
  if (cy > height - r) {
    cy = height - r;
    if (vy > 0) { vy = -vy * restitution; collided = true; }
  }

  // swap colors + play sound + spawn rings once per collision burst
  if (collided && millis() - lastEdgeToggleAt > edgeCooldownMs) {
    const tmp = ballColor;
    ballColor = bgColor;
    bgColor = tmp;
    lastEdgeToggleAt = millis();

    const impact = Math.hypot(vx, vy);
    playCollisionSound(impact);
    spawnRings(cx, cy, impact);
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}