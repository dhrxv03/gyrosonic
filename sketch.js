let permissionGranted = false;
let cx, cy;
let btn, hint;
let ballColor, bgColor;
let ballSize = 80; // smaller ball

// debounce
let lastEdgeToggleAt = 0;
const edgeCooldownMs = 400; // minimum time between toggles

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

  // tilt movement
  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);
  cx += dx * 2;
  cy += dy * 2;

  // bounds (allow touching, but keep within canvas)
  const r = ballSize / 2;
  cx = constrain(cx, r, width - r);
  cy = constrain(cy, r, height - r);

  // edge detection (touching edge if center == r or width-r/height-r after constrain)
  const touchingEdge = (cx === r) || (cx === width - r) || (cy === r) || (cy === height - r);

  // debounce: only toggle if cooldown has passed
  if (touchingEdge && millis() - lastEdgeToggleAt > edgeCooldownMs) {
    // swap colors
    const tmp = ballColor;
    ballColor = bgColor;
    bgColor = tmp;

    lastEdgeToggleAt = millis();

    // nudge inward so we don't re-trigger due to tiny jitters
    const nudge = 2;
    if (cx === r) cx += nudge;
    if (cx === width - r) cx -= nudge;
    if (cy === r) cy += nudge;
    if (cy === height - r) cy -= nudge;
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
