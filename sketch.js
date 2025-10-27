let permissionGranted = false;
let cx, cy;
let btn, hint;

function setup() {
  createCanvas(windowWidth, windowHeight);

  cx = width / 2;
  cy = height / 2;

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
    // Non-iOS or older browsers
    permissionGranted = true;
  }
}

async function requestAccess() {
  try {
    // Request both; some iOS builds gate data behind either.
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
  background(255);

  if (!permissionGranted) {
    // Draw a subtle cue under the button area
    noFill(); stroke(0); rect(16, 16, 240, 60, 12);
    return;
  }

  // p5 updates rotationX/Y after permissions granted
  const dx = constrain((rotationY || 0), -3, 3);
  const dy = constrain((rotationX || 0), -3, 3);

  cx = constrain(cx + dx * 2, 0, width);
  cy = constrain(cy + dy * 2, 0, height);

  noStroke(); fill(0);
  ellipse(cx, cy, 200, 200);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
