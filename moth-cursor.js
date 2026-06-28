/* ============================================================================
   Moth cursor — a living Death's-head moth that replaces the pointer.

   GEOMETRY is reconstructed from the deconstructed artwork pieces, fitted to
   moth/Image.png (the "ideal" pose) at ~94% pixel similarity. The 7 pieces are
   placed in their canonical 675x565 frame; each wing/antenna pivots about the
   point where it meets the body.

   MOTION is grounded in flight physics & insect biology, modelled on
   moth/Moth.mp4:
     • The skull is a point MASS on a damped spring anchored to the real pointer
       — so it carries momentum, feels drag, and settles with a soft, slightly
       underdamped overshoot when you stop (deceleration of a real flyer).
     • A moth beats its wings harder to generate THRUST when it must accelerate
       or catch up — so wingbeat frequency & amplitude track how hard it is
       working (how far it lags its target), not merely how fast it goes. Chasing
       a flung cursor = a furious blur; caught up and gliding = slow respiration.
     • The wingbeat itself reads as horizontal FORESHORTENING (scaleX) about each
       wing's hinge plus a small rotation — the geometry of a wing rotating up
       toward the viewer.
     • It BANKS into turns: rolls toward the centripetal side of a turn (lateral
       acceleration) and leans into horizontal travel, the way flying animals do.
     • Antennae and the trailing wing LAG under inertia; nothing is ever perfectly
       periodic. Attenborough x Nat Geo x a little computer magic.
   ============================================================================ */
