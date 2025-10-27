let permissionGranted = false;
let cx, cy;
let btn, hint;
let ballColor, bgColor;
let ballSize = 80; // smaller ball

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
  cx = constrain(cx + dx * 2, 0, width);
  cy = constrain(cy + dy * 2, 0, height);

  // edge detection
  const hitEdge =
    cx - ballSize / 2 <= 0 ||
    cx + ballSize / 2 >= width ||
    cy - ballSize / 2 <= 0 ||
    cy + ballSize / 2 >= height;

  if (hitEdge) {
    // swap colors
    const temp = ballColor;
    ballColor = bgColor;
    bgColor = temp;
  }

  noStroke();
  fill(ballColor);
  ellipse(cx, cy, ballSize);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
