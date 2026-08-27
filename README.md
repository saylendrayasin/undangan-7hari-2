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
| `botani.mjs` | memotong kuntum mawar dari plat botani jadi PNG transparan |
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

Warna di pita tepi **tidak dihitung, melainkan diambil** dari piksel subjek
murni terdekat lalu dirambatkan ke luar. Membatalkan campuran secara hitungan
sempat dicoba dan gagal: nilai kotaknya berselang-seling 255 dan 191, sehingga
memakai rata-ratanya menyisakan rigi-rigi kecil sepanjang siluet, sedangkan
menebak petaknya kadang meleset dan menyisakan pinggiran terang. Dengan
mengambil warna dari subjek, tidak ada warna kotak yang mungkin tersisa —
yang melandai hanya alphanya.

Setelan di bagian atas `potong.mjs`: `JENDELA` (ukuran jendela ukur),
`LARUT_MULAI` (tinggi mulai dilarutkan ke krem), dan `POTONG` (bingkai akhir).

### Hiasan bunga

Ada satu rangkaian, di tengah bawah bingkai lengkung. Rangkaian itu
menggabungkan dua bahan:

| Bagian | Asal |
|---|---|
| Kuntum mawar putih (`public/hias-*.png`) | potongan dari plat botani domain publik |
| Tangkai dan dedaunan | vektor SVG di dalam `index.html` (`#ranting`, `#daun`) |

Alasannya: plat botani berisi spesimen tegak berduri yang tidak bisa disusun
menjadi ornamen, sedangkan vektor sulit menandingi keindahan kuntum aslinya.
Jadi masing-masing dipakai untuk bagian yang paling cocok.

**Sumber kuntum.** *Rosa alba — Rosier blanc*, dilukis P. Bessa, diukir
Gabriel; pindaian koleksi The New York Public Library lewat Wikimedia
Commons. **Domain publik**, bebas dipakai termasuk untuk keperluan komersial.
Berkas sumbernya tidak ikut disimpan di repo; unduh ulang bila perlu:

```bash
mkdir -p assets-src/unduh
curl -L -o assets-src/unduh/rosa-alba.jpg \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Fig._1._Rosa_alba_-_Rosier_blanc._Fig._Rosa_Pimpinellifolia_-_rosier_%C3%A0_feuilles_de_Pimprenelle._%28Alba_Semi-Plena%3B_White_Rose_of_York_-_Scotch_Rose%2C_Burnet_rose%29_%28NYPL_b14485031-1110812%29.tiff/lossy-page1-960px-thumbnail.tiff.jpg"

cd assets-src && npm i jpeg-js && node botani.mjs
```

`botani.mjs` memisahkan gambar dari kertas (kertasnya terang dan nyaris tanpa
warna, terang ~239 dan saturasi < 0,05), membuang bercak usia, menyelaraskan
warnanya ke palet undangan (`TURUN_SATURASI`, `TARIK_KE_KREM`), lalu menulis
PNG bertransparansi. Bagian mana yang dipotong diatur lewat `POTONGAN`.

Mengubah tata letaknya: `.bunga--bawah` untuk posisi dan ukuran, atau
`<image>` dan `<use>` di dalam rangkaian itu untuk susunannya.

> Aset bunga siap pakai juga sempat dicoba dari FreeSVG dan koleksi ornamen
> Wikimedia. Yang berlisensi bebas ternyata berupa ornamen Art Nouveau
> bergaris hitam tebal atau klipart datar, keduanya bertabrakan dengan nuansa
> emas-krem undangan ini. Plat botani di atas jauh lebih cocok.

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
