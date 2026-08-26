// Potong subjek dari latar. Mask dihitung dari foto ASLI (baju masih merah,
// jadi mudah dipisahkan dari latar), lalu diterapkan ke foto yang sudah
// diputihkan. Ini penting: pada foto putih, baju dan sarung kursi sama-sama
// krem sehingga tidak bisa dibedakan lagi.
import jpeg from 'jpeg-js';
import fs from 'fs';

const BASE = 'C:/Users/sayle/OneDrive/ドキュメント/Docs/Project/UNDANGAN 7 HARI/undangan-7hari-2/';
const asli = jpeg.decode(fs.readFileSync(BASE + 'assets-src/foto-almarhumah-asli.jpeg'), { useTArray: true });
const W = asli.width, H = asli.height, A = asli.data;
const N = W * H;

const ENVELOPE = [
  [335, 372, 442], [360, 348, 468], [400, 336, 480], [500, 338, 492],
  [530, 338, 516], [552, 302, 566], [572, 272, 578], [612, 256, 596],
  [652, 243, 674], [692, 236, 656], [732, 232, 636], [792, 246, 602],
  [860, 252, 604], [912, 276, 594], [1000, 272, 602], [1100, 276, 606],
  [1145, 280, 600], [1175, 300, 600], [1195, 306, 570], [1280, 312, 566]
];

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

