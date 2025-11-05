// --- state ---
let permissionGranted = false;
let cx, cy;
let vx = 0, vy = 0;

let ballColor, bgColor;
const ballSize = 80;

// physics tuning
const accel = 0.15;
const damping = 0.985;
const restitution = 0.75;

// debounce for collision color/sound
let lastEdgeAt = 0;
const edgeCooldownMs = 220;

// audio (A–N)
let samples = [];
let audioReady = false;

// ui
let enableBtn, hintEl;

// -------- PATATAP-STYLE VISUALS --------
const animations = [];
const palettes = [
  ["#00D1B2","#14FFEC","#00A6FB","#3C91E6","#1B2CC1"],
  ["#FF3366","#FFBD00","#6BF178","#2D7DD2","#F79824"],
  ["#B794F4","#8BD3E6","#FF90E8","#FDE24F","#00E8FC"],
  ["#FF7F50","#7FFFD4","#F9F871","#BFFCC6","#B28DFF"]
];
let paletteIdx = 0;

// base class-like helpers
function spawnVisuals(x, y, impact) {
  const howMany = 2 + floor(map(impact, 0, 12, 0, 5, true)); // more energy -> more effects
  for (let i = 0; i < howMany; i++) {
    const pick = random([Ring, Confetti, Rays, Blob]);
    animations.push(new pick(x, y, impact, randomPaletteColor()));
  }
  // cycle palette occasionally
  if (random() < 0.2) paletteIdx = (paletteIdx + 1) % palettes.length;
}

function randomPaletteColor() {
  return color(random(palettes[paletteIdx]));
}

// Easing
function easeOutQuad(t){ return 1 - (1 - t) * (1 - t); }
function easeOutExpo(t){ return t === 1 ? 1 : 1 - pow(2, -10 * t); }

// VISUAL 1: expanding ring
class Ring {
  constructor(x, y, energy, col){
    this.x = x; this.y = y;
    this.life = 0; this.dur = 350 + energy*15; // ms
    this.maxR = 40 + energy*8;
    this.col = col;
    this.w = 2 + map(energy, 0, 12, 1, 5, true);
  }
  draw() {
    const t = constrain(this.life/this.dur, 0, 1);
    const k = easeOutExpo(t);
    noFill();
    stroke(red(this.col), green(this.col), blue(this.col), 255*(1-t));
    strokeWeight(this.w*(1-t));
    circle(this.x, this.y, this.maxR*2*k);
    this.life += deltaTime;
    return t < 1;
  }
}

// VISUAL 2: confetti particles
class Confetti {
  constructor(x,y,energy,col){
    this.x = x; this.y = y;
    this.vx = random(-2,2) * (1 + energy*0.08);
    this.vy = random(-3,-0.5) * (1 + energy*0.06);
    this.g = 0.08;
    this.rot = random(TWO_PI);
    this.vr = random(-0.2,0.2);
    this.size = random(4,10);
    this.life=0; this.dur = 500 + energy*20;
    this.col = col;
  }
  draw(){
    const t = constrain(this.life/this.dur, 0, 1);
    this.vy += this.g;
    this.x += this.vx;
    this.y += this.vy;
    this.rot += this.vr;
    push();
    translate(this.x, this.y);
    rotate(this.rot);
    noStroke();
    fill(red(this.col), green(this.col), blue(this.col), 255*(1-t));
    rectMode(CENTER);
    rect(0,0,this.size, this.size*0.6, 2);
    pop();
    this.life += deltaTime;
    return t < 1;
  }
}

// VISUAL 3: radial rays
class Rays {
  constructor(x,y,energy,col){
    this.x=x; this.y=y;
    this.n = 8 + floor(random(6)) + floor(energy); // rays count
    this.len = 20 + energy*6;
    this.life=0; this.dur=300 + energy*10;
    this.col=col;
  }
  draw(){
    const t = constrain(this.life/this.dur,0,1);
    const k = easeOutQuad(t);
    stroke(red(this.col), green(this.col), blue(this.col), 200*(1-t));
    strokeWeight(2*(1-t));
    for(let i=0;i<this.n;i++){
      const a = (TWO_PI/this.n)*i + (1-k)*0.8; // slight rotation
      const r0 = 8;
      const r1 = r0 + this.len*(1-k);
      line(this.x + cos(a)*r0, this.y + sin(a)*r0,
           this.x + cos(a)*r1, this.y + sin(a)*r1);
    }
    this.life += deltaTime;
    return t < 1;
  }
}

