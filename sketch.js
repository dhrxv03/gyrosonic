let permissionGranted = false;
let cx, cy;
let vx = 0, vy = 0;      
let btn, hint;
let ballColor, bgColor;
let ballSize = 80;

const accel = 0.15;      // how much tilt adds to velocity
const damping = 0.9;   // friction each frame
const restitution = 0.75;   // bounce energy

// debounce for color swap
let lastEdgeToggleAt = 0;
const edgeCooldownMs = 400;

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
    if (o === "granted" || m === "granted") {
      permissionGranted = true;
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

  if (!permissionGranted) {
    noFill(); stroke(0); rect(16, 16, 240, 60, 12);
    return;
  }

  // Ball and device tilt mostion physics
  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);

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

  // Swap colors on edge collision 
  if (collided && millis() - lastEdgeToggleAt > edgeCooldownMs) {
    const tmp = ballColor;
    ballColor = bgColor;
    bgColor = tmp;
    lastEdgeToggleAt = millis();
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
