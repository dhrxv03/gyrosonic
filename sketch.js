let permissionGranted = false;
let cx, cy;
let vx = 0, vy = 0;          // velocity
let btn, hint;
let ballColor, bgColor;
let ballSize = 80;

// physics
const accel = 0.15;
const damping = 0.985;
const restitution = 0.75;

// debounce for color/haptic on edge hits
let lastEdgeToggleAt = 0;
const edgeCooldownMs = 400;

let collisionSound;

function preload() {
  collisionSound = loadSound('assets/a.mp3');
}

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
  }
}

async function requestAccess() {
  try {
    const o = await DeviceOrientationEvent.requestPermission();
    let m = "granted";
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      m = await DeviceMotionEvent.requestPermission();
    }
    if (o === "granted" || m === "granted") permissionGranted = true;

    // unlock/resume WebAudio on the user gesture so collisionSound.play() works on iOS
    try {
      if (typeof userStartAudio === "function") {
        await userStartAudio();
      } else if (typeof getAudioContext === "function" && getAudioContext().state === "suspended") {
        await getAudioContext().resume();
      }
    } catch (e) {
      // ignore audio resume failures
    }
  } finally {
    btn.hidden = true;
    hint.hidden = true;
  }
}

function draw() {
  background(bgColor);

  if (!permissionGranted) {
    noFill(); stroke(0); rect(16, 16, 240, 60, 12);
    return;
  }

  // tilt → acceleration
  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);
  vx += dx * accel;
  vy += dy * accel;

  // damping
  vx *= damping;
  vy *= damping;

  // integrate
  cx += vx;
  cy += vy;

  const r = ballSize / 2;
  let collided = false;

  // walls + bounce
  if (cx < r) { cx = r; if (vx < 0) { vx = -vx * restitution; collided = true; } }
  if (cx > width - r) { cx = width - r; if (vx > 0) { vx = -vx * restitution; collided = true; } }
  if (cy < r) { cy = r; if (vy < 0) { vy = -vy * restitution; collided = true; } }
  if (cy > height - r) { cy = height - r; if (vy > 0) { vy = -vy * restitution; collided = true; } }

  if (collided && millis() - lastEdgeToggleAt > edgeCooldownMs) {
    // swap colors
    const tmp = ballColor;
    ballColor = bgColor;
    bgColor = tmp;

    // play collision sound
    if (collisionSound && !collisionSound.isPlaying()) {
      collisionSound.play();
    }

    lastEdgeToggleAt = millis();
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}