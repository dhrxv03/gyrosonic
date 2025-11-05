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

// audio
let samples = [];          // holds loaded p5.SoundFile objects (A–N)
let audioReady = false;

let enableBtn, hintEl;

function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;

  ballColor = color(0);
  bgColor = color(255);

  enableBtn = document.getElementById("enableBtn") || document.getElementById("btn");
  hintEl    = document.getElementById("hint");

  // Fallback: if your page uses the older "btn" id
  if (enableBtn) enableBtn.addEventListener("click", onEnableClicked, { once: true });
}

async function onEnableClicked() {
  // Unlock audio (must be in a user gesture)
  try {
    if (typeof userStartAudio === "function") await userStartAudio();
    const ac = getAudioContext();
    if (ac && ac.state !== "running") await ac.resume();
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

  // Load samples A–N (CASE-SENSITIVE)
  const letters = "ABCDEFGHIJKLMN".split("");
  let loadedCount = 0;

  letters.forEach((L, i) => {
    loadSound(
      `assets/${L}.mp3`,
      (s) => {
        s.playMode("restart");
        s.setVolume(0.85);   // base volume (we'll adjust pitch via rate)
        samples[i] = s;
        loadedCount++;
        if (loadedCount === letters.length) {
          audioReady = true;
          if (hintEl) hintEl.textContent = "Sound ready. Tilt to bounce (turn off Silent mode).";
        }
      },
      () => {
        // ignore one-off failures; still usable if others load
      }
    );
  });

  permissionGranted = true;
  if (enableBtn) enableBtn.hidden = true;
  if (hintEl && !audioReady) {
    hintEl.textContent = "Loading sounds… If you hear nothing, turn off Silent mode & raise volume.";
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
  let impactSpeed = Math.hypot(vx, vy); // speed BEFORE bounce change

  // walls + bounce
  if (cx < r) {
    cx = r;
    if (vx < 0) { collided = true; vx = -vx * restitution; }
  }
  if (cx > width - r) {
    cx = width - r;
    if (vx > 0) { collided = true; vx = -vx * restitution; }
  }
  if (cy < r) {
    cy = r;
    if (vy < 0) { collided = true; vy = -vy * restitution; }
  }
  if (cy > height - r) {
    cy = height - r;
    if (vy > 0) { collided = true; vy = -vy * restitution; }
  }

  if (collided && millis() - lastEdgeAt > edgeCooldownMs) {
    // swap colors
    const tmp = ballColor; ballColor = bgColor; bgColor = tmp;
    lastEdgeAt = millis();

    // play pitched sound based on impact speed
    playPitchedCollision(impactSpeed);
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/**
 * Map a collision speed to a playback rate and play a random sample.
 * - You can tweak speedRangeMin/Max and rateMin/Max to taste.
 */
function playPitchedCollision(speed) {
  if (!audioReady || samples.length === 0) return;

  // Typical speeds given accel/damping are ~0..15; tune these after testing
  const speedRangeMin = 1.5;   // very soft tap
  const speedRangeMax = 12.0;  // very hard hit

  // Pitch range: 0.75 = lower, 1.0 = normal, 1.6 = higher
  const rateMin = 0.75;
  const rateMax = 1.6;

  // Map speed -> rate with clamping
  const t = constrain((speed - speedRangeMin) / (speedRangeMax - speedRangeMin), 0, 1);
  const rate = lerp(rateMin, rateMax, t);

  // Random sample for timbral variety
  const s = random(samples);
  if (s && s.isLoaded()) {
    try {
      const ac = getAudioContext();
      if (ac && ac.state !== "running") ac.resume();
    } catch (_) {}

    s.rate(rate);
    s.play(); // restart mode avoids overlap build-up
  }
}