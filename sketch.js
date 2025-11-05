// ====== STATE ======
let permissionGranted = false;
let cx, cy, vx = 0, vy = 0;
let ballColor, bgColor;
const ballSize = 80;

// physics
const accel = 0.15, damping = 0.985, restitution = 0.75;

// collision debounce
let lastEdgeAt = 0;
const edgeCooldownMs = 220;

// audio
let samples = [];      // p5.SoundFile[]
let audioReady = false;

// ui
let enableBtn, testBtn, statusEl;

// ====== UTIL ======
const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
const resumeAC = async () => {
  try {
    const ac = getAudioContext();
    if (ac && ac.state !== "running") await ac.resume();
  } catch (_) {}
};

// ====== P5 ======
function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;
  ballColor = color(0);
  bgColor = color(255);

  // Hook up UI (create if missing)
  enableBtn = document.getElementById("enableBtn");
  testBtn   = document.getElementById("testBtn");
  statusEl  = document.getElementById("status");

  if (!enableBtn) {
    enableBtn = document.createElement("button");
    enableBtn.id = "enableBtn";
    enableBtn.textContent = "Enable motion & sound";
    document.body.appendChild(enableBtn);
  }
  if (!testBtn) {
    testBtn = document.createElement("button");
    testBtn.id = "testBtn";
    testBtn.textContent = "Test sound";
    testBtn.disabled = true;
    document.body.appendChild(testBtn);
  }
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.id = "status";
    document.body.appendChild(statusEl);
  }

  enableBtn.addEventListener("click", onEnableClicked, { once: true });
  testBtn.addEventListener("click", onTestSound);
}

async function onEnableClicked() {
  // 1) Unlock audio context *inside user gesture*
  try {
    if (typeof userStartAudio === "function") await userStartAudio();
    await resumeAC();
    masterVolume(1.0);
  } catch (e) {
    setStatus("Could not start audio context. Tap again or check browser settings.");
  }

  // 2) Ask for motion/orientation (iOS 13+)
  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      await DeviceOrientationEvent.requestPermission().catch(()=>{});
    }
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      await DeviceMotionEvent.requestPermission().catch(()=>{});
    }
  } catch (e) {
    setStatus("Sensor permission denied. You can still test sound.");
  }

  // 3) Load samples A–N (CASE-SENSITIVE)
  setStatus("Loading sounds… (Make sure Silent mode is OFF)");
  const letters = "ABCDEFGHIJKLMN".split("");
  let loaded = 0;

  letters.forEach((L, i) => {
    loadSound(
      `assets/${L}.mp3`,
      (s) => {
        s.playMode("restart");
        s.setVolume(0.85);
        samples[i] = s;
        loaded++;
        if (loaded === letters.length) {
          audioReady = true;
          testBtn.disabled = false;
          setStatus("Sound ready. Tilt to bounce ✨");
        }
      },
      (err) => {
        // Non-fatal: at least some samples may load
        testBtn.disabled = false;
        setStatus(`Some sounds failed to load (${L}.mp3). Check path/case.`);
      }
    );
  });

  permissionGranted = true;
  enableBtn.disabled = true;
}

async function onTestSound() {
  await resumeAC();
  // Play first loaded sample, or any available
  const s = samples.find(sf => sf && sf.isLoaded());
  if (s) {
    s.rate(1.0);
    s.play();
    setStatus("Played test sound (if silent, turn off iPhone Silent switch).");
  } else {
    setStatus("No sample loaded yet. Check assets path/case or wait a moment.");
  }
}

function draw() {
  background(bgColor);

  if (!permissionGranted) {
    // subtle frame to indicate button area
    noFill(); stroke(0); rect(12, 12, 340, 70, 12);
    return;
  }

  // tilt
  const dx = constrain(rotationY || 0, -3, 3);
  const dy = constrain(rotationX || 0, -3, 3);

  // integrate
  vx += dx * accel;
  vy += dy * accel;
  vx *= damping; vy *= damping;
  cx += vx; cy += vy;

  const r = ballSize / 2;
  let collided = false;
  const impactSpeed = Math.hypot(vx, vy);

  // walls + bounce
  if (cx < r) { cx = r; if (vx < 0){ collided = true; vx = -vx * restitution; } }
  if (cx > width - r) { cx = width - r; if (vx > 0){ collided = true; vx = -vx * restitution; } }
  if (cy < r) { cy = r; if (vy < 0){ collided = true; vy = -vy * restitution; } }
  if (cy > height - r) { cy = height - r; if (vy > 0){ collided = true; vy = -vy * restitution; } }

  if (collided && millis() - lastEdgeAt > edgeCooldownMs) {
    // swap colors
    const tmp = ballColor; ballColor = bgColor; bgColor = tmp;
    lastEdgeAt = millis();
    // audio
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

// ====== AUDIO: velocity -> pitch ======
function playPitchedCollision(speed) {
  const s = random(samples.filter(sf => sf && sf.isLoaded()));
  if (!s) return;
  resumeAC();

  // map speed to rate
  const speedMin = 1.5, speedMax = 12.0;
  const rateMin = 0.75, rateMax = 1.6;
  const t = constrain((speed - speedMin) / (speedMax - speedMin), 0, 1);
  const rate = lerp(rateMin, rateMax, t);

  s.rate(rate);
  s.play();
}