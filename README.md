# Undangan Takziah Hari Ke-7 — Ibu Nurhaeda Yasin, SE

Undangan digital satu halaman, siap deploy ke Vercel. Bagian **Untaian Doa &
Ucapan** disimpan di database (Upstash Redis) sehingga doa dari semua tamu
tampil untuk semua orang, bukan hanya di HP masing-masing.

## Isi proyek

```
public/index.html            halaman undangan (HTML + CSS, tanpa build step)
public/app.js                countdown, tombol kalender, share, form doa
public/admin.html            halaman admin untuk menghapus doa
public/foto-almarhumah.jpg   foto yang tampil di undangan
api/doa.js                   API buku tamu (Vercel Serverless Function)
vercel.json                  header cache
assets-src/                  file sumber, tidak ikut ter-deploy
```

Isi `assets-src/`:

| File | Keterangan |
|---|---|
| `foto-almarhumah-asli.jpeg` | foto asli (baju & hijab merah) |
| `undangan-cetak.jpeg` | scan undangan cetak, jadi acuan warna |
| `whiten.mjs` | skrip yang mengubah baju & hijab merah jadi putih |

`public/foto-almarhumah.jpg` adalah hasil `whiten.mjs`. Kalau perlu diulang atau
disetel ulang:

```bash
npm i jpeg-js
node assets-src/whiten.mjs assets-src/foto-almarhumah-asli.jpeg public/foto-almarhumah.jpg mask.jpg
```

Argumen ke-4 opsional: menghasilkan pratinjau area yang diputihkan (ditandai
cyan) untuk mengecek kalau ada bagian yang kena padahal tidak seharusnya.

Tidak ada `npm install`, tidak ada framework, tidak ada backend terpisah.
`api/doa.js` memanggil Upstash lewat REST API biasa, jadi Vercel bisa langsung
build tanpa konfigurasi apa pun.

## Cara deploy (± 5 menit)

### 1. Upload proyek ke Vercel

Pilih salah satu:

**Lewat website** — push folder ini ke GitHub, lalu di
[vercel.com/new](https://vercel.com/new) pilih repo-nya dan klik **Deploy**.
Semua setelan biarkan default (Framework Preset: *Other*).

**Lewat terminal** —

```bash
npm i -g vercel
vercel        # deploy preview
vercel --prod # deploy ke domain utama
```

Setelah ini undangan sudah bisa dibuka. Form doa juga sudah jalan, hanya saja
doa masih tersimpan di HP masing-masing tamu — lanjut ke langkah 2 supaya
tersimpan bersama.

### 2. Sambungkan database (gratis)

1. Buka project di dashboard Vercel → tab **Storage** → **Create Database**.
2. Pilih **Upstash → Redis**, ikuti sampai selesai (paket gratis cukup).
3. Pada langkah **Connect Project**, pilih project undangan ini.

Vercel otomatis menambahkan `KV_REST_API_URL` dan `KV_REST_API_TOKEN` ke
project. **Tidak perlu menyalin apa pun secara manual.**

> Panduan deploy lengkap langkah demi langkah lewat UI Vercel (tanpa terminal),
> berikut daftar cek dan solusi masalah, tersedia sebagai halaman terpisah:
> https://claude.ai/code/artifact/8f36d055-6a9e-4857-b6e2-61e4c80b20c4

### 3. Redeploy

Tab **Deployments** → deployment paling atas → menu `⋯` → **Redeploy**.
Ini perlu supaya function membaca env var yang baru.

Selesai. Buka halaman, kirim satu doa percobaan, lalu buka dari HP lain —
doa yang sama harus muncul di sana juga.

## Kalau tidak mau pakai Vercel Storage

Bisa juga daftar langsung di [upstash.com](https://upstash.com) (gratis), buat
database Redis, salin **REST URL** dan **REST Token**, lalu masukkan sebagai
Environment Variables di Vercel:

```
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxx
```

Keduanya sama-sama dikenali oleh `api/doa.js`.

## Kalau database belum tersambung

Halaman tetap jalan normal. Form doa otomatis menyimpan ke `localStorage`
browser dan keterangan di bawah tombol berubah jadi *"Doa tersimpan di
perangkat ini"*. Setelah database tersambung, keterangannya menjadi *"Doa akan
tampil untuk semua tamu undangan"*.

## Halaman admin

Alamatnya: `https://NAMA-PROJECT.vercel.app/admin.html`

Untuk mengaktifkannya, tambahkan Environment Variable `ADMIN_TOKEN` di Vercel
(isi token acak yang panjang), lalu **redeploy**. Buka halaman admin, masukkan
token, dan semua doa tampil lengkap dengan tombol **Hapus**.

- Token hanya tersimpan selama tab terbuka (`sessionStorage`), tidak permanen.
- Salah token **10 kali** membuat IP tersebut terkunci **15 menit**.
- Halaman ditandai `noindex`, jadi tidak muncul di hasil pencarian Google.
- Tanpa `ADMIN_TOKEN`, halaman admin dan endpoint DELETE selalu ditolak.

Kalau lebih suka lewat terminal:

```bash
curl -X DELETE https://NAMA-PROJECT.vercel.app/api/doa \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ISI_ADMIN_TOKEN" \
  -d '{"id":"ID_DOA"}'
```

`id` bisa dilihat dari `https://NAMA-PROJECT.vercel.app/api/doa`.

## Cek kondisi deployment

Buka `https://NAMA-PROJECT.vercel.app/api/doa?diag=1`. Hasilnya menunjukkan
environment variable mana yang terbaca, apakah Redis bisa dihubungi, dan apakah
mode admin aktif. Yang ditampilkan hanya nama variabel dan status `true`/`false`
— **nilai token tidak pernah ditampilkan**.

```json
{ "storage": "redis", "redisReachable": true, "adminEnabled": true, ... }
```

## Perlindungan spam

Sudah termasuk di `api/doa.js`:

- maksimal **5 kiriman per IP tiap 5 menit** (balasan `429`)
- kolom umpan (*honeypot*) yang tak terlihat manusia, untuk menjaring bot
- batas panjang: nama 60 karakter, doa 600 karakter
- daftar disimpan maksimal 500 doa terakhir
- percobaan token admin dibatasi 10 kali per IP tiap 15 menit

## Mengubah isi undangan

| Yang diubah | Lokasi |
|---|---|
| Nama, tanggal, tempat, penceramah | `public/index.html` (bagian `#acara`) |
| Tanggal & jam countdown / kalender | `EVENT_ISO` di `public/app.js` |
| Titik lokasi Google Maps | link *Lihat Lokasi* di `public/index.html` |
| Foto | ganti `public/foto-almarhumah.jpg`; atur `object-position` di CSS `.portrait__inner img` bila posisi wajah bergeser |
| Teks share WhatsApp | fungsi `setupShare()` di `public/app.js` |

## Menjalankan di komputer sendiri

```bash
npm i -g vercel
vercel dev
```

Buka http://localhost:3000. Tanpa env var Upstash, form doa memakai mode
`localStorage` seperti dijelaskan di atas.