// VISUAL 4: blobby pulse
class Blob {
  constructor(x,y,energy,col){
    this.x=x; this.y=y;
    this.rad = 12 + energy*4;
    this.jit = 6 + energy*0.8;
    this.pts = 16;
    this.life=0; this.dur=380 + energy*15;
    this.col=col;
  }
  draw(){
    const t = constrain(this.life/this.dur,0,1);
    const k = easeOutQuad(t);
    noStroke();
    fill(red(this.col), green(this.col), blue(this.col), 140*(1-t));
    beginShape();
    for(let i=0;i<this.pts;i++){
      const a = (TWO_PI/this.pts)*i;
      const r = this.rad*(1+k*0.6) + noise(i*0.2, t*3)*this.jit*(1-k);
      vertex(this.x + cos(a)*r, this.y + sin(a)*r);
    }
    endShape(CLOSE);
    this.life += deltaTime;
    return t < 1;
  }
}

// -------- END VISUALS --------

function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;

  ballColor = color(0);
  bgColor = color(255);

  enableBtn = document.getElementById("enableBtn") || document.getElementById("btn");
  hintEl    = document.getElementById("hint");
  if (enableBtn) enableBtn.addEventListener("click", onEnableClicked, { once: true });
}

async function onEnableClicked() {
  try {
    if (typeof userStartAudio === "function") await userStartAudio();
    const ac = getAudioContext();
    if (ac && ac.state !== "running") await ac.resume();
    masterVolume(1.0);
  } catch(_) {}

  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      await DeviceOrientationEvent.requestPermission().catch(() => {});
    }
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      await DeviceMotionEvent.requestPermission().catch(() => {});
    }
  } catch(_) {}

  // load A–N
  const letters = "ABCDEFGHIJKLMN".split("");
  let loaded = 0;
  letters.forEach((L, i) => {
    loadSound(
      `assets/${L}.mp3`,
      (s) => {
        s.playMode("restart");
        s.setVolume(0.85);
        samples[i] = s;
        if (++loaded === letters.length) {
          audioReady = true;
          if (hintEl) hintEl.textContent = "Sound ready. Tilt to bounce (turn off Silent mode).";
        }
      },
      () => {}
    );
  });

  permissionGranted = true;
  if (enableBtn) enableBtn.hidden = true;
  if (hintEl && !audioReady) {
    hintEl.textContent = "Loading sounds… If silent, turn off Silent mode & raise volume.";
  }
}

function draw() {
  background(bgColor);

  // draw + prune animations
  for (let i = animations.length - 1; i >= 0; i--) {
    if (!animations[i].draw()) animations.splice(i, 1);
  }

  if (!permissionGranted) {
    noFill(); stroke(0); rect(16, 16, 320, 64, 12);
    return;
  }

  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);

  vx += dx * accel;
  vy += dy * accel;
  vx *= damping;
  vy *= damping;

  cx += vx;
  cy += vy;

  const r = ballSize / 2;
  let collided = false;
  const impactSpeed = Math.hypot(vx, vy);

  if (cx < r) { cx = r; if (vx < 0) { collided = true; vx = -vx * restitution; } }
  if (cx > width - r) { cx = width - r; if (vx > 0) { collided = true; vx = -vx * restitution; } }
  if (cy < r) { cy = r; if (vy < 0) { collided = true; vy = -vy * restitution; } }
  if (cy > height - r) { cy = height - r; if (vy > 0) { collided = true; vy = -vy * restitution; } }

  if (collided && millis() - lastEdgeAt > edgeCooldownMs) {
    // swap colors
    const tmp = ballColor; ballColor = bgColor; bgColor = tmp;
    lastEdgeAt = millis();

    // visuals
    spawnVisuals(cx, cy, impactSpeed);

    // audio with velocity-based pitch
    playPitchedCollision(impactSpeed);
  }

  // ball
  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// Velocity -> playback rate + random sample
function playPitchedCollision(speed) {
  if (!audioReady || samples.length === 0) return;

  const speedMin = 1.5;
  const speedMax = 12.0;
  const rateMin = 0.75;
  const rateMax = 1.6;

  const t = constrain((speed - speedMin) / (speedMax - speedMin), 0, 1);
  const rate = lerp(rateMin, rateMax, t);

  const s = random(samples);
  if (s && s.isLoaded()) {
    try {
      const ac = getAudioContext();
      if (ac && ac.state !== "running") ac.resume();
    } catch(_) {}

    s.rate(rate);
    s.play();
  }
}