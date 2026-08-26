// Recolour the crimson hijab + dress to white, matching the printed invitation.
// Pixels are selected by hue/saturation and confined to a silhouette envelope so
// the red carpet, the red flowers and her skin are left untouched.
import jpeg from 'jpeg-js';
import fs from 'fs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const DEBUG = process.argv[4]; // optional mask-overlay preview

const img = jpeg.decode(fs.readFileSync(SRC), { useTArray: true });
const { width: W, height: H, data: D } = img;

/* ---- silhouette envelope: [y, left, right], linearly interpolated ---- */
const ENVELOPE = [
  [335, 372, 442],
  [360, 348, 468],
  [400, 336, 480],
  [500, 338, 492],
  [530, 338, 516],
  [552, 302, 566],
  [572, 272, 578],
  [612, 256, 596],
  [652, 243, 674],
  [692, 236, 656],
  [732, 232, 636],
  [792, 246, 602],
  [860, 252, 604],
  [912, 276, 594],
  [1000, 272, 602],
  [1100, 276, 606],
  [1145, 280, 600],
  [1175, 300, 600],
  [1195, 306, 570],
  [1280, 312, 566]
];

// Her lips fall in the same hue band as the fabric; keep them out of it.
const LIPS = { cx: 411, cy: 485, rx: 26, ry: 14 };
const inLips = (x, y) =>
  ((x - LIPS.cx) / LIPS.rx) ** 2 + ((y - LIPS.cy) / LIPS.ry) ** 2 <= 1;

function envelope(y) {
  if (y < ENVELOPE[0][0] || y > ENVELOPE[ENVELOPE.length - 1][0]) return null;
  for (let i = 1; i < ENVELOPE.length; i++) {
    const [y1, l1, r1] = ENVELOPE[i - 1];
    const [y2, l2, r2] = ENVELOPE[i];
    if (y <= y2) {
      const t = (y - y1) / (y2 - y1);
      return [l1 + (l2 - l1) * t, r1 + (r2 - r1) * t];
    }
  }
  return null;
}

function toHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx ? d / mx : 0, mx];
}

function fromHsv(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const redHue = (h) => h >= 325 || h <= 8;
const isCore = (h, s, v) => redHue(h) && s >= 0.55 && v >= 0.12;
// The silhouette edge is crimson blended with the background, so it is too
// desaturated for the core test but still visibly red. Measure that redness
// directly; requiring blue >= green keeps skin (which leans orange) out.
const isFringe = (r, g, b) => r - Math.max(g, b) >= 22 && b >= g - 4;

/* ---- pass 1: core mask ---- */
const mask = new Float32Array(W * H);
const vs = [];
for (let y = 0; y < H; y++) {
  const env = envelope(y);
  if (!env) continue;
  const [L, R] = env;
  for (let x = Math.max(0, Math.floor(L)); x <= Math.min(W - 1, Math.ceil(R)); x++) {
    if (inLips(x, y)) continue;
    const i = (y * W + x) * 4;
    const [h, s, v] = toHsv(D[i], D[i + 1], D[i + 2]);
    if (isCore(h, s, v)) {
      mask[y * W + x] = 1;
      vs.push(v);
    }
  }
}

/* ---- pass 1b: absorb the fringe within RING px of the core ---- */
const RING = 5;
const core = Float32Array.from(mask);
for (let y = 0; y < H; y++) {
  const env = envelope(y);
  if (!env) continue;
  const [L, R] = env;
  for (let x = Math.max(0, Math.floor(L - RING)); x <= Math.min(W - 1, Math.ceil(R + RING)); x++) {
    if (core[y * W + x] || inLips(x, y)) continue;
    let near = false;
    for (let dy = -RING; dy <= RING && !near; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -RING; dx <= RING; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        if (core[yy * W + xx]) { near = true; break; }
      }
    }
    if (!near) continue;
    const i = (y * W + x) * 4;
    if (isFringe(D[i], D[i + 1], D[i + 2])) mask[y * W + x] = 1;
  }
}

vs.sort((a, b) => a - b);
const pct = (p) => vs[Math.floor((vs.length - 1) * p)];
const stats = { pixels: vs.length, p02: pct(0.02), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p98: pct(0.98) };

/* ---- pass 2: feather the mask so edges don't alias ---- */
function boxBlur(src, radius) {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  const n = radius * 2 + 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(W - 1, Math.max(0, x + k));
        sum += src[y * W + xx];
      }
      tmp[y * W + x] = sum / n;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(H - 1, Math.max(0, y + k));
        sum += tmp[yy * W + x];
      }
      out[y * W + x] = sum / n;
    }
  }
  return out;
}
// Dilate first, so the blur ramp falls on background pixels rather than on the
// crimson edge itself — otherwise the outermost red pixels are only half
// recoloured and a pink outline survives.
function dilate(src, radius) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!src[y * W + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          out[yy * W + xx] = 1;
        }
      }
    }
  }
  return out;
}
// The dilation ring must not eat into the gold trim, the brooch, the watch or
// her skin — all warm hues the fabric test never matches on its own.
const dilated = dilate(mask, 2);
for (let p = 0; p < W * H; p++) {
  if (!dilated[p] || mask[p]) continue;
  const i = p * 4;
  const [h, s] = toHsv(D[i], D[i + 1], D[i + 2]);
  if (h >= 10 && h <= 65 && s >= 0.22) dilated[p] = 0;
}
const soft = boxBlur(dilated, 2);

/* ---- pass 3: recolour ----
   V of the crimson satin is driven by its red channel, so it already carries
   the fold shading. Remap that range onto a white-fabric range and drop
   saturation to a hint of warm cream. */
const LO = stats.p02, HI = stats.p98;
const V_LO = 0.60, V_HI = 0.99;

const out = Buffer.from(D);
for (let p = 0; p < W * H; p++) {
  const m = soft[p];
  if (m <= 0.004) continue;
  const i = p * 4;
  const [h, s, v] = toHsv(D[i], D[i + 1], D[i + 2]);
  const t = Math.min(1, Math.max(0, (v - LO) / (HI - LO)));
  const nv = Math.min(0.995, V_LO + (V_HI - V_LO) * Math.pow(t, 0.92));
  const ns = Math.min(0.085, 0.02 + s * 0.06);
  const [r2, g2, b2] = fromHsv(38, ns, nv);
  out[i] = D[i] + (r2 - D[i]) * m;
  out[i + 1] = D[i + 1] + (g2 - D[i + 1]) * m;
  out[i + 2] = D[i + 2] + (b2 - D[i + 2]) * m;
}

fs.writeFileSync(OUT, jpeg.encode({ data: out, width: W, height: H }, 92).data);

if (DEBUG) {
  const dbg = Buffer.from(D);
  for (let p = 0; p < W * H; p++) {
    const m = soft[p];
    if (m <= 0.004) continue;
    const i = p * 4;
    dbg[i] = D[i] + (0 - D[i]) * m;
    dbg[i + 1] = D[i + 1] + (255 - D[i + 1]) * m;
    dbg[i + 2] = D[i + 2] + (255 - D[i + 2]) * m;
  }
  fs.writeFileSync(DEBUG, jpeg.encode({ data: dbg, width: W, height: H }, 80).data);
}

console.log(JSON.stringify(stats, null, 1));
