"use strict";

// The dotted background. Dots near the pointer get pushed aside and light up,
// then wobble back into place when it moves on, like water around a finger.
// It only animates while something is moving, so it costs nothing when idle.
(() => {
  const canvas = document.getElementById("backdrop");
  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const dark = matchMedia("(prefers-color-scheme: dark)");

  const REACH = 150; // how far from the pointer dots react
  const PUSH = 26; // how far the nearest dots get pushed
  const SPRING = 0.11; // how hard dots pull back to their place
  const FRICTION = 0.84; // lower settles faster, higher wobbles more

  let dots = [];
  let width = 0;
  let height = 0;
  let pointer = null;
  let running = false;
  const colors = {};

  function readColors() {
    const style = getComputedStyle(document.documentElement);
    colors.dot = style.getPropertyValue("--faint").trim();
    colors.lit = style.getPropertyValue("--muted").trim();
    colors.glow = style.getPropertyValue("--fg").trim();
  }

  // "#1c1917" with an alpha, for the glow's gradient.
  function withAlpha(hex, alpha) {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function layout() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const gap = width < 600 ? 24 : 28;
    const cols = Math.ceil(width / gap) + 1;
    const rows = Math.ceil(height / gap) + 1;
    const left = (width - (cols - 1) * gap) / 2;
    const top = (height - (rows - 1) * gap) / 2;
    dots = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        dots.push({ x: left + col * gap, y: top + row * gap, ox: 0, oy: 0, vx: 0, vy: 0, lit: 0 });
      }
    }
    draw();
  }

  // Moves every dot one frame towards where the pointer is pushing it.
  // Returns whether anything is still moving.
  function step() {
    let moving = false;
    for (const dot of dots) {
      let tx = 0;
      let ty = 0;
      let near = 0;
      if (pointer) {
        const dx = dot.x - pointer.x;
        const dy = dot.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < REACH && dist > 0.01) {
          near = 1 - dist / REACH;
          const force = near * near * PUSH;
          tx = (dx / dist) * force;
          ty = (dy / dist) * force;
        }
      }
      dot.vx = (dot.vx + (tx - dot.ox) * SPRING) * FRICTION;
      dot.vy = (dot.vy + (ty - dot.oy) * SPRING) * FRICTION;
      dot.ox += dot.vx;
      dot.oy += dot.vy;
      dot.lit += (near - dot.lit) * 0.15;
      if (Math.abs(dot.vx) + Math.abs(dot.vy) > 0.01 || Math.abs(dot.lit - near) > 0.005) moving = true;
    }
    return moving;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (pointer && !still.matches) {
      const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, REACH * 1.6);
      glow.addColorStop(0, withAlpha(colors.glow, dark.matches ? 0.05 : 0.04));
      glow.addColorStop(1, withAlpha(colors.glow, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = colors.dot;
    ctx.globalAlpha = 0.7;
    for (const dot of dots) {
      if (dot.lit > 0.02) continue;
      ctx.fillRect(dot.x + dot.ox - 0.75, dot.y + dot.oy - 0.75, 1.5, 1.5);
    }
    // Dots near the pointer: brighter and bigger.
    ctx.fillStyle = colors.lit;
    for (const dot of dots) {
      if (dot.lit <= 0.02) continue;
      ctx.globalAlpha = 0.45 + dot.lit * 0.55;
      ctx.beginPath();
      ctx.arc(dot.x + dot.ox, dot.y + dot.oy, 0.9 + dot.lit * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame() {
    const moving = step();
    draw();
    if (moving) requestAnimationFrame(frame);
    else running = false;
  }

  // Websites cover the whole background, so there's no point animating
  // behind them.
  function covered() {
    return document.getElementById("frame").getClientRects().length > 0;
  }

  function start() {
    if (running || still.matches || covered()) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function follow(e) {
    pointer = { x: e.clientX, y: e.clientY };
    start();
  }

  function leave() {
    if (!pointer) return;
    pointer = null;
    start();
  }

  addEventListener("pointermove", follow, { passive: true });
  addEventListener("pointerdown", follow, { passive: true });
  // A finger lifting off, or the mouse leaving the window, lets the dots settle.
  addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") leave(); });
  addEventListener("pointercancel", leave);
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) leave(); });
  addEventListener("blur", leave);
  addEventListener("resize", layout);
  dark.addEventListener("change", () => { readColors(); draw(); });

  readColors();
  layout();
})();
