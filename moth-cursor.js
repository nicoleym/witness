/* ============================================================================
   Moth cursor — a living Death's-head moth that replaces the pointer.

   GEOMETRY is reconstructed from the deconstructed artwork pieces, fitted to
   moth/Image.png (the "ideal" pose) at ~94% pixel similarity. The 7 pieces sit
   in their canonical 675x565 frame; each wing/antenna pivots about the point
   where it meets the body.

   MOTION is grounded in flight physics & insect biology, modelled on
   moth/Moth.mp4. The skull rides a damped spring anchored to the real pointer
   (momentum, drag, a soft settle). The wingbeat is horizontal FORESHORTENING
   (scaleX) about each hinge plus a small rotation, and its effort tracks THRUST
   demand — how hard the moth is working to catch the cursor — not raw speed.

   BEHAVIOUR REPERTOIRE (each gesture has a cursor trigger and a real biomechanic):
     • flight     — moving: effort-driven wingbeat, banks into turns.
     • fold/perch — idle a beat: wings compress edge-on and drop, tucking into a
                    sliver; antennae lower; it lands and breathes.
     • clap-flap  — flick / mousedown / takeoff: wings snap upright over the back
                    and clap rapidly (the clap-and-fling lift mechanism), then ease.
     • brake      — hard deceleration: wings flare wide & forward to air-brake.
     • twitch     — perched: occasional asymmetric antenna flick (sensing the air).
   Attenborough x Nat Geo x a little computer magic.

   CREDIT: The original Death's-head moth illustration this cursor is built from
   was created by Petrenko Denys. The artwork (moth/Image.png and the
   moth/Deconstructed/ pieces) is his; the geometry and motion here are a
   derivative reconstruction of that original work.
   ============================================================================ */
