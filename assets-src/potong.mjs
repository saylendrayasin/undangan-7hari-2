// Foto sumbernya sudah dipotong rapi oleh alat penghapus latar, tetapi pola
// kotak-kotak penanda transparansi ikut tercetak menjadi piksel JPEG.
// Skrip ini mengenali pola itu dan menggantinya dengan krem halaman.
//
// Kuncinya dikerjakan per-sel 16x16, bukan per piksel: kotak terang bernilai
// 255, sama persis dengan baju putihnya. Yang membedakan hanyalah polanya —
// di atas baju, sel yang seharusnya gelap tetap putih, sehingga selnya gagal
// disebut latar.
import jpeg from 'jpeg-js';
import fs from 'fs';

const BASE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const img = jpeg.decode(fs.readFileSync(BASE + 'assets-src/foto-potong-asli.jpeg'), { useTArray: true });
const W = img.width, H = img.height, D = img.data;
const N = W * H;

const SEL = 16;                 // sisi satu kotak
const TERANG = 255, GELAP = 191;
const KREM = [255, 253, 248];

const lum = new Float32Array(N);
for (let p = 0; p < N; p++) {
  const i = p * 4;
  lum[p] = 0.299 * D[i] + 0.587 * D[i + 1] + 0.114 * D[i + 2];
}

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


/* ---------- 1. ukur amplitudo pola ----------
   Gagasannya: di mana subjek menutupi, pola kotak meredup lalu hilang.
   Jadi simpangan baku lokal berbanding lurus dengan (1 - alpha):
   penuh di latar, nol di badan, dan bernilai antara tepat di tepi rambut
   atau kain. Ini sekaligus memberi tepi yang halus, tanpa perlu menebak
   letak grid — yang memang tidak konsisten karena gambarnya pernah
   diubah ukuran.

   Jendela 17x17 dipakai supaya selalu mencakup satu periode penuh
   (periode kotaknya sekitar 15,2 x 15,9 piksel). */
const JENDELA = 8;               // radius, jadi sisi 17

// Integral image supaya simpangan baku bisa dihitung sekali jalan.
const iw = W + 1;
const jml = new Float64Array(iw * (H + 1));
const jml2 = new Float64Array(iw * (H + 1));
for (let y = 0; y < H; y++) {
  let barisJml = 0, barisJml2 = 0;
  for (let x = 0; x < W; x++) {
    const v = lum[y * W + x];
    barisJml += v; barisJml2 += v * v;
    jml[(y + 1) * iw + x + 1] = jml[y * iw + x + 1] + barisJml;
    jml2[(y + 1) * iw + x + 1] = jml2[y * iw + x + 1] + barisJml2;
  }
}
const kotakJml = (a, x0, y0, x1, y1) =>
  a[y1 * iw + x1] - a[y0 * iw + x1] - a[y1 * iw + x0] + a[y0 * iw + x0];

const sd = new Float32Array(N);
const SISI = JENDELA * 2 + 1;
for (let y = 0; y < H; y++) {
  // Di dekat tepi gambar jendelanya digeser ke dalam, bukan dipotong.
  // Jendela terpotong bisa jatuh seluruhnya di dalam satu kotak sehingga
  // simpangan bakunya nol dan latar salah dikira subjek.
  const y0 = Math.min(Math.max(0, y - JENDELA), H - SISI), y1 = y0 + SISI;
  for (let x = 0; x < W; x++) {
    const x0 = Math.min(Math.max(0, x - JENDELA), W - SISI), x1 = x0 + SISI;
    const n = (x1 - x0) * (y1 - y0);
    const m = kotakJml(jml, x0, y0, x1, y1) / n;
    const m2 = kotakJml(jml2, x0, y0, x1, y1) / n;
    sd[y * W + x] = Math.sqrt(Math.max(0, m2 - m * m));
  }
}

// Nilai acuan diambil dari pojok yang pasti latar.
const contoh = [];
for (let y = 4; y < 80; y += 2) for (let x = 4; x < 80; x += 2) contoh.push(sd[y * W + x]);
contoh.sort((a, b) => a - b);
const SD_LATAR = contoh[contoh.length >> 1];

const mulus = (t, a, b) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

const alphaMentah = new Float32Array(N);
for (let p = 0; p < N; p++) alphaMentah[p] = Math.min(1, Math.max(0, 1 - sd[p] / SD_LATAR));

/* ---------- 2. tentukan latar yang tersambung ke tepi ----------
   Wajah, kacamata, dan lipatan kain juga bervariasi, jadi tidak semua
   nilai rendah berarti latar. Hanya yang tersambung ke tepi gambar
   yang dihitung sebagai latar. */
