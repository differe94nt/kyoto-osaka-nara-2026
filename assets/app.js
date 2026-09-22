/* =====================================================================
 * 2026 京阪奈行程表 ── 互動邏輯
 *  - 晴天／雨天／全部 一鍵切換
 *  - 可替換行程模組（勾選即插入當天時間軸）
 *  - 自訂行程（直接在網頁上新增，存在瀏覽器）
 *  - 行前 Checklist 勾選狀態自動保存
 * 資料全部來自 data/itinerary.js 的 TRIP 物件。
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'jp2026.v1.';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---------- 小工具 ---------- */
  function load(k, dflt) {
    try { var v = localStorage.getItem(KEY + k); return v === null ? dflt : JSON.parse(v); }
    catch (e) { return dflt; }
  }
  function save(k, v) {
    try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* 私密瀏覽等情況忽略 */ }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mapURL(place) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place);
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }
  function todayISO() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- 狀態 ---------- */
  var state = {
    w: load('w', 'sun'),                 // 'sun' | 'rain' | 'both'
    checks: load('checks', {}),          // { checkboxId: true }
    extras: load('extras', null),        // { extraId: true/false }，null = 用資料檔預設
    custom: load('custom', [])           // 自訂行程
  };
  if (!state.extras) {
    state.extras = {};
    TRIP.extras.forEach(function (e) { state.extras[e.id] = !!e.on; });
  }

  /* ================= 頁首 ================= */
  function renderHero() {
    $('#heroTitle').textContent = TRIP.meta.title;
    $('#heroSub').textContent = TRIP.meta.subtitle + '｜' +
      TRIP.meta.start.replace(/-/g, '/') + ' – ' + TRIP.meta.end.replace(/-/g, '/');
    var d = daysBetween(todayISO(), TRIP.meta.start);
    var el = $('#countdown');
    if (d > 0) el.textContent = '距離出發還有 ' + d + ' 天';
    else if (d === 0) el.textContent = '今天出發！一路順風 ✈️';
    else if (daysBetween(todayISO(), TRIP.meta.end) >= 0) el.textContent = '旅程進行中 · 第 ' + (1 - d) + ' 天';
    else el.textContent = '旅程已結束，歡迎回家 🏠';
    document.title = TRIP.meta.title + '｜' + TRIP.meta.subtitle;
  }

  /* ================= 航班 / 住宿 / 交通 ================= */
  function renderInfo() {
    $('#flights').innerHTML = TRIP.flights.map(function (f) {
      return '<div class="card flight card-pad">' +
        '<div class="dir">' + esc(f.dir) + '　<span style="color:var(--muted);font-weight:600">' + esc(f.date) + '</span></div>' +
        '<div class="route">' + esc(f.from) + '</div>' +
        '<div class="route">↓　' + esc(f.to) + '</div>' +
        '<div class="note"><b>' + esc(f.line) + '</b>　' + esc(f.note) + '</div>' +
        '</div>';
    }).join('');

    $('#stays').innerHTML = '<div class="card card-pad">' + TRIP.stays.map(function (s) {
      return '<div class="kv"><b>' + esc(s.when) + '</b><span><b style="font-weight:700">' + esc(s.name) +
        '</b><br><span class="note" style="margin:0">' + esc(s.note) + '</span></span></div>';
    }).join('') + '</div>';

    $('#transit').innerHTML = '<div class="card card-pad">' + TRIP.transit.map(function (t) {
      return '<div class="kv"><b>' + esc(t.route) + '</b><span>' + esc(t.how) +
        '<br><span class="note" style="margin:0">' + esc(t.time) + '</span></span></div>';
    }).join('') + '</div>';

    $('#emergency').innerHTML = '<div class="card card-pad"><div class="em">' + TRIP.emergency.map(function (e) {
      return '<a href="tel:' + esc(e.value.replace(/[^0-9+]/g, '')) + '"><b>' + esc(e.label) + '</b>' + esc(e.value) + '</a>';
    }).join('') + '</div></div>';
  }

  /* ================= Checklist ================= */
  function renderChecklist() {
    var html = '', n = 0;
    TRIP.tickets.forEach(function (t, i) {
      html += chkRow('tk' + i, t.label, t.note);
      n++;
    });
    var ticketBlock = '<div class="cl-cat">0. 出發前必須先線上訂好</div>' + html;

    var rest = '';
    TRIP.checklist.forEach(function (g, gi) {
      rest += '<div class="cl-cat">' + esc(g.cat) + '</div>';
      g.items.forEach(function (it, ii) { rest += chkRow('c' + gi + '_' + ii, it, ''); n++; });
    });

    $('#checklist').innerHTML = ticketBlock + rest;
    $('#clTotal').textContent = n;
    bindChecks();
    updateProgress();
  }
  function chkRow(id, label, note) {
    var on = !!state.checks[id];
    return '<label class="chk"><input type="checkbox" data-chk="' + id + '"' + (on ? ' checked' : '') +
      '><span>' + esc(label) + (note ? '<small>' + esc(note) + '</small>' : '') + '</span></label>';
  }
  function bindChecks() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-chk]'), function (box) {
      box.addEventListener('change', function () {
        if (box.checked) state.checks[box.dataset.chk] = true;
        else delete state.checks[box.dataset.chk];
        save('checks', state.checks);
        updateProgress();
      });
    });
  }
  function updateProgress() {
    var all = document.querySelectorAll('[data-chk]').length;
    var done = document.querySelectorAll('[data-chk]:checked').length;
    $('#clDone').textContent = done;
    $('#clBar').style.width = all ? (done / all * 100) + '%' : '0';
  }

  /* ================= 每日行程 ================= */
  function itemsForDay(day) {
    var list = day.items.slice();
    TRIP.extras.forEach(function (e) {
      if (e.day === day.id && state.extras[e.id]) {
        list.push({ t: e.t, time: e.time, title: e.title, desc: e.desc, tag: e.tag,
                    w: e.w || 'all', place: e.place, tips: e.tips, extra: true });
      }
    });
    state.custom.forEach(function (c) {
      if (c.day === day.id) {
        list.push({ t: c.t, title: c.title, desc: c.desc, tag: c.tag || '景點', w: 'all', custom: c.id });
      }
    });
    return list.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
  }

  function visible(it) {
    return state.w === 'both' || it.w === 'all' || it.w === state.w;
  }

  function renderDays() {
    var today = todayISO();
    $('#days').innerHTML = TRIP.days.map(function (day) {
      var isToday = day.date === today;
      var list = itemsForDay(day).filter(visible);

      var rows = list.map(function (it) {
        var badges = '';
        if (it.tag) badges += '<span class="tag tag-' + esc(it.tag) + '">' + esc(it.tag) + '</span>';
        if (it.w === 'sun')  badges += '<span class="wmark sun">☀️ 晴天限定</span>';
        if (it.w === 'rain') badges += '<span class="wmark rain">🌧️ 雨天方案</span>';
        if (it.extra)  badges += '<span class="wmark plus">＋ 加選</span>';
        if (it.custom) badges += '<span class="wmark plus">＋ 自訂</span>';
        if (it.place)  badges += '<a class="map" target="_blank" rel="noopener" href="' + mapURL(it.place) + '">📍 地圖</a>';
        if (it.custom) badges += '<button class="del" data-del="' + esc(it.custom) + '" title="刪除">✕</button>';

        return '<li>' +
          '<div class="time">' + esc(it.time || it.t) + '</div>' +
          '<div class="body">' +
            '<div class="meta">' + badges + '</div>' +
            '<div class="ttl">' + esc(it.title) + '</div>' +
            (it.desc ? '<div class="desc">' + esc(it.desc) + '</div>' : '') +
            (it.tips && it.tips.length ? '<ul class="tips">' + it.tips.map(function (x) {
              return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
          '</div></li>';
      }).join('');

      var noteTxt = state.w === 'both'
        ? '☀️ ' + (day.note.sun || '') + '　／　🌧️ ' + (day.note.rain || '')
        : (state.w === 'sun' ? '☀️ ' + (day.note.sun || '') : '🌧️ ' + (day.note.rain || ''));

      return '<div class="card day-card' + (isToday ? ' is-today' : '') + '" id="' + day.id + '">' +
        '<div class="day-head">' +
          '<div class="no">DAY ' + day.no + '　' + esc(day.label) + (isToday ? '<span class="today-flag">TODAY</span>' : '') + '</div>' +
          '<h3>' + day.emoji + '　' + esc(day.title) + '</h3>' +
          '<div class="sub">' + esc(day.summary) + '　·　' + esc(day.base) + '</div>' +
        '</div>' +
        '<p class="day-note">' + esc(noteTxt) + '</p>' +
        '<ul class="tl">' + rows + '</ul>' +
        '<div class="add-row">' +
          '<button class="add-btn" data-add="' + day.id + '">＋ 在這天加一個自己的行程</button>' +
          '<div class="addform" data-form="' + day.id + '" hidden>' +
            '<input type="time" data-f="t" value="15:00">' +
            '<input type="text" data-f="title" placeholder="行程名稱，例如：寶可夢中心">' +
            '<input type="text" data-f="desc" placeholder="備註（選填）">' +
            '<div class="row"><button class="tool" data-save="' + day.id + '">加入行程</button>' +
            '<button class="tool" data-cancel="' + day.id + '">取消</button></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    $('#daynav').innerHTML = TRIP.days.map(function (d) {
      return '<a href="#' + d.id + '" class="' + (d.date === today ? 'today' : '') + '">D' + d.no + ' ' + esc(d.label.slice(0, 4)) + '</a>';
    }).join('');

    bindDayButtons();
  }

  function bindDayButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-add]'), function (b) {
      b.addEventListener('click', function () {
        var f = document.querySelector('[data-form="' + b.dataset.add + '"]');
        f.hidden = !f.hidden;
        if (!f.hidden) f.querySelector('[data-f="title"]').focus();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cancel]'), function (b) {
      b.addEventListener('click', function () {
        document.querySelector('[data-form="' + b.dataset.cancel + '"]').hidden = true;
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-save]'), function (b) {
      b.addEventListener('click', function () {
        var dayId = b.dataset.save;
        var f = document.querySelector('[data-form="' + dayId + '"]');
        var title = f.querySelector('[data-f="title"]').value.trim();
        if (!title) { f.querySelector('[data-f="title"]').focus(); return; }
        state.custom.push({
          id: 'u' + Date.now(),
          day: dayId,
          t: f.querySelector('[data-f="t"]').value || '12:00',
          title: title,
          desc: f.querySelector('[data-f="desc"]').value.trim()
        });
        save('custom', state.custom);
        renderDays();
        var el = document.getElementById(dayId);
        if (el) el.scrollIntoView({ block: 'nearest' });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () {
        state.custom = state.custom.filter(function (c) { return c.id !== b.dataset.del; });
        save('custom', state.custom);
        renderDays();
      });
    });
  }

  /* ================= 可替換模組 ================= */
  function renderSwap() {
    var dayName = {};
    TRIP.days.forEach(function (d) { dayName[d.id] = 'DAY ' + d.no; });

    $('#swap').innerHTML = TRIP.extras.map(function (e) {
      var on = !!state.extras[e.id];
      return '<label class="swap-item' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" data-ex="' + esc(e.id) + '"' + (on ? ' checked' : '') + '>' +
        '<span><span class="st"><span class="pill">' + esc(dayName[e.day] || '') + ' ' + esc(e.t) + '</span>' + esc(e.title) + '</span>' +
        '<span class="sd">' + esc(e.desc) + '</span>' +
        (e.why ? '<span class="sw"><b>取捨：</b>' + esc(e.why) + '</span>' : '') +
        '</span></label>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('[data-ex]'), function (box) {
      box.addEventListener('change', function () {
        state.extras[box.dataset.ex] = box.checked;
        save('extras', state.extras);
        box.closest('.swap-item').classList.toggle('on', box.checked);
        renderDays();
      });
    });
  }

  /* ================= 天氣切換 ================= */
  function setWeather(w) {
    state.w = w;
    save('w', w);
    document.body.dataset.w = w;
    $('#wSun').setAttribute('aria-pressed', w === 'sun');
    $('#wRain').setAttribute('aria-pressed', w === 'rain');
    $('#wBoth').setAttribute('aria-pressed', w === 'both');
    renderDays();
  }

  /* ================= 啟動 ================= */
  function init() {
    renderHero();
    renderInfo();
    renderChecklist();
    renderSwap();
    $('#wSun').addEventListener('click', function () { setWeather('sun'); });
    $('#wRain').addEventListener('click', function () { setWeather('rain'); });
    $('#wBoth').addEventListener('click', function () { setWeather('both'); });
    setWeather(state.w);

    $('#btnPrint').addEventListener('click', function () { window.print(); });
    $('#btnReset').addEventListener('click', function () {
      if (!confirm('確定要清除所有勾選、加選與自訂行程，回到預設狀態嗎？')) return;
      ['w', 'checks', 'extras', 'custom'].forEach(function (k) { localStorage.removeItem(KEY + k); });
      location.reload();
    });
    $('#btnToday').addEventListener('click', function () {
      var t = todayISO(), d = null;
      TRIP.days.forEach(function (x) { if (x.date === t) d = x; });
      if (!d) { alert('今天不在旅程期間內（' + TRIP.meta.start + ' ～ ' + TRIP.meta.end + '）'); return; }
      document.getElementById(d.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
