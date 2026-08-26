/* Server lokal untuk mencoba undangan di komputer sendiri.
 *
 *   node dev-server.js          -> http://localhost:3000
 *   node dev-server.js 4000     -> ganti port
 *
 * Membaca .env.local kalau ada. Kalau kredensial Upstash belum diisi, server
 * memakai database tiruan di memori supaya semuanya tetap bisa dicoba tanpa
 * koneksi internet. Data di memori hilang saat server dimatikan.
 *
 * File ini hanya untuk keperluan lokal. Vercel tidak memakainya sama sekali.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 3000);

/* ---------- baca .env.local ---------- */

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return 0;
  let count = 0;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value) return;
    process.env[key] = value;
    count++;
  });
  return count;
}

const envCount = loadEnvFile(path.join(ROOT, '.env.local'));

/* ---------- database tiruan (dipakai kalau Upstash belum diisi) ---------- */

const memory = new Map();
const expiry = new Map(); // kunci -> waktu kedaluwarsa (ms)

// Masa berlaku ditegakkan sungguhan supaya rate limit di lokal berperilaku
// sama seperti di Upstash: hitungannya reset sendiri setelah jendela waktunya
// lewat, bukan menempel sampai server dimatikan.
function dropIfExpired(key) {
  const at = expiry.get(key);
  if (at !== undefined && Date.now() >= at) {
    memory.delete(key);
    expiry.delete(key);
  }
}

function runCommand(cmd) {
  const op = String(cmd[0]).toUpperCase();
  const key = cmd[1];

  if (key !== undefined) dropIfExpired(key);

  switch (op) {
    case 'PING':
      return 'PONG';
    case 'GET':
      return memory.has(key) ? String(memory.get(key)) : null;
    case 'DEL': {
      expiry.delete(key);
      return memory.delete(key) ? 1 : 0;
    }
    case 'INCR': {
      const next = Number(memory.get(key) || 0) + 1;
      memory.set(key, next);
      return next;
    }
    case 'EXPIRE': {
      if (!memory.has(key)) return 0;
      expiry.set(key, Date.now() + Number(cmd[2]) * 1000);
      return 1;
    }
    case 'LPUSH': {
      const list = memory.get(key) || [];
      list.unshift.apply(list, cmd.slice(2));
      memory.set(key, list);
      return list.length;
    }
    case 'LTRIM': {
      const list = memory.get(key) || [];
      memory.set(key, list.slice(Number(cmd[2]), Number(cmd[3]) + 1));
      return 'OK';
    }
    case 'LRANGE': {
      const list = memory.get(key) || [];
      return list.slice(Number(cmd[2]), Number(cmd[3]) + 1);
    }
    case 'LREM': {
      const list = memory.get(key) || [];
      const at = list.indexOf(cmd[3]);
      if (at >= 0) list.splice(at, 1);
      memory.set(key, list);
      return at >= 0 ? 1 : 0;
    }
    default:
      throw new Error('perintah belum didukung di mode lokal: ' + op);
  }
}

const hasRealRedis = Boolean(
  (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
  (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
);

let stub = null;

function startStub() {
  return new Promise(function (resolve) {
    stub = http.createServer(function (req, res) {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', function () {
        res.setHeader('Content-Type', 'application/json');
        try {
          const commands = JSON.parse(body);
          res.end(JSON.stringify(commands.map(function (cmd) {
            return { result: runCommand(cmd) };
          })));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err.message || err) }));
        }
      });
    });
    stub.listen(0, '127.0.0.1', function () {
      const url = 'http://127.0.0.1:' + stub.address().port;
      process.env.KV_REST_API_URL = url;
      process.env.KV_REST_API_TOKEN = 'local-dev';
      resolve();
    });
  });
}

/* ---------- server ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const PUBLIC_DIR = path.join(ROOT, 'public');

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  // ".html" boleh dihilangkan: /admin sama dengan /admin.html
  let file = path.join(PUBLIC_DIR, rel);
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';

  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolved, function (err, data) {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<h1>404</h1><p>Halaman tidak ditemukan. Coba <a href="/">/</a> atau <a href="/admin.html">/admin.html</a>.</p>');
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(resolved)] || 'application/octet-stream');
    res.end(data);
  });
}

function handleApi(req, res) {
  const handler = require(path.join(ROOT, 'api', 'doa.js'));
  const chunks = [];
  req.on('data', function (chunk) { chunks.push(chunk); });
  req.on('end', function () {
    // Vercel menaruh body JSON di req.body; tiru perilaku itu.
    if (chunks.length) {
      try {
        req.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (e) {
        req.body = {};
      }
    }
    res.status = function (code) { res.statusCode = code; return res; };
    res.json = function (payload) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    };
    Promise.resolve(handler(req, res)).catch(function (err) {
      console.error('[api/doa]', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: 'Kesalahan server lokal.' }));
      }
    });
  });
}

function start() {
  http.createServer(function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/doa') {
      handleApi(req, res);
    } else {
      serveStatic(req, res, url.pathname);
    }
  }).listen(PORT, function () {
    const base = 'http://localhost:' + PORT;
    const admin = process.env.ADMIN_TOKEN;

    console.log('');
    console.log('  Undangan Takziah — server lokal');
    console.log('  ' + '-'.repeat(52));
    console.log('  Undangan   ' + base + '/');
    console.log('  Admin      ' + base + '/admin.html');
    console.log('  Diagnosa   ' + base + '/api/doa?diag=1');
    console.log('');
    console.log('  Database   ' + (hasRealRedis
      ? 'Upstash (dari .env.local)'
      : 'tiruan di memori — data hilang saat server dimatikan'));
    console.log('  Token admin ' + (admin
      ? admin
      : 'BELUM DIISI — set ADMIN_TOKEN di .env.local'));
    console.log('  .env.local ' + (envCount
      ? envCount + ' variabel dimuat'
      : 'tidak ada / kosong'));
    console.log('');
    console.log('  Tekan Ctrl+C untuk berhenti.');
    console.log('');
  });
}

if (hasRealRedis) {
  start();
} else {
  startStub().then(start);
}