(function () {
  "use strict";

  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;
  var touch = !fine;   // no pointer to chase — the moth wanders & spooks on tap

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

  // ---- Flight model ------------------------------------------------------
  var WN = 26, ZETA = 0.82;           // spring natural freq / damping ratio
  var K = WN * WN, C = 2 * ZETA * WN;
  var ERR_REF = 190, SPEED_REF = 1500;
  var EXERT_RISE = 0.045, EXERT_FALL = 0.5, EXERT_FLOOR = 0.06;
  var IDLE_HZ = 1.05, FAST_HZ = 9.5;
  var WING_COMPRESS = [0.07, 0.44];   // scaleX dip, rest -> full thrust
  var WING_ROT = [1.5, 13.0];         // deg about hinge
  var ANT_SWAY = [2.2, 4.5], BODY_BOB = [1.2, 4.5];
  var LEAN_K = 0.024, LEAN_MAX = 14;
  var BANK_K = 0.9, BANK_MAX = 16;
  var ANT_LAG_K = 0.018, ANT_LAG_MAX = 16;

  // ---- Behaviour repertoire ----------------------------------------------
  var REST_DELAY = 0.85;              // s of stillness before it perches
  var REST_IN_TAU = 0.5, REST_OUT_TAU = 0.07;
  var FOLD_RAISE = -8, FOLD_COMP = 0.60, FOLD_ANT = 15, FOLD_BODY = 7;
  var CLAP_HZ = 13, BURST_DUR = 0.5;     // upright clap-flap
  var CLAP_RAISE = 8, CLAP_SWING = 46, CLAP_COMP = [0.30, 0.60];
  var FLICK_SPEED = 950, BURST_COOLDOWN = 0.28;
  var TAKEOFF_REST = 0.3;
  var BRAKE_TAU = 0.12, BRAKE_K = 0.0016, BRAKE_MAX = 0.22; // wing air-brake flare
  var TWITCH_CHANCE = 0.006, TWITCH_DECAY = 0.18, TWITCH_AMP = 10;

  // ---- Mobile (no pointer to chase) --------------------------------------
  // On the final screen only, the moth flies in and then roams freely, landing
  // in varied random spots anywhere on the page (never fixed corners).
  var HOP_GAP = [1.6, 3.5];      // s perched before it flits to a new spot
  var SCREEN_MARGIN = 70;        // keep the whole moth on-screen
  var OFFSCREEN_MARGIN = 180;    // where it first enters from

  // Lilt: a perched moth never sits perfectly upright — a slow, irregular
  // resting tilt that drifts a few degrees either way.
  var LILT_AMP = 5.2;                 // peak resting tilt, deg

  // Ambient idle gestures, played one at a time while at rest. Each is a slow
  // pose envelope (0 -> peak -> 0) layered over whatever the wings are doing.
  // s between ambient gestures (random). Mobile uses a shorter dwell so a
  // resting gesture reliably plays before the moth flits to a new spot.
  var GEST_GAP = touch ? [1.6, 3.4] : [3.5, 8.0];
  // Wing-stretch: the four pieces splay in opposing directions, elongating.
  var STRETCH_DUR = 1.6, ST_UP = 15, ST_DN = 14, ST_EXT = 0.11;
  // Slick-back: wings sweep straight down/back, streamlined, and hold a beat.
  var SLICK_DUR = 2.2, SL_UP = 36, SL_DN = 24, SL_SXU = 0.76, SL_SXL = 0.82;
  // Coattails: a far narrower slick — wings hang nearly straight down and the
  // whole moth collapses to a slim vertical column, wings trailing like tails.
  // The right side lags the left a touch so the two tails don't drop in lockstep.
  var COAT_DUR = 0.7, CO_UP = 95, CO_DN = 86, CO_SXU = 0.23, CO_SXL = 0.27;
  var COAT_STAGGER = 0.12;            // fraction of progress the right side trails
  // A very gentle tremor in the tails while they hang down (held tension).
  var COAT_SHAKE_HZ = 13, COAT_SHAKE_AMP = 1.3;

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
  var imgsReady = false;
  function ready() { if (--pending <= 0) { imgsReady = true; maybeReveal(); } }
  // Desktop reveals as soon as the art loads; touch reveals only once a tap has
  // first summoned the moth (it lives off-screen until then).
  function maybeReveal() { if (imgsReady && (fine || engaged)) root.classList.add("is-ready"); }
  function mount() {
    document.body.appendChild(root);
    document.documentElement.classList.add("moth-cursor-active");
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  // ---- State -------------------------------------------------------------
  var px = window.innerWidth / 2, py = window.innerHeight / 2;
  var sx = px, sy = py, vx = 0, vy = 0;
  var exertion = EXERT_FLOOR, roll = 0, pitch = 1;
  var phase = 0, swayPhase = 0, clapPhase = 0, shakePhase = 0;
  var idleTime = 0, rest = 0, burst = 0, burstCd = 0;
  var brake = 0, prevSpeed = 0, prevSpeed2 = 0, twitch = 0, twitchDir = 1;
  var liltClock = 0;
  var gKind = "", gActive = false, gProg = 0, gDur = 1, gEnv = 0, gEnvR = 0, gGap = GEST_GAP[0];
  var lastGest = "";
  // Idle gestures are drawn from a shuffle-bag, not picked at random: the whole
  // repertoire plays once (in a fresh random order) before any of it repeats, so
  // every move is shown off in a short window instead of clustering by luck.
  var GESTURES = ["stretch", "slick", "coat", "clap"];
  var gestBag = [];
  var seen = false, last = 0;
  var engaged = false, running = false, hopTimer = 0, gestSinceHop = 0;
  // Intake step (touch): the moth never lives on that screen — each option the
  // witness selects sends it on a single translucent fly-by arc that crosses and
  // exits, so it's present only as a reaction to a tap, never obstructing copy.
  // A fly-by has three phases: 0 = arc in to a corner of the card, 1 = perch
  // there a beat (the moth settles, wings folding), 2 = scoot off and exit.
  var flyby = false, flyBig = false, flyPhase = 0, flyT = 0, flyPerch = false;
  var flyInDur = 0.7, perchDur = 0.7, flyOutDur = 0.6, flyOpacity = 0;
  var ix0 = 0, iy0 = 0, icx = 0, icy = 0;     // in-arc: entry + control
  var cnx = 0, cny = 0;                        // corner perch point
  var ocx = 0, ocy = 0, ex1 = 0, ey1 = 0;     // out-arc: control + exit
  var flP1 = 0, flP2 = 0, flAmp = 1;          // per-fly flutter phases + amplitude scale
  var FLY_OPACITY = 0.62;            // clearly ephemeral — it's just passing through
  var FLY_MARGIN = 60;               // entry/exit just off the visible edge

  function fireBurst(strength) {
    if (burstCd > 0) return;
    burst = Math.max(burst, strength);
    burstCd = BURST_COOLDOWN;
  }

  // A point just beyond a random screen edge — where the moth first enters from.
  function offscreen() {
    var w = window.innerWidth, h = window.innerHeight, m = OFFSCREEN_MARGIN;
    switch ((Math.random() * 4) | 0) {
      case 0:  return [rand(0, w), -m];      // top
      case 1:  return [w + m, rand(0, h)];   // right
      case 2:  return [rand(0, w), h + m];   // bottom
      default: return [-m, rand(0, h)];      // left
    }
  }
  // A fresh random target anywhere on-screen — varied landings, never a corner.
  // Module-scope so both the tap handler and the loop can retarget the moth.
  function randTarget() {
    var w = window.innerWidth, h = window.innerHeight;
    px = rand(SCREEN_MARGIN, Math.max(SCREEN_MARGIN, w - SCREEN_MARGIN));
    py = rand(SCREEN_MARGIN, Math.max(SCREEN_MARGIN, h - SCREEN_MARGIN));
    idleTime = 0;
  }

  if (fine) {
    // Desktop: the moth IS the cursor and chases the pointer. (unchanged)
    window.addEventListener("pointermove", function (e) {
      px = e.clientX; py = e.clientY;
      if (!seen) { seen = true; sx = px; sy = py; }
      if (rest > TAKEOFF_REST) fireBurst(1);   // wake & take off with a clap
      idleTime = 0;
    }, { passive: true });
    window.addEventListener("pointerdown", function () { fireBurst(0.85); }, { passive: true });
    window.addEventListener("pointerleave", function () { root.classList.add("is-out"); });
    window.addEventListener("pointerenter", function () { root.classList.remove("is-out"); });
  } else {
    // Touch: the moth is removed from the whole flow EXCEPT the very last screen
    // — the post-submission thank-you (#contactDone), which has no inputs. There
    // it flies in from off-screen and then roams freely, perching and flitting to
    // new random spots anywhere on the page. A tap sends it to the tapped spot.
    // It's pointer-events:none, so taps always pass straight through regardless.
    var contactDone = document.getElementById("contactDone");
    function isLastStep() { return contactDone && !contactDone.classList.contains("hidden"); }

    function summon() {
      if (engaged || !isLastStep()) return;
      var p = offscreen();
      sx = p[0]; sy = p[1]; vx = 0; vy = 0;   // enter from off-screen
      engaged = true; seen = true;
      maybeReveal();
      randTarget(); fireBurst(1);              // fly in to a first random spot
      hopTimer = rand(HOP_GAP[0], HOP_GAP[1]);
      if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
    }

    window.addEventListener("touchstart", function (e) {
      if (!isLastStep()) return;
      var t = e.touches && e.touches[0]; if (!t) return;
      if (!engaged) summon();
      px = t.clientX; py = t.clientY;          // fly to wherever they tapped
      fireBurst(1);
      hopTimer = rand(HOP_GAP[0], HOP_GAP[1]);
      idleTime = 0;
    }, { passive: true });

    // Appear as soon as the final screen is shown (and if we load straight into it).
    if (contactDone) {
      new MutationObserver(summon).observe(contactDone, {
        attributes: true, attributeFilter: ["class"]
      });
    }
    summon();

    // --- Intake step: a fly-by per selection -------------------------------
    // On the first screen the moth doesn't live on the page (it would compete
    // with the witness reading sensitive options). Instead, each time an option
    // is selected, it swoops in from below the finger, crosses, and exits up and
    // away — translucent, never landing, gone between taps. The 2nd selection,
    // which unlocks Submit, detours past the Submit button (a clap) on the way
    // out, nudging the eye to the now-available action.
    var intakeForm = document.getElementById("intake");
    var submitBtn = document.getElementById("submitBtn");
    var card = document.querySelector(".card");

    // A swerved control point off the straight A->B line, for a curved arc.
    function swerveCtrl(ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy) || 1;
      var sw = rand(0.18, 0.4) * dl * (Math.random() < 0.5 ? -1 : 1);
      return [(ax + bx) / 2 + (-dy / dl) * sw, (ay + by) / 2 + (dx / dl) * sw];
    }

    function flyAcross(big) {
      if (flyby) { fireBurst(1); return; }      // mid-fly already — just re-energize
      var w = window.innerWidth, h = window.innerHeight, m = FLY_MARGIN;
      flyBig = !!big;

      var e0 = (Math.random() * 4) | 0;         // enter from a random edge
      var p0 = flyEdge(e0, w, h, m); ix0 = p0[0]; iy0 = p0[1];

      // Perch target: a corner of the card. The 2nd (unlocking) pick lands on a
      // bottom corner near Submit; others on any corner. Clamp into view and nudge
      // outward so the moth clings to the outside of the corner, clear of the copy.
      var r = card ? card.getBoundingClientRect()
                   : { left: w * 0.12, top: h * 0.2, right: w * 0.88, bottom: h * 0.8 };
      var ccx = (r.left + r.right) / 2, ccy = (r.top + r.bottom) / 2;
      var corners = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]];
      var c = corners[flyBig ? (2 + ((Math.random() * 2) | 0)) : (Math.random() * 4) | 0];
      cnx = clamp(c[0] + (c[0] >= ccx ? 15 : -15), 16, w - 16);
      cny = clamp(c[1] + (c[1] >= ccy ? 15 : -15), 16, h - 16);

      var ic = swerveCtrl(ix0, iy0, cnx, cny); icx = ic[0]; icy = ic[1];

      var e1 = (e0 + 1 + ((Math.random() * 3) | 0)) % 4;     // scoot off a different edge
      var p1 = flyEdge(e1, w, h, m); ex1 = p1[0]; ey1 = p1[1];
      var oc = swerveCtrl(cnx, cny, ex1, ey1); ocx = oc[0]; ocy = oc[1];

      flyInDur = rand(0.6, 0.85); perchDur = rand(0.55, 0.95); flyOutDur = rand(0.5, 0.7);
      flP1 = rand(0, 6.2832); flP2 = rand(0, 6.2832); flAmp = rand(0.8, 1.3);

      sx = ix0; sy = iy0; vx = 0; vy = 0;
      flyby = true; flyPhase = 0; flyT = 0; flyPerch = false; flyOpacity = 0; seen = true;
      root.style.transition = "none";           // we drive opacity per-frame ourselves
      root.style.opacity = "0";
      if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
      fireBurst(1);
    }

    if (intakeForm) {
      // Not tap-triggered — while the intake step is up, the moth drops by on its
      // own at random intervals (a corner perch, then off again), so it reads as a
      // creature passing through rather than a reaction to each selection.
      var FLY_GAP = [6, 13];            // s between spontaneous visits (random)
      function scheduleFly() {
        setTimeout(function () {
          if (intakeForm.classList.contains("hidden")) return; // intake over — stop the chain
          if (!flyby) flyAcross(Math.random() < 0.3);          // occasionally perch near Submit
          scheduleFly();
        }, rand(FLY_GAP[0], FLY_GAP[1]) * 1000);
      }
      scheduleFly();
    }
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function alpha(dt, tau) { return 1 - Math.exp(-dt / tau); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function bez(a, b, c, t) {                 // quadratic Bézier at t in [0,1]
    var u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c;
  }
  function bezD(a, b, c, t) {                // its tangent (derivative) at t
    return 2 * (1 - t) * (b - a) + 2 * t * (c - b);
  }
  // A point just beyond a given screen edge (0 top, 1 right, 2 bottom, 3 left).
  function flyEdge(edge, w, h, m) {
    switch (edge) {
      case 0:  return [rand(w * 0.15, w * 0.85), -m];
      case 1:  return [w + m, rand(h * 0.15, h * 0.85)];
      case 2:  return [rand(w * 0.15, w * 0.85), h + m];
      default: return [-m, rand(h * 0.15, h * 0.85)];
    }
  }

  // Next idle gesture from the shuffle-bag: refill + shuffle when empty, and
  // never let a bag start on the move the last one ended with.
  function nextGesture() {
    if (gestBag.length === 0) {
      gestBag = GESTURES.slice();
      for (var i = gestBag.length - 1; i > 0; i--) {     // Fisher–Yates
        var j = (Math.random() * (i + 1)) | 0;
        var tmp = gestBag[i]; gestBag[i] = gestBag[j]; gestBag[j] = tmp;
      }
      if (gestBag[0] === lastGest && gestBag.length > 1) gestBag.push(gestBag.shift());
    }
    return gestBag.shift();
  }

  // Envelope shape for an ambient gesture, progress p in [0,1].
  // Stretch is a smooth out-and-back; slick-back ramps up, holds, releases.
  function gestureEnv(kind, p) {
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    if (kind === "coat") {
      // Sharp snap in, a brief held dwell (room for the tremor), sharp snap out.
      if (p < 0.24) { var c = p / 0.24; return c * c * (3 - 2 * c); }
      if (p < 0.62) return 1;
      var e = (1 - p) / 0.38; return e * e * (3 - 2 * e);
    }
    if (kind === "slick") {
      if (p < 0.22) { var u = p / 0.22; return u * u * (3 - 2 * u); }
      if (p < 0.68) return 1;
      var d = (1 - p) / 0.32; return d * d * (3 - 2 * d);
    }
    return Math.sin(Math.PI * clamp(p, 0, 1)); // stretch
  }

  function frame(now) {
    if (fine || running) requestAnimationFrame(frame);  // touch loop stops when the moth is gone
    if (!last) { last = now; return; }
    var dt = Math.min(0.04, (now - last) / 1000);
    last = now;

    // --- Position: spring chase, or a scripted fly-by arc ------------------
    var ex = 0, ey = 0, ax = 0, ay = 0, speed, err;
    if (flyby) {
      flyT += dt;
      if (flyPhase === 1) {
        // --- Perch: alight on the card corner and pause a beat --------------
        // Pinned in place; flyPerch drives the existing fold pose (wings
        // compress & drop, antennae lower, body settles) so it reads as a land.
        sx = cnx; sy = cny; vx = 0; vy = 0;
        speed = 0; err = 0; flyPerch = true;
        flyOpacity += (0.82 - flyOpacity) * alpha(dt, 0.12);  // a touch more solid, landed
        root.style.opacity = flyOpacity.toFixed(3);
        if (flyT >= perchDur) { flyPhase = 2; flyT = 0; flyPerch = false; fireBurst(0.95); }
      } else {
        // --- In / Out: a fluttery Bézier arc -------------------------------
        flyPerch = false;
        var inSeg = flyPhase === 0;
        var qa = inSeg ? ix0 : cnx, qb = inSeg ? iy0 : cny;   // segment start
        var qc = inSeg ? icx : ocx, qd = inSeg ? icy : ocy;   // control
        var qe = inSeg ? cnx : ex1, qf = inSeg ? cny : ey1;   // segment end
        var dur = inSeg ? flyInDur : flyOutDur;
        var fp = flyT / dur; if (fp > 1) fp = 1;
        var fe = fp * fp * (3 - 2 * fp);              // smoothstep ease along the arc
        fe += 0.02 * Math.sin(6.2832 * 1.4 * flyT + flP1);   // mild pace surge (not mechanical)
        if (fe < 0) fe = 0; else if (fe > 1) fe = 1;
        var bx = bez(qa, qc, qe, fe), by = bez(qb, qd, qf, fe);
        // Erratic flutter perpendicular to travel, tapered to nothing at the
        // ends — two incommensurate sines give the irregular jink of a moth.
        var tx = bezD(qa, qc, qe, fe), ty = bezD(qb, qd, qf, fe);
        var tl = Math.hypot(tx, ty) || 1;
        var win = Math.sin(Math.PI * fp);
        var flut = win * flAmp * (24 * Math.sin(6.2832 * 2.6 * flyT + flP1) +
                                  11 * Math.sin(6.2832 * 4.3 * flyT + flP2));
        var nx = bx + (-ty / tl) * flut, ny = by + (tx / tl) * flut;
        vx = (nx - sx) / dt; vy = (ny - sy) / dt;     // path velocity → wingbeat & lean
        sx = nx; sy = ny;
        speed = Math.hypot(vx, vy); err = 0;
        idleTime = 0;                                  // mid-flight never perches
        var target = inSeg ? FLY_OPACITY : (fp > 0.6 ? 0 : FLY_OPACITY);  // dissolve as it leaves
        flyOpacity += (target - flyOpacity) * alpha(dt, 0.16);
        root.style.opacity = flyOpacity.toFixed(3);
        if (fp >= 1) {
          if (inSeg) { flyPhase = 1; flyT = 0; }       // reached the corner → perch
          else {                                       // scoot complete — vanish
            flyby = false; flyBig = false; flyPerch = false;
            root.style.opacity = ""; root.style.transition = "";
            if (!engaged) running = false;             // stop the loop unless roam is active
            return;
          }
        }
      }
    } else {
      ex = px - sx; ey = py - sy;
      ax = ex * K - vx * C; ay = ey * K - vy * C;
      vx += ax * dt; vy += ay * dt; sx += vx * dt; sy += vy * dt;
      speed = Math.hypot(vx, vy); err = Math.hypot(ex, ey);
    }

    // --- Timers: idle -> perch, burst decay --------------------------------
    idleTime += dt;
    if (burstCd > 0) burstCd -= dt;
    var restTarget = (idleTime > REST_DELAY && speed < 40) || flyPerch ? 1 : 0;
    rest += (restTarget - rest) *
            alpha(dt, restTarget > rest ? REST_IN_TAU : REST_OUT_TAU);
    if (burst > 0) burst = Math.max(0, burst - dt / BURST_DUR);
    // Flick: a fresh surge past the threshold claps the wings.
    if (speed > FLICK_SPEED && prevSpeed <= FLICK_SPEED) fireBurst(1);
    prevSpeed = speed;

    // --- Ambient idle gestures: occasional stretch / slick-back ------------
    var settled = speed < 40 && burst <= 0;

    // --- Mobile: roam freely — flit to a new random spot after each perch ---
    // It only relocates once it has shown at least one resting gesture here, and
    // never mid-gesture, so the whole repertoire gets seen between hops (instead
    // of the hop always winning the race and cutting every gesture short).
    if (touch && engaged && settled && rest > 0.4) {
      hopTimer -= dt;
      if (hopTimer <= 0 && gestSinceHop > 0 && !gActive && gEnv < 0.02 && gEnvR < 0.02) {
        randTarget(); fireBurst(0.9);            // clap-and-fling to a new spot
        hopTimer = rand(HOP_GAP[0], HOP_GAP[1]);
        gGap = rand(GEST_GAP[0], GEST_GAP[1]);   // fresh dwell at the new spot
        gestSinceHop = 0;
      }
    }

    if (gActive) {
      gProg += dt / gDur;
      if (gProg >= 1 || !settled) { gActive = false; gGap = rand(GEST_GAP[0], GEST_GAP[1]); }
      if (gActive) {
        var stag = gKind === "coat" ? COAT_STAGGER : 0;
        gEnv = gestureEnv(gKind, gProg);
        gEnvR = stag ? gestureEnv(gKind, gProg - stag) : gEnv;
      }
    }
    if (!gActive) {
      gEnv += (0 - gEnv) * alpha(dt, 0.14);          // ease the last gesture out
      gEnvR += (0 - gEnvR) * alpha(dt, 0.14);
      if (settled && rest > 0.4 && !flyby) {        // no ambient gestures during a fly-by perch
        gGap -= dt;
        if (gGap <= 0 && gEnv < 0.02) {
          // Draw the next idle motion from the shuffle-bag so the whole
          // repertoire cycles through, even without cursor input.
          var pick = nextGesture();
          lastGest = pick;
          gestSinceHop++;                            // a gesture has played here
          gGap = rand(GEST_GAP[0], GEST_GAP[1]);
          if (pick === "clap") {
            fireBurst(0.9);                            // a spontaneous flutter-clap
          } else {
            gActive = true; gProg = 0; gKind = pick;
            gDur = pick === "slick" ? SLICK_DUR : pick === "coat" ? COAT_DUR : STRETCH_DUR;
          }
        }
      }
    }

    // --- Effort: thrust demand drives the wingbeat -------------------------
    var drive = clamp(err / ERR_REF * 0.85 + speed / SPEED_REF * 0.5, 0, 1);
    exertion += (Math.max(EXERT_FLOOR, drive) - exertion) *
                alpha(dt, drive > exertion ? EXERT_RISE : EXERT_FALL);
    var I = exertion * (1 - rest);   // a perched moth isn't exerting

    // --- Air-brake: wings flare when decelerating hard ---------------------
    var decel = (prevSpeed2 - speed) / dt;       // px/s^2 of slowing
    var brakeTarget = clamp(decel * BRAKE_K, 0, BRAKE_MAX) * (1 - rest);
    brake += (brakeTarget - brake) * alpha(dt, BRAKE_TAU);
    prevSpeed2 = speed;

    // --- Phases ------------------------------------------------------------
    var hz = IDLE_HZ + (FAST_HZ - IDLE_HZ) * I;
    phase += 2 * Math.PI * hz * dt;
    swayPhase += 2 * Math.PI * (0.45 + 0.5 * I) * dt;
    if (burst > 0) clapPhase += 2 * Math.PI * CLAP_HZ * dt; else clapPhase = 0;
    shakePhase += 2 * Math.PI * COAT_SHAKE_HZ * dt;
    var wob = Math.sin(swayPhase * 0.37) * 0.12 + Math.sin(swayPhase * 0.91) * 0.06;

    // --- Wing pose: blend flight -> fold(rest) -> clap(burst), + brake -----
    var o = (0.5 - 0.5 * Math.cos(phase)) * (0.93 + wob);
    var o2 = (0.5 - 0.5 * Math.cos(phase - 0.18)) * (0.93 + wob); // right lags
    var compAmt = WING_COMPRESS[0] + (WING_COMPRESS[1] - WING_COMPRESS[0]) * I;
    var rotAmt = WING_ROT[0] + (WING_ROT[1] - WING_ROT[0]) * I;
    var oc = 0.5 - 0.5 * Math.cos(clapPhase);

    // flight targets per side; brake widens (negative compression).
    var raiseLf = rotAmt * o, compLf = compAmt * o - brake;
    var raiseRf = rotAmt * o2, compRf = compAmt * o2 - brake;
    var raiseClap = CLAP_RAISE + CLAP_SWING * oc;          // clap is symmetric
    var compClap = CLAP_COMP[0] + (CLAP_COMP[1] - CLAP_COMP[0]) * oc;

    // Per-wing, in a "raise = tip up" convention (right side negates on emit).
    // Base = flight blended into the folded perch by `rest`.
    var rUL = lerp(raiseLf, FOLD_RAISE, rest), rLL = lerp(raiseLf * 0.85, FOLD_RAISE, rest);
    var rUR = lerp(raiseRf, FOLD_RAISE, rest), rLR = lerp(raiseRf * 0.85, FOLD_RAISE, rest);
    var xL = 1 - lerp(compLf, FOLD_COMP, rest), xR = 1 - lerp(compRf, FOLD_COMP, rest);
    var xUL = xL, xLL = xL, xUR = xR, xLR = xR;

    // Ambient gesture: stretch (splay) / slick-back / coattails. The left side
    // uses gEnv, the right side gEnvR — equal except for coattails, where the
    // right tail lags the left so they don't drop in perfect lockstep.
    if (gEnv > 0.001 || gEnvR > 0.001) {
      var gUp, gDn, gSxU, gSxL;
      if (gKind === "slick") { gUp = -SL_UP; gDn = -SL_DN; gSxU = SL_SXU; gSxL = SL_SXL; }
      else if (gKind === "coat") { gUp = -CO_UP; gDn = -CO_DN; gSxU = CO_SXU; gSxL = CO_SXL; }
      else { gUp = ST_UP; gDn = -ST_DN; gSxU = 1 + ST_EXT; gSxL = 1 + ST_EXT; }
      rUL = lerp(rUL, gUp, gEnv); rUR = lerp(rUR, gUp, gEnvR);
      rLL = lerp(rLL, gDn, gEnv); rLR = lerp(rLR, gDn, gEnvR);
      xUL = lerp(xUL, gSxU, gEnv); xUR = lerp(xUR, gSxU, gEnvR);
      xLL = lerp(xLL, gSxL, gEnv); xLR = lerp(xLR, gSxL, gEnvR);

      // Coattails held down: a very gentle tremor, gated by how far each tail
      // has dropped (so it fades in/out with the pose) and offset L vs R.
      if (gKind === "coat") {
        var q = (Math.sin(shakePhase) + 0.4 * Math.sin(shakePhase * 1.7)) * COAT_SHAKE_AMP;
        var qR = (Math.sin(shakePhase + 0.7) + 0.4 * Math.sin(shakePhase * 1.7 + 0.7)) * COAT_SHAKE_AMP;
        rUL += q * gEnv; rLL += q * 0.8 * gEnv;
        rUR += qR * gEnvR; rLR += qR * 0.8 * gEnvR;
      }
    }

    // Clap-flap overrides everything while it fires.
    if (burst > 0) {
      rUL = lerp(rUL, raiseClap, burst); rUR = lerp(rUR, raiseClap, burst);
      rLL = lerp(rLL, raiseClap * 0.85, burst); rLR = lerp(rLR, raiseClap * 0.85, burst);
      var xc = 1 - compClap;
      xUL = lerp(xUL, xc, burst); xUR = lerp(xUR, xc, burst);
      xLL = lerp(xLL, xc, burst); xLR = lerp(xLR, xc, burst);
    }

    els.wul.style.transform = "scaleX(" + xUL + ") rotate(" + rUL + "deg)";
    els.wll.style.transform = "scaleX(" + xLL + ") rotate(" + rLL + "deg)";
    els.wur.style.transform = "scaleX(" + xUR + ") rotate(" + (-rUR) + "deg)";
    els.wlr.style.transform = "scaleX(" + xLR + ") rotate(" + (-rLR) + "deg)";

    // --- Antennae: sway + inertia, blend to lowered (fold) + clap + twitch --
    var swayAmp = ANT_SWAY[0] + (ANT_SWAY[1] - ANT_SWAY[0]) * I;
    var sway = Math.sin(swayPhase * 0.5) * swayAmp;
    var antLag = clamp(-vx * ANT_LAG_K, -ANT_LAG_MAX, ANT_LAG_MAX);
    if (rest > 0.5 && Math.random() < TWITCH_CHANCE) {
      twitch = 1; twitchDir = Math.random() < 0.5 ? -1 : 1;
    }
    twitch = Math.max(0, twitch - dt / TWITCH_DECAY);
    var antL = lerp(lerp(sway + antLag, FOLD_ANT, rest), -5, burst) + twitch * TWITCH_AMP * twitchDir;
    var antR = lerp(lerp(-sway * 0.8 + antLag, -FOLD_ANT, rest), 5, burst);
    // Feelers spread on a stretch, lay back on a slick / coattails.
    var gAntL = -7, gAntR = 7;
    if (gKind === "slick") { gAntL = 13; gAntR = -13; }
    else if (gKind === "coat") { gAntL = 6; gAntR = -6; }
    antL = lerp(antL, gAntL, gEnv); antR = lerp(antR, gAntR, gEnvR);
    els.antl.style.transform = "rotate(" + antL + "deg)";
    els.antr.style.transform = "rotate(" + antR + "deg)";

    // --- Body: breath, drop when folded, lift on clap, rise on stretch -----
    var bob = (BODY_BOB[0] + (BODY_BOB[1] - BODY_BOB[0]) * I) * Math.sin(swayPhase * 0.5);
    var gBody = -3;                                // stretch rises
    if (gKind === "slick") gBody = 2;              // slick / coattails settle down
    else if (gKind === "coat") gBody = 3;
    var bodyTy = bob * (1 - rest) + FOLD_BODY * rest - 4 * oc * burst + gBody * gEnv;
    els.body.style.transform = "translateY(" + bodyTy + "px)";

    // --- Whole-body attitude: lilt + lean + bank ---------------------------
    // A perched moth is never bolt upright — slow, irregular resting tilt.
    liltClock += dt;
    var lilt = Math.sin(liltClock * 0.6) * (LILT_AMP * 0.62) +
               Math.sin(liltClock * 0.27 + 1.3) * (LILT_AMP * 0.42);
    var lean = clamp(vx * LEAN_K, -LEAN_MAX, LEAN_MAX);
    var lat = speed > 1 ? (vx * ay - vy * ax) / speed : 0;
    var bank = clamp(lat * BANK_K * 0.001, -BANK_MAX, BANK_MAX);
    roll += (lilt + (lean + bank) * (1 - rest) - roll) * alpha(dt, 0.1);
    var pitchTarget = 1 - clamp(Math.abs(vy) / 5200, 0, 0.06);
    pitch += (pitchTarget - pitch) * alpha(dt, 0.12);

    // --- Compose -----------------------------------------------------------
    var gScale = gKind === "stretch" ? 0.04 * gEnv : 0; // stretch elongates a touch
    var s = SCALE * (1 + 0.05 * I + 0.07 * burst * oc - 0.03 * rest + gScale);
    root.style.transform =
      "translate(" + (sx - SKULL_X) + "px," + (sy - SKULL_Y) + "px) scale(" +
      s + "," + (s * pitch) + ") rotate(" + roll + "deg)";
    var glow = Math.max(I, burst * 0.6);
    root.style.filter =
      "drop-shadow(0 " + (3 + 5 * I).toFixed(1) + "px " + (6 + 8 * I).toFixed(1) +
      "px rgba(0,0,0,0.45)) drop-shadow(0 0 " + (11 * glow).toFixed(1) +
      "px rgba(228,179,67," + (0.22 * glow).toFixed(3) + "))";

    if (window.__moth) window.__moth(speed, err, I, roll, { rest: rest, burst: burst, brake: brake });
  }
  if (fine) requestAnimationFrame(frame);   // touch starts the loop on activation
})();