const latar = new Uint8Array(N);
{
  const q = new Int32Array(N);
  let k = 0, e = 0;
  // Ambangnya ketat: hanya pola kotak beramplitudo hampir penuh yang
  // dianggap latar. Kalau dilonggarkan, perambatan menyusup lewat tepi
  // berdetail (kacamata, lipatan kain) dan melubangi wajah.
  const semai = (p) => { if (!latar[p] && alphaMentah[p] < 0.12) { latar[p] = 1; q[e++] = p; } };
  for (let x = 0; x < W; x++) { semai(x); semai((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { semai(y * W); semai(y * W + W - 1); }
  while (k < e) {
    const p = q[k++];
    const x = p % W, y = (p / W) | 0;
    if (x > 0) semai(p - 1);
    if (x < W - 1) semai(p + 1);
    if (y > 0) semai(p - W);
    if (y < H - 1) semai(p + W);
  }
}

function lembutkanF(src, radius) {
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

/* ---------- 3. susun alpha akhir ---------- */
// Pita ketidakpastian: hanya di sekitar latar alpha lembut dipakai.
// Di luar itu subjek dianggap penuh, supaya wajah dan kacamata tidak
// ikut menjadi tembus pandang.
const dekatLatar = morph(latar, JENDELA + 3, 'dilate');

const alpha = new Float32Array(N);
for (let p = 0; p < N; p++) {
  if (latar[p]) alpha[p] = 0;
  else if (dekatLatar[p]) alpha[p] = mulus(alphaMentah[p], 0.26, 0.86);
  else alpha[p] = 1;
}

// Buang bercak latar yang terlewat: hanya gumpalan terbesar yang dipakai.
{
  const padat = new Uint8Array(N);
  for (let p = 0; p < N; p++) padat[p] = alpha[p] > 0.5 ? 1 : 0;
  const label = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  let terbaik = -1, terbesar = 0;
  for (let mulai = 0; mulai < N; mulai++) {
    if (!padat[mulai] || label[mulai] !== -1) continue;
    let k = 0, e = 0, n = 0;
    q[e++] = mulai; label[mulai] = mulai;
    while (k < e) {
      const pp = q[k++]; n++;
      const x = pp % W, y = (pp / W) | 0;
      const t = [];
      if (x > 0) t.push(pp - 1);
      if (x < W - 1) t.push(pp + 1);
      if (y > 0) t.push(pp - W);
      if (y < H - 1) t.push(pp + W);
      for (const r of t) if (padat[r] && label[r] === -1) { label[r] = mulai; q[e++] = r; }
    }
    if (n > terbesar) { terbesar = n; terbaik = mulai; }
  }
  for (let p = 0; p < N; p++) if (padat[p] && label[p] !== terbaik) alpha[p] = 0;
  // Bercak dengan alpha separuh tidak masuk hitungan gumpalan, jadi apa pun
  // yang jauh dari badan ikut dinolkan.
  const inti = new Uint8Array(N);
  for (let p = 0; p < N; p++) inti[p] = (padat[p] && label[p] === terbaik) ? 1 : 0;
  const dekatBadan = morph(inti, 14, 'dilate');
  for (let p = 0; p < N; p++) if (!dekatBadan[p]) alpha[p] = 0;
}

// Lembutkan tepi supaya menyatu dengan krem halaman. Kain putihnya hanya
// belasan tingkat lebih gelap daripada latar, jadi peralihan satu piksel
// pun sudah terbaca sebagai garis. Bagian dalam bernilai satu rata sehingga
// tidak terpengaruh; yang berubah hanya pita tepinya.
{
  const halus = lembutkanF(alpha, 3);
  for (let p = 0; p < N; p++) alpha[p] = halus[p];
}

let luas = 0, atas = H, bawah = -1, kiri = W, kanan = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 0.5) {
  luas++;
  if (y < atas) atas = y;
  if (y > bawah) bawah = y;
  if (x < kiri) kiri = x;
  if (x > kanan) kanan = x;
}
console.log(JSON.stringify({
  dimensi: W + 'x' + H,
  sdLatar: +SD_LATAR.toFixed(1),
  persenSubjek: +(luas / N * 100).toFixed(1),
  kotak: { atas, bawah, kiri, kanan }
}, null, 1));

/* ---------- 4. gabungkan ke krem ----------
   Piksel di pita tepi adalah campuran subjek dengan warna kotak, jadi
   warnanya tidak bisa dipakai apa adanya. Membatalkan campuran secara
   hitungan juga tidak bisa diandalkan: nilai kotaknya berselang-seling
   255 dan 191, dan salah menebak petak menyisakan rigi-rigi atau
   pinggiran terang di sekeliling badan.

   Karena itu warna di pita tepi tidak dihitung, melainkan DIAMBIL dari
   piksel subjek murni terdekat lalu dirambatkan ke luar. Dengan begitu
   tidak ada warna kotak yang mungkin tersisa; yang melandai hanya
   alphanya, sehingga tepinya larut bersih ke krem halaman. */
const warnaSubjek = new Float32Array(N * 3);
const tahu = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (alpha[p] > 0.9) {
    tahu[p] = 1;
    for (let c = 0; c < 3; c++) warnaSubjek[p * 3 + c] = D[p * 4 + c];
  }
}

{
  let depan = [];
  for (let p = 0; p < N; p++) if (tahu[p]) depan.push(p);
  const JANGKAUAN = JENDELA + 8;
  for (let putaran = 0; putaran < JANGKAUAN && depan.length; putaran++) {
    const berikut = [];
    for (const p of depan) {
      const x = p % W, y = (p / W) | 0;
      const tetangga = [];
      if (x > 0) tetangga.push(p - 1);
      if (x < W - 1) tetangga.push(p + 1);
      if (y > 0) tetangga.push(p - W);
      if (y < H - 1) tetangga.push(p + W);
      for (const q of tetangga) {
        if (tahu[q] || alpha[q] <= 0) continue;
        tahu[q] = 2;
        for (let c = 0; c < 3; c++) warnaSubjek[q * 3 + c] = warnaSubjek[p * 3 + c];
        berikut.push(q);
      }
    }
    depan = berikut;
  }
}

const ramp = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
const LARUT_MULAI = Number(process.env.LARUT || 1000);
const LARUT_SELESAI = Number(process.env.LARUT_AKHIR || 1112);

const rata = Buffer.alloc(N * 4);
for (let y = 0; y < H; y++) {
  const larut = 1 - ramp(y, LARUT_MULAI, LARUT_SELESAI);
  for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4;
    const ef = alpha[p] * larut;
    for (let c = 0; c < 3; c++) {
      const S = tahu[p] ? warnaSubjek[p * 3 + c] : D[i + c];
      rata[i + c] = Math.round(KREM[c] + (S - KREM[c]) * ef);
    }
    rata[i + 3] = 255;
  }
}

/* ---------- 6. susun ke bingkai 4:5 ---------- */
const KW = 900, KH = 1125;
const POTONG = {
  x: Number(process.env.PX || -77),
  y: Number(process.env.PY || 40),
  w: Number(process.env.PW || 864),
  h: Number(process.env.PH || 1080)
};

function ambil(sx, sy, c) {
  if (sx < 0 || sx >= W || sy < 0 || sy >= H) return KREM[c];
  return rata[(sy * W + sx) * 4 + c];
}

const kanvas = Buffer.alloc(KW * KH * 4);
for (let y = 0; y < KH; y++) {
  const sy = POTONG.y + (y + 0.5) * POTONG.h / KH - 0.5;
  const y0 = Math.floor(sy), fy = sy - y0;
  for (let x = 0; x < KW; x++) {
    const sx = POTONG.x + (x + 0.5) * POTONG.w / KW - 0.5;
    const x0 = Math.floor(sx), fx = sx - x0;
    const di = (y * KW + x) * 4;
    for (let c = 0; c < 3; c++) {
      const a = ambil(x0, y0, c) * (1 - fx) + ambil(x0 + 1, y0, c) * fx;
      const b = ambil(x0, y0 + 1, c) * (1 - fx) + ambil(x0 + 1, y0 + 1, c) * fx;
      kanvas[di + c] = Math.round(a * (1 - fy) + b * fy);
    }
    kanvas[di + 3] = 255;
  }
}
fs.writeFileSync('potong-hasil.jpg', jpeg.encode({ data: kanvas, width: KW, height: KH }, 90).data);

const pra = Buffer.alloc(N * 4);
for (let p = 0; p < N; p++) {
  const i = p * 4, a = alpha[p];
  pra[i] = Math.round(D[i] * a);
  pra[i + 1] = Math.round(D[i + 1] * a + 190 * (1 - a));
  pra[i + 2] = Math.round(D[i + 2] * a + 190 * (1 - a));
  pra[i + 3] = 255;
}
fs.writeFileSync('potong-mask.jpg', jpeg.encode({ data: pra, width: W, height: H }, 78).data);
console.log('-> potong-hasil.jpg (' + KW + 'x' + KH + '), potong-mask.jpg');
