// Guestbook "Ucapan & Doa" — Vercel Serverless Function.
// Storage: Upstash Redis over its REST API (no npm dependencies, so Vercel
// builds this with zero configuration).
//
// Env vars — either pair works:
//   KV_REST_API_URL        / KV_REST_API_TOKEN          (Vercel Marketplace: Upstash)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (Upstash console)
//
// Without them the API reports storage:"none" and the page falls back to
// localStorage, so the invitation still works before the database is wired up.

const LIST_KEY = 'takziah:doa';
const MAX_ENTRIES = 500;
const MAX_RETURNED = 200;
const NAME_MAX = 60;
const TEXT_MAX = 600;
const RATE_LIMIT = 5; // submissions per IP...
const RATE_WINDOW = 300; // ...per 5 minutes
const ADMIN_FAIL_LIMIT = 10; // wrong admin tokens per IP...
const ADMIN_FAIL_WINDOW = 900; // ...per 15 minutes

function credentials() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

async function pipeline(creds, commands) {
  const res = await fetch(creds.url + '/pipeline', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + creds.token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error('Upstash ' + res.status + ': ' + JSON.stringify(body));
  }
  return body.map(function (entry) {
    if (entry && entry.error) throw new Error('Upstash: ' + entry.error);
    return entry ? entry.result : null;
  });
}

async function redis(creds, command) {
  const results = await pipeline(creds, [command]);
  return results[0];
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || 'unknown';
}

// Strip control characters and collapse runs of blank lines.
function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function parseEntry(raw) {
  try {
    const item = JSON.parse(raw);
    if (!item || typeof item.text !== 'string') return null;
    return {
      id: typeof item.id === 'string' ? item.id : '',
      name: typeof item.name === 'string' ? item.name : 'Tanpa Nama',
      text: item.text,
      ts: typeof item.ts === 'number' ? item.ts : 0
    };
  } catch (e) {
    return null;
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return {}; }
}

// Returns null when the caller is a valid admin, otherwise the response to
// send. Wrong tokens are counted per IP so the token cannot be brute-forced.
async function denyAdmin(req, creds) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return { status: 503, body: { ok: false, adminDisabled: true, error: 'Mode admin belum aktif. Tambahkan environment variable ADMIN_TOKEN di Vercel, lalu redeploy.' } };
  }

  const failKey = 'takziah:adminfail:' + clientIp(req);
  const fails = Number(await redis(creds, ['GET', failKey]) || 0);
  if (fails >= ADMIN_FAIL_LIMIT) {
    return { status: 429, body: { ok: false, error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' } };
  }

  const given = req.headers['x-admin-token'];
  if (typeof given !== 'string' || given !== expected) {
    const n = await redis(creds, ['INCR', failKey]);
    if (Number(n) === 1) await redis(creds, ['EXPIRE', failKey, String(ADMIN_FAIL_WINDOW)]);
    return { status: 401, body: { ok: false, error: 'Token admin salah.' } };
  }

  await redis(creds, ['DEL', failKey]);
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const creds = credentials();

  // Deployment self-check. Reports which credential env vars the function can
  // see — names and booleans only, never a value.
  if (req.method === 'GET' && /[?&]diag=1(&|$)/.test(req.url || '')) {
    const names = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'ADMIN_TOKEN'];
    const envFound = {};
    names.forEach(function (n) { envFound[n] = Boolean(process.env[n]); });

    let redisOk = false;
    let redisError = null;
    if (creds) {
      try {
        redisOk = (await redis(creds, ['PING'])) === 'PONG';
      } catch (err) {
        redisError = String(err.message || err).slice(0, 200);
      }
    }
    res.status(200).json({
      ok: true,
      storage: creds ? 'redis' : 'none',
      envFound: envFound,
      redisReachable: redisOk,
      redisError: redisError,
      adminEnabled: Boolean(process.env.ADMIN_TOKEN)
    });
    return;
  }

  if (!creds) {
    res.status(200).json({
      ok: false,
      storage: 'none',
      list: [],
      message: 'Database belum dihubungkan. Doa disimpan sementara di perangkat ini.'
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      // An x-admin-token header means the admin page is asking; it must be
      // valid, so a bad token fails loudly instead of silently showing the
      // public view.
      const wantsAdmin = typeof req.headers['x-admin-token'] === 'string';
      if (wantsAdmin) {
        const denied = await denyAdmin(req, creds);
        if (denied) {
          res.status(denied.status).json(denied.body);
          return;
        }
      }
      const raws = await redis(creds, ['LRANGE', LIST_KEY, '0', String(MAX_ENTRIES - 1)]);
      const all = (raws || []).map(parseEntry).filter(Boolean);
      const list = wantsAdmin ? all : all.slice(0, MAX_RETURNED);
      res.status(200).json({ ok: true, storage: 'redis', admin: wantsAdmin, total: all.length, list: list });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      // Honeypot: bots fill every field they find, humans never see this one.
      if (clean(body.website, 100)) {
        res.status(200).json({ ok: true, storage: 'redis', skipped: true, list: [] });
        return;
      }

      const text = clean(body.text, TEXT_MAX);
      if (!text) {
        res.status(400).json({ ok: false, error: 'Doa atau ucapan tidak boleh kosong.' });
        return;
      }
      const name = clean(body.name, NAME_MAX) || 'Tanpa Nama';

      const rateKey = 'takziah:rate:' + clientIp(req);
      const hits = await redis(creds, ['INCR', rateKey]);
      if (Number(hits) === 1) await redis(creds, ['EXPIRE', rateKey, String(RATE_WINDOW)]);
      if (Number(hits) > RATE_LIMIT) {
        res.status(429).json({ ok: false, error: 'Terlalu banyak kiriman. Coba lagi beberapa menit lagi.' });
        return;
      }

      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        name: name,
        text: text,
        ts: Date.now()
      };

      const results = await pipeline(creds, [
        ['LPUSH', LIST_KEY, JSON.stringify(entry)],
        ['LTRIM', LIST_KEY, '0', String(MAX_ENTRIES - 1)],
        ['LRANGE', LIST_KEY, '0', String(MAX_RETURNED - 1)]
      ]);
      const list = (results[2] || []).map(parseEntry).filter(Boolean);

      res.status(201).json({ ok: true, storage: 'redis', entry: entry, list: list });
      return;
    }

    // Moderation: only enabled when ADMIN_TOKEN is set in the Vercel project.
    if (req.method === 'DELETE') {
      const denied = await denyAdmin(req, creds);
      if (denied) {
        res.status(denied.status).json(denied.body);
        return;
      }
      const body = await readBody(req);
      const id = clean(body.id, 64);
      if (!id) {
        res.status(400).json({ ok: false, error: 'id wajib diisi.' });
        return;
      }
      const raws = await redis(creds, ['LRANGE', LIST_KEY, '0', String(MAX_ENTRIES - 1)]);
      const target = (raws || []).find(function (raw) {
        const item = parseEntry(raw);
        return item && item.id === id;
      });
      if (!target) {
        res.status(404).json({ ok: false, error: 'Doa tidak ditemukan.' });
        return;
      }
      await redis(creds, ['LREM', LIST_KEY, '1', target]);
      res.status(200).json({ ok: true, removed: id });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (err) {
    console.error('[api/doa]', err);
    res.status(500).json({ ok: false, error: 'Gagal menghubungi database.' });
  }
};
