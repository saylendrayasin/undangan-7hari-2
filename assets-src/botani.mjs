// Memotong dua rangkaian mawar putih dari plat botani domain publik
// (Rosa alba, P. Bessa / Gabriel, koleksi NYPL) menjadi PNG bertransparansi.
//
// Kertasnya terang dan nyaris tanpa warna (terang ~239, saturasi < 0,05),
// sedangkan kelopak, daun, dan tangkai selalu lebih gelap atau lebih
// berwarna. Satu aturan sederhana sudah memisahkannya; sisanya tinggal
// membuang bercak usia pada kertas dan melembutkan tepinya.
import jpeg from 'jpeg-js';
import zlib from 'zlib';
import fs from 'fs';

const SUMBER = process.env.SUMBER || 'unduh/rosa-alba.jpg';
const asli = jpeg.decode(fs.readFileSync(SUMBER), { useTArray: true });

// Tepi buku yang gelap menyentuh pinggir pindaian. Kalau ikut diproses,
// tidak ada titik kertas di pinggir untuk memulai pengisian rongga dan
// seluruh gambar dikira isi. Jadi dipotong dulu ke area kertasnya.
const KERTAS = { x: 60, y: 120, w: 830, h: 1330 };
const W = KERTAS.w, H = KERTAS.h, N = W * H;
const D = new Uint8Array(N * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const si = ((KERTAS.y + y) * asli.width + (KERTAS.x + x)) * 4;
    const di = (y * W + x) * 4;
    D[di] = asli.data[si]; D[di + 1] = asli.data[si + 1];
    D[di + 2] = asli.data[si + 2]; D[di + 3] = 255;
  }
}

const AMBANG_TERANG = 222;
const AMBANG_SATURASI = 0.09;
const BERCAK_MIN = 900;      // bercak usia pada kertas lebih kecil dari ini

/* ---------- 1. pisahkan gambar dari kertas ---------- */
const isi = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  const i = p * 4;
  const r = D[i], g = D[i + 1], b = D[i + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx ? (mx - mn) / mx : 0;
  isi[p] = (lum < AMBANG_TERANG || sat > AMBANG_SATURASI) ? 1 : 0;
}

function komponen(src, minimal, simpanSemua) {
  const label = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  const daftar = [];
  for (let mulai = 0; mulai < N; mulai++) {
    if (!src[mulai] || label[mulai] !== -1) continue;
    let k = 0, e = 0;
    q[e++] = mulai; label[mulai] = mulai;
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    while (k < e) {
      const p = q[k++];
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      const t = [];
      if (x > 0) t.push(p - 1);
      if (x < W - 1) t.push(p + 1);
      if (y > 0) t.push(p - W);
      if (y < H - 1) t.push(p + W);
      for (const r of t) if (src[r] && label[r] === -1) { label[r] = mulai; q[e++] = r; }
    }
    daftar.push({ akar: mulai, ukuran: e, x0, x1, y0, y1 });
  }
  const simpan = new Set(daftar.filter(c => c.ukuran >= minimal).map(c => c.akar));
  const out = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (src[p] && simpan.has(label[p])) out[p] = 1;
  return simpanSemua ? { mask: out, daftar, label } : out;
}

// Bercak usia pada kertas adalah gumpalan kecil terpisah -> dibuang.
let bersih = komponen(isi, BERCAK_MIN);

// Rongga di dalam kelopak (sorotan putih terang) dikembalikan.
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
bersih = isiLubang(bersih);

/* ---------- 2. alpha lembut ---------- */
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
const alpha = lembutkan(bersih, 1);

/* ---------- 3. selaraskan warna lalu tulis PNG ----------
   Warna asli platnya hijau tua pekat dan bertabrakan dengan palet
   emas-krem undangan. Jadi saturasinya diturunkan dan seluruh warna
   ditarik sedikit ke arah krem hangat, sehingga hiasan ini terbaca
   sebagai bagian dari undangan, bukan tempelan.

   Bentuknya harus PNG bertransparansi: kalau latarnya krem penuh,
   perseginya akan menutup garis emas bingkai dan terlihat sebagai kotak. */