(function () {
  "use strict";

  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduced) return;

  // ---- Canonical layout (the 675x565 artwork frame) ----------------------
  // key, file, left, top, width, height, transform-origin (body hinge), z.
  var BASE = "/moth/Deconstructed/";
  var PARTS = [
    ["body", "body.png",     210, 149, 234, 361, "50% 25%", 1],
    ["wll",  "wing2.png",     67, 266, 222, 127, "99% 24%", 2], // lower-left
    ["wul",  "wing1.png",     29,  58, 252, 232, "99% 91%", 3], // upper-left
    ["wlr",  "wing4.png",    369, 283, 219, 122, "1% 12%",  4], // lower-right
    ["wur",  "wing3.png",    384,  81, 259, 219, "2% 87%",  5], // upper-right
    ["antl", "antenna2.png", 216, 150, 108,  80, "96% 95%", 6], // left antenna
    ["antr", "antenna1.png", 341, 157, 113,  73, "4% 95%",  7]  // right antenna
  ];
  var SKULL_X = 327, SKULL_Y = 250;   // pointer hotspot, canvas space
  var SCALE = 0.17;                   // ~115px wide cursor

  // ---- Flight model tunables ---------------------------------------------
  // Spring-damper to the pointer. wn = natural frequency (rad/s), zeta = damping
  // ratio (<1 => a little overshoot, the soft settle of a decelerating flyer).
  var WN = 26, ZETA = 0.82;
  var K = WN * WN, C = 2 * ZETA * WN;

  var ERR_REF = 190;        // px of lag that reads as "working hard"
  var SPEED_REF = 1500;     // px/s that reads as fast cruising
  var EXERT_RISE = 0.045;   // effort spins up fast...
  var EXERT_FALL = 0.5;     // ...and winds down slowly
  var EXERT_FLOOR = 0.06;   // resting respiration — never fully still

  var IDLE_HZ = 1.05, FAST_HZ = 9.5;          // wingbeat frequency, Hz
  var WING_COMPRESS = [0.07, 0.44];           // scaleX dip, rest -> full thrust
  var WING_ROT = [1.5, 13.0];                 // deg about hinge
  var ANT_SWAY = [2.2, 4.5];                  // deg of feeler sway
  var BODY_BOB = [1.2, 4.5];                  // canvas px of vertical breath
  var LEAN_K = 0.024, LEAN_MAX = 14;          // lean into horizontal travel
  var BANK_K = 0.9, BANK_MAX = 16;            // roll into a turn (centripetal)
  var ANT_LAG_K = 0.018, ANT_LAG_MAX = 16;    // feeler inertia

  // ---- DOM ---------------------------------------------------------------
  var root = document.createElement("div");
  root.id = "moth-cursor";
  root.setAttribute("aria-hidden", "true");
  var els = {};
  var pending = PARTS.length;
  PARTS.forEach(function (p) {
    var img = document.createElement("img");
    img.src = BASE + p[1];
    img.draggable = false;
    img.style.cssText =
      "position:absolute;left:" + p[2] + "px;top:" + p[3] + "px;width:" +
      p[4] + "px;height:" + p[5] + "px;transform-origin:" + p[6] +
      ";z-index:" + p[7] + ";will-change:transform;backface-visibility:hidden;";
    img.addEventListener("load", ready);
    img.addEventListener("error", ready);
    els[p[0]] = img;
    root.appendChild(img);
  });
  function ready() { if (--pending <= 0) root.classList.add("is-ready"); }
  function mount() {
    document.body.appendChild(root);
    document.documentElement.classList.add("moth-cursor-active");
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  // ---- State -------------------------------------------------------------
  var px = window.innerWidth / 2, py = window.innerHeight / 2; // real pointer
  var sx = px, sy = py;        // skull position (the mass)
  var vx = 0, vy = 0;          // skull velocity (true momentum, px/s)
  var exertion = EXERT_FLOOR;  // 0..1 wingbeat effort
  var roll = 0;                // current body rotation (deg)
  var pitch = 1;               // current vertical foreshorten (scaleY)
  var phase = 0, swayPhase = 0;
  var seen = false, last = 0;

  window.addEventListener("pointermove", function (e) {
    px = e.clientX; py = e.clientY;
    if (!seen) { seen = true; sx = px; sy = py; }
  }, { passive: true });
  window.addEventListener("pointerleave", function () { root.classList.add("is-out"); });
  window.addEventListener("pointerenter", function () { root.classList.remove("is-out"); });

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function alpha(dt, tau) { return 1 - Math.exp(-dt / tau); }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) { last = now; return; }
    var dt = Math.min(0.04, (now - last) / 1000);
    last = now;

    // --- Spring-damper flight: F = -K*x - C*v, integrated as a point mass ---
    var ex = px - sx, ey = py - sy;          // displacement error (lag)
    var ax = ex * K - vx * C;                // acceleration = thrust + drag
    var ay = ey * K - vy * C;
    vx += ax * dt; vy += ay * dt;
    sx += vx * dt; sy += vy * dt;

    var speed = Math.hypot(vx, vy);
    var err = Math.hypot(ex, ey);

    // --- Effort: thrust demand drives the wingbeat (biology, not just speed) -
    var drive = clamp(err / ERR_REF * 0.85 + speed / SPEED_REF * 0.5, 0, 1);
    exertion += (Math.max(EXERT_FLOOR, drive) - exertion) *
                alpha(dt, drive > exertion ? EXERT_RISE : EXERT_FALL);
    var I = exertion;

    // --- Phases. Frequency rises with effort; layered sines avoid a metronome.
    var hz = IDLE_HZ + (FAST_HZ - IDLE_HZ) * I;
    phase += 2 * Math.PI * hz * dt;
    swayPhase += 2 * Math.PI * (0.45 + 0.5 * I) * dt;
    var wob = Math.sin(swayPhase * 0.37) * 0.12 + Math.sin(swayPhase * 0.91) * 0.06;

    // --- Wingbeat: foreshortening (scaleX) + hinge rotation -----------------
    var o = (0.5 - 0.5 * Math.cos(phase)) * (0.93 + wob);
    var o2 = (0.5 - 0.5 * Math.cos(phase - 0.18)) * (0.93 + wob); // right lags left
    var compress = WING_COMPRESS[0] + (WING_COMPRESS[1] - WING_COMPRESS[0]) * I;
    var rot = WING_ROT[0] + (WING_ROT[1] - WING_ROT[0]) * I;
    var sxwL = 1 - compress * o, rotL = rot * o;
    var sxwR = 1 - compress * o2, rotR = -rot * o2;
    els.wul.style.transform = "scaleX(" + sxwL + ") rotate(" + rotL + "deg)";
    els.wll.style.transform = "scaleX(" + sxwL + ") rotate(" + rotL * 0.85 + "deg)";
    els.wur.style.transform = "scaleX(" + sxwR + ") rotate(" + rotR + "deg)";
    els.wlr.style.transform = "scaleX(" + sxwR + ") rotate(" + rotR * 0.85 + "deg)";

    // --- Antennae: sway + inertial drag opposite to travel ------------------
    var swayAmp = ANT_SWAY[0] + (ANT_SWAY[1] - ANT_SWAY[0]) * I;
    var sway = Math.sin(swayPhase * 0.5) * swayAmp;
    var antLag = clamp(-vx * ANT_LAG_K, -ANT_LAG_MAX, ANT_LAG_MAX);
    els.antl.style.transform = "rotate(" + (sway + antLag) + "deg)";
    els.antr.style.transform = "rotate(" + (-sway * 0.8 + antLag) + "deg)";

    // --- Body: slow vertical breath -----------------------------------------
    var bob = (BODY_BOB[0] + (BODY_BOB[1] - BODY_BOB[0]) * I) *
              Math.sin(swayPhase * 0.5);
    els.body.style.transform = "translateY(" + bob + "px)";

    // --- Whole-body attitude: lean into travel + bank into the turn ---------
    var lean = clamp(vx * LEAN_K, -LEAN_MAX, LEAN_MAX);
    // Signed lateral (centripetal) acceleration: cross(v, a) / |v|.
    var lat = speed > 1 ? (vx * ay - vy * ax) / speed : 0;
    var bank = clamp(lat * BANK_K * 0.001, -BANK_MAX, BANK_MAX);
    roll += ((lean + bank) - roll) * alpha(dt, 0.1);
    // Subtle pitch: climbing/diving foreshortens the body vertically.
    var pitchTarget = 1 - clamp(Math.abs(vy) / 5200, 0, 0.06);
    pitch += (pitchTarget - pitch) * alpha(dt, 0.12);

    // --- Compose: position skull on pointer, scale, roll, lift, aura --------
    var s = SCALE * (1 + 0.05 * I);
    root.style.transform =
      "translate(" + (sx - SKULL_X) + "px," + (sy - SKULL_Y) + "px) scale(" +
      s + "," + (s * pitch) + ") rotate(" + roll + "deg)";
    root.style.filter =
      "drop-shadow(0 " + (3 + 5 * I).toFixed(1) + "px " + (6 + 8 * I).toFixed(1) +
      "px rgba(0,0,0,0.45)) drop-shadow(0 0 " + (11 * I).toFixed(1) +
      "px rgba(228,179,67," + (0.22 * I).toFixed(3) + "))";

    // Expose for the preview HUD (no-op on the live site).
    if (window.__moth) window.__moth(speed, err, I, roll);
  }
  requestAnimationFrame(frame);
})();
