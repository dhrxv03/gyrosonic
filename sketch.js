// --- state ---
let permissionGranted = false;
let cx, cy;
let vx = 0, vy = 0;
let btn, hint;

let ballColor, bgColor;
const ballSize = 80;

// physics tuning
const accel = 0.15;       // tilt -> acceleration
const damping = 0.985;    // friction
const restitution = 0.75; // bounce energy (0.6–0.9 feels good)

// color/hit debounce
let lastEdgeToggleAt = 0;
const edgeCooldownMs = 400;

// audio
let collisionSound = null;

function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;

  ballColor = color(0);
  bgColor = color(255);

  btn = document.getElementById("btn");
  hint = document.getElementById("hint");

  // Always use a user gesture to init (helps both iOS and desktop for audio)
  btn.addEventListener("click", requestAccess, { once: true });
}

async function requestAccess() {
  // 1) Ask for sensor permissions on iOS 13+ (if available)
  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      await DeviceOrientationEvent.requestPermission().catch(() => {});
    }
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      await DeviceMotionEvent.requestPermission().catch(() => {});
    }
  } catch (_) {
    // ignore permission errors; proceed best-effort
  }

  // 2) Unlock WebAudio, then load sound asynchronously
  try {
    if (typeof userStartAudio === "function") {
      await userStartAudio(); // required on iOS before creating/playing audio
    }
    loadSound(
      "assets/a.mp3",
      (s) => {
        collisionSound = s;
        // ensure quick replays per edge-hit
        collisionSound.playMode("restart");
        collisionSound.setVolume(0.7);
      },
      () => {
        // load failed; continue without sound
        collisionSound = null;
      }
    );
  } catch (_) {
    // continue without sound
    collisionSound = null;
  }

  // 3) Ready to run
  permissionGranted = true;
  if (btn) btn.hidden = true;
  if (hint) hint.hidden = true;
}

function draw() {
  background(bgColor);

  if (!permissionGranted) {
    // little visual around the button area
    noFill(); stroke(0); rect(16, 16, 260, 64, 12);
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

  // wall collisions with bounce
  const r = ballSize / 2;
  let collided = false;

  if (cx < r) { cx = r; if (vx < 0) { vx = -vx * restitution; collided = true; } }
  if (cx > width - r) { cx = width - r; if (vx > 0) { vx = -vx * restitution; collided = true; } }
  if (cy < r) { cy = r; if (vy < 0) { vy = -vy * restitution; collided = true; } }
  if (cy > height - r) { cy = height - r; if (vy > 0) { vy = -vy * restitution; collided = true; } }

  // on edge hit: swap colors + play sound (debounced)
  if (collided && millis() - lastEdgeToggleAt > edgeCooldownMs) {
    const tmp = ballColor; ballColor = bgColor; bgColor = tmp;
    lastEdgeToggleAt = millis();

    if (collisionSound && collisionSound.isLoaded()) {
      collisionSound.play();
    }
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}