const KREM = [255, 253, 248];
const TURUN_SATURASI = 0.66;   // 1 = warna asli, 0 = abu
const TARIK_KE_KREM = 0.12;    // seberapa jauh ditarik ke krem

function selaraskan(r, g, b) {
  const abu = 0.299 * r + 0.587 * g + 0.114 * b;
  let keluar = [
    abu + (r - abu) * TURUN_SATURASI,
    abu + (g - abu) * TURUN_SATURASI,
    abu + (b - abu) * TURUN_SATURASI
  ];
  return keluar.map((v, i) => v + (KREM[i] - v) * TARIK_KE_KREM);
}

const tabelCrc = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = tabelCrc[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const bagian = (jenis, data) => {
  const pj = Buffer.alloc(4); pj.writeUInt32BE(data.length);
  const t = Buffer.from(jenis, 'latin1');
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([pj, t, data, c]);
};

function tulis(nama, x0, y0, lebar, tinggi, lebarTarget) {
  const skala = lebarTarget / lebar;
  const TW = Math.round(lebar * skala), TH = Math.round(tinggi * skala);

  const ambil = (sx, sy) => {
    const x = Math.min(W - 1, Math.max(0, x0 + sx));
    const y = Math.min(H - 1, Math.max(0, y0 + sy));
    const p = y * W + x;
    const a = Math.min(1, Math.max(0, alpha[p]));
    const w = selaraskan(D[p * 4], D[p * 4 + 1], D[p * 4 + 2]);
    // dikali alpha dulu supaya pengecilan tidak menarik warna dari luar tepi
    return [w[0] * a, w[1] * a, w[2] * a, a];
  };

  const baris = Buffer.alloc(TH * (TW * 4 + 1));
  for (let y = 0; y < TH; y++) {
    baris[y * (TW * 4 + 1)] = 0;
    const sy = (y + 0.5) / skala - 0.5;
    const y1 = Math.floor(sy), fy = sy - y1;
    for (let x = 0; x < TW; x++) {
      const sx = (x + 0.5) / skala - 0.5;
      const x1 = Math.floor(sx), fx = sx - x1;
      const di = y * (TW * 4 + 1) + 1 + x * 4;
      const c = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const a = ambil(x1, y1)[k] * (1 - fx) + ambil(x1 + 1, y1)[k] * fx;
        const b = ambil(x1, y1 + 1)[k] * (1 - fx) + ambil(x1 + 1, y1 + 1)[k] * fx;
        c[k] = a * (1 - fy) + b * fy;
      }
      const a = c[3];
      for (let k = 0; k < 3; k++) {
        baris[di + k] = a > 0.004 ? Math.min(255, Math.max(0, Math.round(c[k] / a))) : 0;
      }
      baris[di + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(TW, 0); ihdr.writeUInt32BE(TH, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    bagian('IHDR', ihdr),
    bagian('IDAT', zlib.deflateSync(baris, { level: 9 })),
    bagian('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(nama, png);
  console.log('  ' + nama, TW + 'x' + TH, Math.round(png.length / 1024) + ' KB');
}

/* ---------- 4. potong dua rangkaian ---------- */
const POTONGAN = JSON.parse(process.env.POTONGAN || JSON.stringify([
  { nama: 'hias-mawar.png', x: 150, y: 142, w: 470, h: 560, lebar: 300 },
  { nama: 'hias-ranting.png', x: 60, y: 700, w: 330, h: 380, lebar: 210 }
]));

let luas = 0;
for (let p = 0; p < N; p++) luas += bersih[p];
console.log('gambar terpisah dari kertas:', +(luas / N * 100).toFixed(1) + '% piksel');
for (const c of POTONGAN) tulis(c.nama, c.x, c.y, c.w, c.h, c.lebar);