function hsv(i) {
  let r = A[i] / 255, g = A[i + 1] / 255, b = A[i + 2] / 255;
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

// Satin bajunya condong ke magenta (hue 338-348). Karpet dan kain latar di
// belakang bahu lebih ke merah cabai (hue 349-356) — itulah pembedanya.
// Batas atas 348 sengaja ketat: lipatan gelap yang ikut terbuang nanti
// dipulihkan lagi oleh pengisian lubang, sedangkan karpet yang berada di
// tepi siluet tidak akan kembali.
// Hijab warnanya lebih hangat dan melewati batas 0°/360°, sedangkan karpet
// hanya ada di area badan ke bawah. Jadi ambang ketat dipakai mulai dari
// bahu; di area kepala ambangnya dilonggarkan supaya hijab tidak terpotong.
const BATAS_KEPALA = 580;
const hueKain = (h, y) => (y < BATAS_KEPALA)
  ? (h >= 325 || h <= 12)
  : (h >= 330 && h < 348);

// Renda emas di keliman dan pergelangan bukan merah, jadi harus dikenali
// terpisah. Tanpa ini keliman rok terputus dan siluetnya tercekik.
const hueEmas = (h, s, v) => h >= 18 && h <= 62 && s >= 0.25 && v >= 0.35;

/* ---------- 1. kain + renda emas di dalam envelope ---------- */
const kain = new Uint8Array(N);
for (let y = 0; y < H; y++) {
  const env = envelope(y);
  if (!env) continue;
  for (let x = Math.max(0, Math.floor(env[0])); x <= Math.min(W - 1, Math.ceil(env[1])); x++) {
    const i = (y * W + x) * 4;
    const [h, s, v] = hsv(i);
    if ((hueKain(h, y) && s >= 0.55 && v >= 0.12) || hueEmas(h, s, v)) kain[y * W + x] = 1;
  }
}

/* ---------- 2. tutup celah kecil (dilate lalu erode) ---------- */
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

let subjek = morph(morph(kain, 6, 'dilate'), 6, 'erode');

/* ---------- 3. isi lubang: wajah dan tangan dikelilingi kain, jadi
      apa pun yang tidak tersambung ke tepi gambar adalah bagian subjek ---------- */
function isiLubang(src) {
  const luar = new Uint8Array(N);
  const antre = new Int32Array(N);
  let kepala = 0, ekor = 0;
  const dorong = (p) => { if (!luar[p] && !src[p]) { luar[p] = 1; antre[ekor++] = p; } };
  for (let x = 0; x < W; x++) { dorong(x); dorong((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { dorong(y * W); dorong(y * W + W - 1); }
  while (kepala < ekor) {
    const p = antre[kepala++];
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

subjek = isiLubang(subjek);

/* ---------- 4. ambil gumpalan terbesar saja ---------- */
function gumpalanTerbesar(src) {
  const label = new Int32Array(N).fill(-1);
  const antre = new Int32Array(N);
  let terbaik = -1, terbaikUkuran = 0;
  for (let mulai = 0; mulai < N; mulai++) {
    if (!src[mulai] || label[mulai] !== -1) continue;
    let kepala = 0, ekor = 0, ukuran = 0;
    antre[ekor++] = mulai; label[mulai] = mulai;
    while (kepala < ekor) {
      const p = antre[kepala++]; ukuran++;
      const x = p % W, y = (p / W) | 0;
      const tetangga = [];
      if (x > 0) tetangga.push(p - 1);
      if (x < W - 1) tetangga.push(p + 1);
      if (y > 0) tetangga.push(p - W);
      if (y < H - 1) tetangga.push(p + W);
      for (const q of tetangga) if (src[q] && label[q] === -1) { label[q] = mulai; antre[ekor++] = q; }
    }
    if (ukuran > terbaikUkuran) { terbaikUkuran = ukuran; terbaik = mulai; }
  }
  const out = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (label[p] === terbaik) out[p] = 1;
  return { mask: out, ukuran: terbaikUkuran };
}

const hasil = gumpalanTerbesar(subjek);
subjek = hasil.mask;

// Buang tonjolan tipis sisa karpet: erosi lalu dilasi dengan radius sama.
subjek = morph(morph(subjek, 4, 'erode'), 4, 'dilate');
subjek = gumpalanTerbesar(subjek).mask;
subjek = isiLubang(subjek);

/* ---------- 5. bunga di bagian bawah ---------- */
// Bunga dipertahankan (permintaan), tetapi meja hitam dan karpet merah
// tetap dibuang supaya rangkaiannya terlihat mengambang di atas krem,
// seperti pada undangan cetaknya.
const BUNGA_MULAI = 812;
const bunga = new Uint8Array(N);
for (let y = BUNGA_MULAI; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (subjek[p]) continue;
    const [h, s, v] = hsv(p * 4);
    const karpet = (h >= 344 || h <= 10) && s >= 0.58 && v >= 0.5;   // merah cabai
    const meja = v < 0.42;                                            // kain meja gelap
    const daun = h >= 60 && h <= 185 && s >= 0.18;                    // dedaunan
    const kelopak = v >= 0.5 && s <= 0.55;                            // kelopak putih/pink
    const mawar = (h >= 330 || h <= 12) && s >= 0.5 && v < 0.5;       // mawar merah tua
    // Taplak meja putih di kanan warnanya sama persis dengan kelopak dan
    // sama halusnya, jadi tidak bisa dipisahkan lewat warna atau tekstur.
    // Karena ini satu foto tetap, area itu dikecualikan berdasarkan posisi.
    // Dua kantong kain/kursi yang warnanya tidak bisa dibedakan dari kelopak.
    const taplakKanan = (x > 596 && y < 884) || (x > 590 && x < 730 && y > 1020);
    if (!karpet && !meja && !taplakKanan && (daun || kelopak || mawar)) bunga[p] = 1;
  }
}

// Rapikan: tutup celah antar kelopak, buang bintik kecil.
let bungaBersih = morph(morph(bunga, 7, 'dilate'), 7, 'erode');
bungaBersih = morph(morph(bungaBersih, 2, 'erode'), 2, 'dilate');

function buangGumpalanKecil(src, minimal) {
  const label = new Int32Array(N).fill(-1);
  const antre = new Int32Array(N);
  const out = new Uint8Array(N);
  for (let mulai = 0; mulai < N; mulai++) {
    if (!src[mulai] || label[mulai] !== -1) continue;
    let kepala = 0, ekor = 0;
    antre[ekor++] = mulai; label[mulai] = mulai;
    while (kepala < ekor) {
      const q = antre[kepala++];
      const x = q % W, y = (q / W) | 0;
      const t = [];
      if (x > 0) t.push(q - 1);
      if (x < W - 1) t.push(q + 1);
      if (y > 0) t.push(q - W);
      if (y < H - 1) t.push(q + W);
      for (const r of t) if (src[r] && label[r] === -1) { label[r] = mulai; antre[ekor++] = r; }
    }
    if (ekor >= minimal) for (let k = 0; k < ekor; k++) out[antre[k]] = 1;
  }
  return out;
}
bungaBersih = buangGumpalanKecil(bungaBersih, 2500);

let luas = 0;
for (let p = 0; p < N; p++) luas += subjek[p];
let luasBunga = 0;
for (let p = 0; p < N; p++) luasBunga += bungaBersih[p];
console.log(JSON.stringify({
  pikselKain: kain.reduce((a, b) => a + b, 0),
  pikselSubjek: luas,
  pikselBunga: luasBunga,
  persenTerpakai: +((luas + luasBunga) / N * 100).toFixed(1)
}, null, 1));

/* ---------- pratinjau mask ---------- */
const pratinjau = Buffer.alloc(N * 4);
for (let p = 0; p < N; p++) {
  const i = p * 4;
  if (subjek[p] || bungaBersih[p]) {
    pratinjau[i] = A[i]; pratinjau[i + 1] = A[i + 1]; pratinjau[i + 2] = A[i + 2];
  } else {
    pratinjau[i] = 0; pratinjau[i + 1] = 200; pratinjau[i + 2] = 200;
  }
  pratinjau[i + 3] = 255;
}
fs.writeFileSync('mask-subjek.jpg', jpeg.encode({ data: pratinjau, width: W, height: H }, 80).data);
fs.writeFileSync('mask-subjek.bin', Buffer.from(subjek));
console.log('pratinjau -> mask-subjek.jpg');

fs.writeFileSync('mask-bunga.bin', Buffer.from(bungaBersih));

/* ---------- 6. gabungkan ke latar krem ---------- */
const putih = jpeg.decode(fs.readFileSync(BASE + 'assets-src/foto-almarhumah-putih.jpg'), { useTArray: true });
const P = putih.data;
const KREM = [255, 253, 248]; // sama dengan --bg di halaman

function lembutkan(src, radius) {
  const tmp = new Float32Array(N), out = new Float32Array(N);
  const n = radius * 2 + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let jml = 0;
    for (let k = -radius; k <= radius; k++) jml += src[y * W + Math.min(W - 1, Math.max(0, x + k))];
    tmp[y * W + x] = jml / n;
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    let jml = 0;
    for (let k = -radius; k <= radius; k++) jml += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x];
    out[y * W + x] = jml / n;
  }
  return out;
}

const alphaSubjek = lembutkan(subjek, 2);
const alphaBungaMentah = lembutkan(bungaBersih, 7);

const ramp = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));

function susun(pakaiBunga) {
  const out = Buffer.alloc(N * 4);
  for (let y = 0; y < H; y++) {
    // Tepi atas dan bawah bunga dilarutkan supaya potongannya tidak terlihat.
    // Bingkai lengkung di halaman memotong foto sekitar y=1122, jadi
    // bunganya harus sudah larut sebelum titik itu — bukan di tepi gambar.
    const fadeY = ramp(y, BUNGA_MULAI, BUNGA_MULAI + 70) * (1 - ramp(y, 1035, 1120));
    for (let x = 0; x < W; x++) {
      const p = y * W + x, i = p * 4;
      // Rangkaian bunga terpotong bingkai foto, jadi tepi kiri-kanan
      // dilarutkan juga. Opasitasnya ditahan supaya terbaca sebagai hiasan
      // lembut, bukan sebagai potongan yang gagal.
      const fadeX = ramp(x, 0, 70) * (1 - ramp(x, 790, 854));
      let a = alphaSubjek[p];
      if (pakaiBunga) a = Math.max(a, alphaBungaMentah[p] * fadeY * fadeX * 0.62);
      a = Math.min(1, Math.max(0, a));
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(KREM[c] + (P[i + c] - KREM[c]) * a);
      out[i + 3] = 255;
    }
  }
  return jpeg.encode({ data: out, width: W, height: H }, 88).data;
}

fs.writeFileSync('hasil-dengan-bunga.jpg', susun(true));
fs.writeFileSync('hasil-tanpa-bunga.jpg', susun(false));
console.log('hasil -> hasil-dengan-bunga.jpg, hasil-tanpa-bunga.jpg');
