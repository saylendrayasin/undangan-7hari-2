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
dev-server.js                server lokal untuk mencoba di komputer sendiri
vercel.json                  header cache
.env.example                 contoh environment variable
assets-src/                  file sumber, tidak ikut ter-deploy
```

Isi `assets-src/`:

| File | Keterangan |
|---|---|
| `foto-potong-asli.jpeg` | **foto yang dipakai sekarang** — sudah dipotong alat penghapus latar |
| `potong.mjs` | menghapus pola kotak transparansi dan menyusun ke bingkai 4:5 |
| `undangan-cetak.jpeg` | scan undangan cetak, acuan warna |
| `foto-studio-asli.jpeg`, `studio.mjs` | percobaan sebelumnya (latar studio abu) — arsip |
| `foto-almarhumah-asli.jpeg`, `foto-almarhumah-putih.jpg` | foto lama berbaju merah — arsip |
| `whiten.mjs`, `cutout.mjs` | skrip lama untuk foto merah — arsip |

Foto yang terpasang dibuat dengan:

```bash
npm i jpeg-js
node assets-src/potong.mjs        # -> potong-hasil.jpg
cp potong-hasil.jpg public/foto-almarhumah.jpg
```

**Cara kerjanya.** Foto sumber sudah bebas latar, tetapi pola kotak-kotak
penanda transparansi ikut tercetak menjadi piksel JPEG. Pola itu tidak bisa
dihapus lewat warna saja: kotak terangnya bernilai 255, sama persis dengan
baju putihnya.

Yang dipakai adalah **amplitudo polanya**. Di mana subjek menutupi, pola
meredup lalu hilang — jadi simpangan baku lokal berbanding lurus dengan
`1 - alpha`. Ini sekaligus menghasilkan tepi yang halus di rambut dan kain,
tanpa perlu menebak letak grid (yang memang tidak konsisten karena gambarnya
pernah diubah ukuran: periodenya 15,2 mendatar dan 15,9 tegak).

Warna tepi yang masih tercampur warna kotak dibatalkan dengan
`S = (I - (1-a)*C) / a`. Tanpa langkah itu tersisa garis abu tipis di siluet.

Setelan di bagian atas `potong.mjs`: `JENDELA` (ukuran jendela ukur),
`LARUT_MULAI` (tinggi mulai dilarutkan ke krem), dan `POTONG` (bingkai akhir).

### Hiasan bunga

Bunga di sekeliling bingkai lengkung adalah **SVG yang digambar tangan di
dalam `index.html`**, bukan gambar unduhan. Ada tiga rangkaian: besar di
tengah bawah, kecil di kiri atas, dan cerminannya di kanan atas.

Bentuk dasarnya didefinisikan sekali lalu dipakai ulang: `#mawar` (tiga lapis
kelopak), `#peoni`, `#bungaKecil` (berbenang sari), `#kuncup`, `#ranting`
(daun bulat gaya eukaliptus), dan `#daun`.

> Aset bunga siap pakai dari luar sempat dicoba — FreeSVG dan Wikimedia
> Commons. Yang berlisensi bebas dan bisa diunduh ternyata berupa ornamen Art
> Nouveau bergaris hitam tebal atau klipart datar; keduanya bertabrakan
> dengan nuansa emas-krem undangan ini. Menggambar sendiri juga membuat
> warnanya bisa persis mengikuti palet, tetap tajam di layar mana pun, dan
> ukurannya hanya beberapa kilobita.

Mengubahnya: `.portrait__bunga` untuk posisi dan ukuran, atau bentuk dasar
di bagian definisi SVG untuk rupa dan warnanya.

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

### 2. Sambungkan database

1. Buka project di dashboard Vercel → tab **Storage**.
2. **Create Database** → **Redis** → **Upstash**, atau **Connect Store** kalau
   sudah punya database Upstash dari project lain.
3. Pada langkah **Connect Project**, pilih project undangan ini.

Vercel mengisi sendiri env var-nya. **Tidak perlu menyalin apa pun.**

Boleh memakai awalan (*prefix*) saat menyambungkan — misalnya `takziah`,
sehingga variabelnya jadi `takziah_KV_REST_API_URL`. Kode sudah mengenali
awalan apa pun secara otomatis.

> **Paket Free Upstash umumnya hanya satu database per akun.** Kalau pilihan
> Free tidak muncul karena sudah terpakai project lain, sambungkan saja
> database yang sudah ada — semua kunci di proyek ini berawalan `takziah:`
> sehingga tidak bentrok dengan data project lain.

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

`api/doa.js` mengenali keempat nama berikut, dengan atau tanpa awalan:

| | |
|---|---|
| `KV_REST_API_URL` | `KV_REST_API_TOKEN` |
| `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_TOKEN` |

Jadi `takziah_KV_REST_API_URL` atau awalan lain juga terbaca. Token
`..._READ_ONLY_TOKEN` sengaja diabaikan karena tidak bisa menyimpan doa.

