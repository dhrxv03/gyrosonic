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
const edgeCooldownMs = 300;

// audio
let collisionSound = null;
let osc = null;     // fallback oscillator
let env = null;
let soundReady = false;

let enableBtn, testBtn, hintEl;

function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;

  ballColor = color(0);
  bgColor = color(255);

  enableBtn = document.getElementById("enableBtn");
  testBtn   = document.getElementById("testBtn");
  hintEl    = document.getElementById("hint");

  enableBtn.addEventListener("click", onEnableClicked, { once: true });
  testBtn.addEventListener("click", onTestSound);

  // prepare fallback oscillator (silent until triggered)
  osc = new p5.Oscillator("sine");
  env = new p5.Envelope();
  env.setADSR(0.005, 0.05, 0.0, 0.05);   // short blip
  env.setRange(0.4, 0.0);                // peak amp 0.4
  osc.freq(880);                         // A5 beep
  osc.start();
  osc.amp(0);
}

async function onEnableClicked() {
  // Unlock audio first
  try {
    if (typeof userStartAudio === "function") {
      await userStartAudio();
    }
    const ac = getAudioContext();
    if (ac && ac.state !== "running") {
      await ac.resume();
    }
    masterVolume(1.0);
  } catch (_) {}

  // Request motion/orientation permissions (iOS 13+)
  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      await DeviceOrientationEvent.requestPermission().catch(() => {});
    }
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      await DeviceMotionEvent.requestPermission().catch(() => {});
    }
  } catch (_) {}

  // Load the sound (CASE-SENSITIVE)
  try {
    loadSound(
      "assets/A.mp3",
      (s) => {
        collisionSound = s;
        collisionSound.playMode("restart");
        collisionSound.setVolume(0.9);
        soundReady = true;
        testBtn.disabled = false;
        if (hintEl) hintEl.textContent = "Sound loaded. Tap ‘Test sound’ or just tilt.";
      },
      () => {
        // load failed, keep fallback
        soundReady = false;
        testBtn.disabled = false; // allow test of fallback beep
        if (hintEl) hintEl.textContent = "Sound failed to load (check path). Fallback beep enabled.";
      }
    );
  } catch (_) {
    soundReady = false;
    testBtn.disabled = false;
  }

  permissionGranted = true;
  enableBtn.disabled = true;
}

async function onTestSound() {
  // Make sure context is running
  try {
    const ac = getAudioContext();
    if (ac && ac.state !== "running") await ac.resume();
  } catch (_) {}

  if (soundReady && collisionSound && collisionSound.isLoaded()) {
    collisionSound.play();
  } else {
    // fallback beep
    osc.amp(0); // reset
    env.play(osc);
  }
}

function draw() {
  background(bgColor);

  if (!permissionGranted) {
    noFill(); stroke(0); rect(16, 16, 320, 64, 12);
    return;
  }

  // tilt (p5 provides rotationX/rotationY after permission)
  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);

  // integrate physics
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

  if (collided && millis() - lastEdgeAt > edgeCooldownMs) {
    // swap colors
    const tmp = ballColor; ballColor = bgColor; bgColor = tmp;
    lastEdgeAt = millis();

    // ensure AudioContext is running (iOS can suspend randomly)
    try {
      const ac = getAudioContext();
      if (ac && ac.state !== "running") { ac.resume(); }
    } catch (_) {}

    // play sound or fallback beep
    if (soundReady && collisionSound && collisionSound.isLoaded()) {
      collisionSound.play();
    } else {
      osc.amp(0);
      env.play(osc);
    }
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}