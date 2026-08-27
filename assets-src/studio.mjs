// Buang latar studio dan ganti dengan krem halaman.
//
// Catatan penting: di rok bagian bawah, beda terang antara kain dan latar
// hanya 4-5 tingkat sehingga tidak ada cara otomatis yang bisa memisahkannya.
// Karena itu subjek dipotong sebatas badan atas, lalu bagian bawahnya
// dilarutkan ke krem. Rangkaian bunga di halaman duduk tepat di area larut
// itu, sehingga peralihannya terbaca sebagai komposisi, bukan sebagai
// potongan yang gagal.
import jpeg from 'jpeg-js';
import fs from 'fs';

const BASE = 'C:/Users/sayle/OneDrive/ドキュメント/Docs/Project/UNDANGAN 7 HARI/undangan-7hari-2/';
const img = jpeg.decode(fs.readFileSync(BASE + 'assets-src/foto-studio-asli.jpeg'), { useTArray: true });
const W = img.width, H = img.height, D = img.data;
const N = W * H;

const KREM = [255, 253, 248];
const AMBANG = Number(process.env.AMBANG || 9);   // beda minimum dari model latar
const LARUT_MULAI = Number(process.env.LARUT || 845);
const LARUT_SELESAI = LARUT_MULAI + 120;

const lum = new Float32Array(N);
for (let p = 0; p < N; p++) {
  const i = p * 4;
  lum[p] = 0.299 * D[i] + 0.587 * D[i + 1] + 0.114 * D[i + 2];
}

/* ---------- 1. model latar: permukaan kuadratik yang dicocokkan ----------
   Latar studio punya vignet dua dimensi — lebih gelap di sudut, lebih terang
   di tengah bawah. Gradasi mendatar saja tidak cukup, jadi dicocokkan
   permukaan kuadratik. Pencocokan diulang: putaran pertama memakai bingkai
   tepi, putaran berikutnya memakai semua piksel yang belum dianggap subjek,
   sehingga modelnya makin rapat mengikuti latar sebenarnya. */
function cocokkanKuadratik(bolehDipakai) {
  const M = 6, ATA = [], ATb = new Float64Array(M);
  for (let i = 0; i < M; i++) ATA.push(new Float64Array(M));
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const p = y * W + x;
      if (!bolehDipakai(p, x, y)) continue;
      const u = x / W, v = y / H;
      const f = [1, u, v, u * u, v * v, u * v];
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < M; j++) ATA[i][j] += f[i] * f[j];
        ATb[i] += f[i] * lum[p];
      }
    }
  }
  // Eliminasi Gauss dengan pivot sebagian.
  const A = ATA.map((baris, i) => Float64Array.from([...baris, ATb[i]]));
  for (let c = 0; c < M; c++) {
    let pivot = c;
    for (let r = c + 1; r < M; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    if (Math.abs(A[c][c]) < 1e-9) continue;
    for (let r = 0; r < M; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j <= M; j++) A[r][j] -= k * A[c][j];
    }
  }
  const koef = new Float64Array(M);
  for (let i = 0; i < M; i++) koef[i] = Math.abs(A[i][i]) < 1e-9 ? 0 : A[i][M] / A[i][i];
  return koef;
}

function hitungModel(koef) {
  const m = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      m[y * W + x] = koef[0] + koef[1] * u + koef[2] * v + koef[3] * u * u + koef[4] * v * v + koef[5] * u * v;
    }
  }
  return m;
}

const TEPI = 60;
let modelLatar = hitungModel(cocokkanKuadratik(
  (p, x, y) => x < TEPI || x >= W - TEPI || y < TEPI || y >= H - TEPI
));

// Dua putaran penghalusan memakai piksel yang belum dianggap subjek.
for (let putaran = 0; putaran < 2; putaran++) {
  modelLatar = hitungModel(cocokkanKuadratik(
    (p) => Math.abs(lum[p] - modelLatar[p]) <= AMBANG
  ));
}

let sisaRms = 0, nSisa = 0;
for (let p = 0; p < N; p++) {
  const d = lum[p] - modelLatar[p];
  if (Math.abs(d) <= AMBANG) { sisaRms += d * d; nSisa++; }
}
console.log('model latar: sisa RMS =', Math.sqrt(sisaRms / nSisa).toFixed(2), 'pada', +(nSisa / N * 100).toFixed(0) + '% piksel');

/* ---------- 2. subjek = yang menyimpang dari model ---------- */
let subjek = new Uint8Array(N);
for (let p = 0; p < N; p++) subjek[p] = Math.abs(lum[p] - modelLatar[p]) > AMBANG ? 1 : 0;

function morph(src, radius, mode) {
  const out = new Uint8Array(N);
  const want = mode === 'dilate' ? 1 : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hit = 0;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) { if (mode === 'erode') hit = 1; continue; }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) { if (mode === 'erode') { hit = 1; break; } continue; }
          if (src[yy * W + xx] === want) { hit = 1; break; }
        }
      }
      out[y * W + x] = mode === 'dilate' ? hit : (hit ? 0 : 1);
    }
  }
  return out;
}