## Kalau database belum tersambung

Halaman tetap jalan normal. Form doa otomatis menyimpan ke `localStorage`
browser dan keterangan di bawah tombol berubah jadi *"Doa tersimpan di
perangkat ini"*. Setelah database tersambung, keterangannya menjadi *"Doa akan
tampil untuk semua tamu undangan"*.

## Halaman admin

Alamatnya: `https://NAMA-PROJECT.vercel.app/admin`
(`/admin.html` juga tetap bisa — otomatis diarahkan ke sana)

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
{
  "storage": "redis",
  "redisReachable": true,
  "adminEnabled": true,
  "nodeVersion": "v22.x",
  "fetchAvailable": true
}
```

Kalau `fetchAvailable` bernilai `false`, versi Node di Vercel terlalu lama.
Naikkan lewat **Settings → General → Node.js Version** (pilih 20 atau 22),
lalu redeploy.

## Perlindungan spam

Sudah termasuk di `api/doa.js`:

- maksimal **5 kiriman per IP tiap 5 menit** (balasan `429`)
- kolom umpan (*honeypot*) yang tak terlihat manusia, untuk menjaring bot
- batas panjang: nama 60 karakter, doa 600 karakter
- daftar disimpan maksimal 500 doa terakhir
- percobaan token admin dibatasi 10 kali per IP tiap 15 menit

## Sebelum deploy: satu hal yang perlu dicek

Preview WhatsApp memakai alamat lengkap yang ditulis di `public/index.html`:

```html
<meta property="og:url"   content="https://undangan-7hari-2.vercel.app/" />
<meta property="og:image" content="https://undangan-7hari-2.vercel.app/foto-almarhumah.jpg" />
```

Nilai itu ditulis sesuai nama repo, yang biasanya sama dengan domain bawaan
Vercel. **Kalau domain undangan ternyata berbeda, ganti kedua baris tersebut**
lalu deploy ulang — kalau tidak, foto tidak muncul saat tautan dibagikan.
Robot WhatsApp tidak menjalankan JavaScript, jadi ini tidak bisa diisi otomatis.

Cek hasilnya di [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/).

## Mengubah isi undangan

| Yang diubah | Lokasi |
|---|---|
| Nama, tanggal, tempat, penceramah | `public/index.html` (bagian `#acara`) |
| Tanggal & jam countdown / kalender | `EVENT_ISO` di `public/app.js` |
| Titik lokasi Google Maps | tombol *Lihat Lokasi* di `public/index.html` dan `MAPS_URL` di `public/app.js` |
| Judul / tempat / catatan di kalender | `EVENT_TITLE`, `EVENT_PLACE`, `EVENT_NOTE` di `public/app.js` |
| Lama acara di kalender | `EVENT_HOURS` di `public/app.js` |
| Alamat untuk preview WhatsApp | tiga baris `og:` di `<head>` `public/index.html` — **wajib alamat lengkap** |
| Foto | ganti `public/foto-almarhumah.jpg`; atur `object-position` di CSS `.portrait__inner img` bila posisi wajah bergeser |
| Latar foto | latar krem sudah menyatu di dalam file gambar (`#fffdf8`, sama dengan `--bg`). Jangan menambah `filter` pada `.portrait__inner img` — perubahan kontras sekecil apa pun memunculkan kotak samar di sekeliling foto |
| Teks share WhatsApp | fungsi `setupShare()` di `public/app.js` |

## Menjalankan di komputer sendiri

```bash
cp .env.example .env.local     # Windows: copy .env.example .env.local
node dev-server.js             # buka http://localhost:3000
```

Tidak perlu `npm install` dan tidak perlu internet. Kalau kredensial Upstash di
`.env.local` dikosongkan, `dev-server.js` memakai database tiruan di memori —
semua fitur tetap bisa dicoba, datanya hilang saat server dimatikan.

Isi `ADMIN_TOKEN` di `.env.local` untuk membuka `http://localhost:3000/admin.html`.
Token yang tampil di banner saat server menyala adalah token yang sedang aktif.

Ganti port: `node dev-server.js 4000`

Beberapa catatan saat mencoba di lokal:

- Batas kirim tetap berlaku: **5 doa per 5 menit**. Kalau kena `429`, tunggu
  5 menit atau hentikan lalu jalankan ulang server (data ikut kosong lagi).
- Buka `/api/doa?diag=1` untuk melihat env mana yang sudah terbaca.
- `dev-server.js` hanya untuk lokal. Vercel tidak memakainya sama sekali.

Kalau ingin memakai database Upstash sungguhan di lokal, salin nilainya dari
Vercel (**Storage** &rarr; nama database &rarr; `.env.local`) ke `.env.local`.
Bisa juga pakai `vercel dev` kalau Vercel CLI sudah terpasang.
