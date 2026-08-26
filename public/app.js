/* Undangan Takziah Hari Ke-7 — front-end behaviour.
   Countdown, calendar link, share actions, and the "Ucapan & Doa" guestbook.
   The guestbook talks to /api/doa (Upstash Redis). If that endpoint is not
   reachable or no database is connected yet, it degrades to localStorage so
   the page never looks broken to a guest. */
(function () {
  'use strict';

  var EVENT_ISO = '2026-08-29T19:30:00+08:00'; // 19.30 WITA
  var EVENT_AT = new Date(EVENT_ISO);
  var EVENT_HOURS = 2;
  var EVENT_END = new Date(EVENT_AT.getTime() + EVENT_HOURS * 3600 * 1000);
  var LOCAL_KEY = 'undangan-takziah-7-doa';

  var EVENT_TITLE = 'Takziah Hari Ke-7 Ibu Nurhaeda Yasin, SE';
  var EVENT_PLACE = 'Rumah Duka, Dusun 1 Desa Molibagu, Bolaang Uki';
  var EVENT_NOTE = 'Takziah dan doa bersama. Penceramah: Al Habib Umar Bin Toha Alhabsiy';
  var MAPS_URL = 'https://maps.app.goo.gl/VYpwPbzHdaEHzKU2A';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- Countdown ---------------- */

  var COUNTDOWN_UNITS = ['Hari', 'Jam', 'Menit', 'Detik'];
  var countdownValues = [];
  var countdownTimer = null;

  function buildCountdown() {
    var host = $('countdown');
    COUNTDOWN_UNITS.forEach(function (label) {
      var cell = document.createElement('div');
      cell.className = 'unit';
      var value = document.createElement('div');
      value.className = 'unit__value';
      value.textContent = '00';
      var caption = document.createElement('div');
      caption.className = 'unit__label';
      caption.textContent = label;
      cell.appendChild(value);
      cell.appendChild(caption);
      host.appendChild(cell);
      countdownValues.push(value);
    });
  }

  function tickCountdown() {
    var now = Date.now();
    var left = Math.max(0, EVENT_AT.getTime() - now);
    var s = Math.floor(left / 1000);
    var parts = [
      Math.floor(s / 86400),
      Math.floor((s % 86400) / 3600),
      Math.floor((s % 3600) / 60),
      s % 60
    ];
    parts.forEach(function (n, i) {
      var text = String(n).padStart(2, '0');
      if (countdownValues[i].textContent !== text) countdownValues[i].textContent = text;
    });

    // Setelah waktunya tiba, deretan angka nol tidak lagi berarti apa-apa —
    // ganti dengan keterangan yang sesuai keadaan.
    if (left > 0) return;
    var host = document.getElementById('countdown');
    var label = now < EVENT_END.getTime()
      ? 'Acara sedang berlangsung'
      : 'Acara telah selesai. Terima kasih atas doa dan kehadirannya.';
    if (host.getAttribute('data-state') === label) return;
    host.setAttribute('data-state', label);
    host.classList.add('countdown__done');
    host.textContent = label;
    clearInterval(countdownTimer);
  }

  /* ---------------- Calendar ---------------- */

  // Waktu UTC dengan format yang dipakai iCalendar dan Google Calendar.
  function stampUtc(d) {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function buildCalendar() {
    // Google Calendar terbuka langsung di aplikasi atau browser, tanpa perlu
    // mengunduh berkas — cara paling andal di HP, termasuk dari WhatsApp.
    $('gcal').href = 'https://calendar.google.com/calendar/render' +
      '?action=TEMPLATE' +
      '&text=' + encodeURIComponent(EVENT_TITLE) +
      '&dates=' + stampUtc(EVENT_AT) + '/' + stampUtc(EVENT_END) +
      '&details=' + encodeURIComponent(EVENT_NOTE + '\n\nLokasi: ' + MAPS_URL) +
      '&location=' + encodeURIComponent(EVENT_PLACE) +
      '&ctz=Asia/Makassar';
  }

  /* ---------------- Share ---------------- */

  function setupShare() {
    var url = location.href.split('#')[0];

    $('wa').href = 'https://wa.me/?text=' + encodeURIComponent(
      'Undangan Takziah Hari Ke-7 Almarhumah Ibu Nurhaeda Yasin, SE\n' +
      'Sabtu, 29 Agustus 2026 · 19.30 WITA\n' +
      'Rumah Duka, Dusun 1 Desa Molibagu\n\n' + url
    );

    var button = $('copy');
    var resetTimer;
    button.addEventListener('click', function () {
      var done = function () {
        button.textContent = 'Tautan tersalin';
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () { button.textContent = 'Salin Tautan'; }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done);
      } else {
        var helper = document.createElement('textarea');
        helper.value = url;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
        document.body.removeChild(helper);
        done();
      }
    });
  }

  /* ---------------- Guestbook ---------------- */

  var entries = [];
  var usingLocalFallback = false;

  function readLocal() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocal(list) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 200))); } catch (e) { /* quota or private mode */ }
  }

  function formatWhen(ts) {
    var d = new Date(ts || Date.now());
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderEntries() {
    var host = $('doa-list');
    host.textContent = '';

    if (!entries.length) {
      var empty = document.createElement('div');
      empty.className = 'doa__empty';
      empty.textContent = 'Belum ada doa yang dikirim. Silakan menjadi yang pertama.';
      host.appendChild(empty);
    } else {
      entries.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'doa-item';

        var head = document.createElement('div');
        head.className = 'doa-item__head';

        var name = document.createElement('div');
        name.className = 'doa-item__name';
        name.textContent = item.name || 'Tanpa Nama';

        var when = document.createElement('div');
        when.className = 'doa-item__when';
        when.textContent = formatWhen(item.ts);

        head.appendChild(name);
        head.appendChild(when);

        var text = document.createElement('div');
        text.className = 'doa-item__text';
        text.textContent = item.text;

        card.appendChild(head);
        card.appendChild(text);
        host.appendChild(card);
      });
    }

    $('doa-count').textContent = entries.length + ' doa & ucapan';
    $('doa-hint').textContent = entries.length > 2 ? 'Gulir untuk membaca' : '';
  }

  function setNote(message, isError) {
    var note = $('doa-note');
    note.textContent = message;
    note.classList.toggle('form__note--error', !!isError);
  }

  function storageNote() {
    return usingLocalFallback
      ? 'Doa tersimpan di perangkat ini'
      : 'Doa akan tampil untuk semua tamu undangan';
  }

  function switchToLocal() {
    usingLocalFallback = true;
    entries = readLocal();
  }

  function loadEntries() {
    return fetch('/api/doa', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.list)) {
          entries = data.list;
        } else {
          switchToLocal();
        }
      })
      .catch(function () {
        switchToLocal();
      })
      .then(function () {
        renderEntries();
        setNote(storageNote(), false);
      });
  }

  function submitEntry(event) {
    event.preventDefault();

    var nameInput = $('doa-name');
    var textInput = $('doa-text');
    var button = $('doa-submit');

    var name = nameInput.value.trim().slice(0, 60) || 'Tanpa Nama';
    var text = textInput.value.trim().slice(0, 600);

    if (!text) {
      setNote('Mohon tuliskan doa atau ucapan terlebih dahulu.', true);
      textInput.focus();
      return;
    }

    var payload = { name: name, text: text, website: $('doa-website').value };

    var addLocally = function () {
      switchToLocal();
      entries = [{ id: String(Date.now()), name: name, text: text, ts: Date.now() }].concat(entries);
      writeLocal(entries);
      renderEntries();
      setNote(storageNote(), false);
    };

    var finish = function () {
      button.disabled = false;
      button.textContent = 'Kirim Doa';
    };

    button.disabled = true;
    button.textContent = 'Mengirim…';
    setNote('Mengirim doa…', false);

    if (usingLocalFallback) {
      addLocally();
      nameInput.value = '';
      textInput.value = '';
      finish();
      return;
    }

    fetch('/api/doa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data }; });
      })
      .then(function (result) {
        var data = result.data || {};

        if (result.status === 429) {
          setNote(data.error || 'Terlalu banyak kiriman. Coba lagi nanti.', true);
          return;
        }
        if (!data.ok) {
          if (data.storage === 'none') {
            addLocally();
            nameInput.value = '';
            textInput.value = '';
            return;
          }
          setNote(data.error || 'Doa gagal dikirim. Coba lagi sebentar lagi.', true);
          return;
        }

        entries = Array.isArray(data.list) && data.list.length
          ? data.list
          : [{ id: '', name: name, text: text, ts: Date.now() }].concat(entries);
        nameInput.value = '';
        textInput.value = '';
        renderEntries();
        setNote('Terima kasih, doa Anda telah dikirim.', false);
        setTimeout(function () { setNote(storageNote(), false); }, 4000);
      })
      .catch(function () {
        addLocally();
        nameInput.value = '';
        textInput.value = '';
        setNote('Jaringan bermasalah. Doa disimpan di perangkat ini.', true);
      })
      .then(finish);
  }

  /* ---------------- Boot ---------------- */

  buildCountdown();
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 1000);
  buildCalendar();
  setupShare();

  $('doa-form').addEventListener('submit', submitEntry);
  loadEntries();
})();