function gumpalanTerbesar(src) {
  const label = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  let terbaik = -1, terbesar = 0;
  for (let mulai = 0; mulai < N; mulai++) {
    if (!src[mulai] || label[mulai] !== -1) continue;
    let k = 0, e = 0, n = 0;
    q[e++] = mulai; label[mulai] = mulai;
    while (k < e) {
      const p = q[k++]; n++;
      const x = p % W, y = (p / W) | 0;
      const t = [];
      if (x > 0) t.push(p - 1);
      if (x < W - 1) t.push(p + 1);
      if (y > 0) t.push(p - W);
      if (y < H - 1) t.push(p + W);
      for (const r of t) if (src[r] && label[r] === -1) { label[r] = mulai; q[e++] = r; }
    }
    if (n > terbesar) { terbesar = n; terbaik = mulai; }
  }
  const out = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (label[p] === terbaik) out[p] = 1;
  return out;
}

function isiLubang(src) {
  const luar = new Uint8Array(N);
  const q = new Int32Array(N);
  let k = 0, e = 0;
  const dorong = (p) => { if (!luar[p] && !src[p]) { luar[p] = 1; q[e++] = p; } };
  for (let x = 0; x < W; x++) { dorong(x); dorong((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { dorong(y * W); dorong(y * W + W - 1); }
  while (k < e) {
    const p = q[k++];
    const x = p % W, y = (p / W) | 0;
    if (x > 0) dorong(p - 1);
    if (x < W - 1) dorong(p + 1);
    if (y > 0) dorong(p - W);
    if (y < H - 1) dorong(p + W);
  }
  const out = new Uint8Array(N);
  for (let p = 0; p < N; p++) out[p] = (src[p] || !luar[p]) ? 1 : 0;
  return out;
}

// Lantai terang di kanan bawah tidak bisa dipisahkan dari kain lewat nilai
// terang, jadi mask dibatasi pada lajur tempat badannya berada. Batas ini
// aman karena di area yang dipakai (kepala sampai pinggul) siluetnya tidak
// pernah melewatinya.
// Di bawah bahu lajurnya dipersempit, karena di situ lantai terangnya
// merapat ke tepi baju.
const LAJUR_KIRI = 232;
for (let y = 0; y < H; y++) {
  const kananLajur = y < 720 ? 652 : 598;
  for (let x = 0; x < W; x++) {
    if (x < LAJUR_KIRI || x > kananLajur) subjek[y * W + x] = 0;
  }
}

subjek = morph(morph(subjek, 4, 'dilate'), 4, 'erode');
subjek = isiLubang(subjek);
subjek = gumpalanTerbesar(subjek);
subjek = morph(morph(subjek, 3, 'erode'), 3, 'dilate');
subjek = gumpalanTerbesar(subjek);
subjek = isiLubang(subjek);

let atas = H, bawah = -1, kiri = W, kanan = -1, luas = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (subjek[y * W + x]) {
  luas++;
  if (y < atas) atas = y;
  if (y > bawah) bawah = y;
  if (x < kiri) kiri = x;
  if (x > kanan) kanan = x;
}
console.log(JSON.stringify({
  ambang: AMBANG, persenSubjek: +(luas / N * 100).toFixed(1),
  kotak: { atas, bawah, kiri, kanan }
}, null, 1));

/* ---------- 3. gabungkan ke krem ---------- */
function lembutkan(src, radius) {
  const tmp = new Float32Array(N), out = new Float32Array(N);
  const n = radius * 2 + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -radius; k <= radius; k++) s += src[y * W + Math.min(W - 1, Math.max(0, x + k))];
    tmp[y * W + x] = s / n;
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    let s = 0;
    for (let k = -radius; k <= radius; k++) s += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x];
    out[y * W + x] = s / n;
  }
  return out;
}

const alpha = lembutkan(subjek, 2);
const ramp = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));

const out = Buffer.alloc(N * 4);
for (let y = 0; y < H; y++) {
  const larut = 1 - ramp(y, LARUT_MULAI, LARUT_SELESAI);
  for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4;
    const a = Math.min(1, Math.max(0, alpha[p])) * larut;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(KREM[c] + (D[i + c] - KREM[c]) * a);
    out[i + 3] = 255;
  }
}
// Susun ke kanvas 4:5 supaya pas dengan bingkai lengkung di halaman, tanpa
// perlu menggeser-geser object-position lagi.
const KW = 900, KH = 1125;
const geserX = Math.round((KW - W) / 2);
const kanvas = Buffer.alloc(KW * KH * 4);
for (let y = 0; y < KH; y++) {
  for (let x = 0; x < KW; x++) {
    const di = (y * KW + x) * 4;
    const sx = x - geserX, sy = y;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      const si = (sy * W + sx) * 4;
      kanvas[di] = out[si]; kanvas[di + 1] = out[si + 1]; kanvas[di + 2] = out[si + 2];
    } else {
      kanvas[di] = KREM[0]; kanvas[di + 1] = KREM[1]; kanvas[di + 2] = KREM[2];
    }
    kanvas[di + 3] = 255;
  }
}
fs.writeFileSync('studio-hasil.jpg', jpeg.encode({ data: kanvas, width: KW, height: KH }, 90).data);
console.log('kanvas akhir:', KW + 'x' + KH);

const pra = Buffer.alloc(N * 4);
for (let p = 0; p < N; p++) {
  const i = p * 4;
  if (subjek[p]) { pra[i] = D[i]; pra[i + 1] = D[i + 1]; pra[i + 2] = D[i + 2]; }
  else { pra[i] = 0; pra[i + 1] = 190; pra[i + 2] = 190; }
  pra[i + 3] = 255;
}
fs.writeFileSync('studio-mask.jpg', jpeg.encode({ data: pra, width: W, height: H }, 80).data);
console.log('-> studio-hasil.jpg, studio-mask.jpg');
