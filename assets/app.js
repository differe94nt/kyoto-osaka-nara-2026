/* =====================================================================
 * 2026 京阪奈行程表 ── 互動邏輯
 *  分頁 1 行程：晴天／雨天切換、可替換模組、自訂行程
 *  分頁 2 資訊：行前 Checklist、航班、住宿、交通、緊急聯絡
 *  分頁 3 分帳：日幣匯率換算、代墊紀錄、自動結算
 * 行程內容全部來自 data/itinerary.js 的 TRIP 物件。
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'jp2026.v1.';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

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
  function num(n) { return Math.round(n).toLocaleString('en-US'); }
  function yen(n) { return '¥' + num(n); }
  function ntd(n) { return 'NT$' + num(n); }

  /* ---------- 狀態 ---------- */
  var PEOPLE = (TRIP.meta && TRIP.meta.people) || 4;
  var defaultMembers = ['我'];
  for (var i = 2; i <= PEOPLE; i++) defaultMembers.push('成員 ' + i);

  var state = {
    tab: load('tab', 'plan'),
    w: load('w', 'sun'),
    checks: load('checks', {}),
    extras: load('extras', null),
    custom: load('custom', []),
    members: load('members', defaultMembers),
    expenses: load('expenses', []),
    fx: load('fx', { rate: 0.21, at: '', src: '預設值' }),
    fxManual: load('fxManual', null)   // 手動指定時為數字，否則 null
  };
  if (!state.extras) {
    state.extras = {};
    TRIP.extras.forEach(function (e) { state.extras[e.id] = !!e.on; });
  }
  function rate() { return state.fxManual != null ? state.fxManual : state.fx.rate; }
  function toJPY(amount, cur) { return cur === 'TWD' ? amount / rate() : amount; }

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

  /* ================= 分頁 ================= */
  function setTab(name) {
    state.tab = name;
    save('tab', name);
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === name); });
    $$('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== name; });
    $('#weatherBar').hidden = name !== 'plan';
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  /* ================= 航班 / 住宿 / 交通 / 緊急 ================= */
  function renderInfo() {
    $('#flights').innerHTML = TRIP.flights.map(function (f) {
      return '<div class="card flight card-pad">' +
        '<div class="dir">' + esc(f.dir) + '　<span style="color:var(--muted);font-weight:600">' + esc(f.date) + '</span></div>' +
        '<div class="route">' + esc(f.from) + '</div>' +
        '<div class="route">↓　' + esc(f.to) + '</div>' +
        '<div class="note"><b>' + esc(f.line) + '</b>　' + esc(f.note) + '</div>' +
        '</div>';
    }).join('');

    $('#stays').innerHTML = TRIP.stays.map(function (s) {
      var access = (s.access || []).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');
      var warn = (s.warn || []).map(function (w) { return '<div class="stay-warn">' + esc(w) + '</div>'; }).join('');
      return '<div class="card">' +
        '<div class="stay-head">' + esc(s.when) + '</div>' +
        '<div class="card-pad">' +
          '<div class="stay-name">' + esc(s.name) + (s.stars ? ' <span class="stars">' + esc(s.stars) + '</span>' : '') + '</div>' +
          (s.nameJa ? '<div class="stay-ja">' + esc(s.nameJa) + '</div>' : '') +
          '<div class="kv"><b>地址</b><span>' + esc(s.addr) +
            (s.map ? ' <a class="map" target="_blank" rel="noopener" href="' + mapURL(s.map) + '">📍 地圖</a>' : '') +
            (s.addrEn ? '<br><span class="note" style="margin:0">' + esc(s.addrEn) + '</span>' : '') + '</span></div>' +
          '<div class="kv"><b>入住退房</b><span>' + esc(s.inout) + '</span></div>' +
          (access ? '<div class="kv"><b>交通</b><span><ul class="stay-ul">' + access + '</ul></span></div>' : '') +
          (s.near ? '<div class="kv"><b>周邊</b><span>' + esc(s.near) + '</span></div>' : '') +
          (s.note ? '<p class="note">' + esc(s.note) + '</p>' : '') + warn +
        '</div></div>';
    }).join('');

    $('#transit').innerHTML = '<div class="card card-pad">' + TRIP.transit.map(function (t) {
      return '<div class="kv kv-wide"><b>' + esc(t.route) + '</b><span>' + esc(t.how) +
        '<br><span class="note" style="margin:0">' + esc(t.time) + '</span></span></div>';
    }).join('') + '</div>';

    $('#emergency').innerHTML = '<div class="card card-pad"><div class="em">' + TRIP.emergency.map(function (e) {
      return '<a href="tel:' + esc(e.value.replace(/[^0-9+]/g, '')) + '"><b>' + esc(e.label) + '</b>' + esc(e.value) + '</a>';
    }).join('') + '</div></div>';
  }

  /* ================= Checklist ================= */
  function renderChecklist() {
    var html = '', n = 0;
    TRIP.tickets.forEach(function (t, i) { html += chkRow('tk' + i, t.label, t.note); n++; });
    var out = '<div class="cl-cat">0. 出發前必須先線上訂好</div>' + html;
    TRIP.checklist.forEach(function (g, gi) {
      out += '<div class="cl-cat">' + esc(g.cat) + '</div>';
      g.items.forEach(function (it, ii) { out += chkRow('c' + gi + '_' + ii, it, ''); n++; });
    });
    $('#checklist').innerHTML = out;
    $('#clTotal').textContent = n;
    $$('[data-chk]').forEach(function (box) {
      box.addEventListener('change', function () {
        if (box.checked) state.checks[box.dataset.chk] = true;
        else delete state.checks[box.dataset.chk];
        save('checks', state.checks);
        updateProgress();
      });
    });
    updateProgress();
  }
  function chkRow(id, label, note) {
    return '<label class="chk"><input type="checkbox" data-chk="' + id + '"' + (state.checks[id] ? ' checked' : '') +
      '><span>' + esc(label) + (note ? '<small>' + esc(note) + '</small>' : '') + '</span></label>';
  }
  function updateProgress() {
    var all = $$('[data-chk]').length, done = $$('[data-chk]:checked').length;
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
      if (c.day === day.id) list.push({ t: c.t, title: c.title, desc: c.desc, tag: c.tag || '景點', w: 'all', custom: c.id });
    });
    return list.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
  }
  function visible(it) { return state.w === 'both' || it.w === 'all' || it.w === state.w; }

  function renderDays() {
    var today = todayISO();
    $('#days').innerHTML = TRIP.days.map(function (day) {
      var isToday = day.date === today;
      var rows = itemsForDay(day).filter(visible).map(function (it) {
        var badges = '';
        if (it.tag) badges += '<span class="tag tag-' + esc(it.tag) + '">' + esc(it.tag) + '</span>';
        if (it.w === 'sun')  badges += '<span class="wmark sun">☀️ 晴天限定</span>';
        if (it.w === 'rain') badges += '<span class="wmark rain">🌧️ 雨天方案</span>';
        if (it.extra)  badges += '<span class="wmark plus">＋ 加選</span>';
        if (it.custom) badges += '<span class="wmark plus">＋ 自訂</span>';
        if (it.place)  badges += '<a class="map" target="_blank" rel="noopener" href="' + mapURL(it.place) + '">📍 地圖</a>';
        if (it.custom) badges += '<button class="del" data-del="' + esc(it.custom) + '" title="刪除">✕</button>';
        return '<li><div class="time">' + esc(it.time || it.t) + '</div><div class="body">' +
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
        '</div></div>';
    }).join('');

    $('#daynav').innerHTML = TRIP.days.map(function (d) {
      return '<a href="#' + d.id + '" class="' + (d.date === today ? 'today' : '') + '">D' + d.no + ' ' + esc(d.label.slice(0, 4)) + '</a>';
    }).join('');
    bindDayButtons();
  }

  function bindDayButtons() {
    $$('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = $('[data-form="' + b.dataset.add + '"]');
        f.hidden = !f.hidden;
        if (!f.hidden) f.querySelector('[data-f="title"]').focus();
      });
    });
    $$('[data-cancel]').forEach(function (b) {
      b.addEventListener('click', function () { $('[data-form="' + b.dataset.cancel + '"]').hidden = true; });
    });
    $$('[data-save]').forEach(function (b) {
      b.addEventListener('click', function () {
        var dayId = b.dataset.save, f = $('[data-form="' + dayId + '"]');
        var title = f.querySelector('[data-f="title"]').value.trim();
        if (!title) { f.querySelector('[data-f="title"]').focus(); return; }
        state.custom.push({ id: 'u' + Date.now(), day: dayId, t: f.querySelector('[data-f="t"]').value || '12:00',
                            title: title, desc: f.querySelector('[data-f="desc"]').value.trim() });
        save('custom', state.custom);
        renderDays();
        var el = document.getElementById(dayId);
        if (el) el.scrollIntoView({ block: 'nearest' });
      });
    });
    $$('[data-del]').forEach(function (b) {
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
    $$('[data-ex]').forEach(function (box) {
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

  /* =====================================================================
   *  匯率換算
   * ===================================================================== */
  var FX_SOURCES = [
    { url: 'https://open.er-api.com/v6/latest/JPY',
      pick: function (d) { return d && d.rates && d.rates.TWD; },
      when: function (d) { return (d.time_last_update_utc || '').slice(5, 16); }, name: 'open.er-api.com' },
    { url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.json',
      pick: function (d) { return d && d.jpy && d.jpy.twd; },
      when: function (d) { return d.date || ''; }, name: 'currency-api' }
  ];

  function fetchRate(idx) {
    idx = idx || 0;
    if (idx >= FX_SOURCES.length) { renderFX('抓不到即時匯率，沿用上次的數字'); return; }
    var src = FX_SOURCES[idx];
    $('#fxMeta').textContent = '更新中…';
    fetch(src.url, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var v = src.pick(d);
        if (!v) throw new Error('no rate');
        state.fx = { rate: v, at: src.when(d) || todayISO(), src: src.name };
        save('fx', state.fx);
        renderFX();
      })
      .catch(function () { fetchRate(idx + 1); });
  }

  function renderFX(errMsg) {
    var r = rate();
    $('#fxHead').textContent = (r * 1000).toFixed(0);
    $('#fxMeta').textContent = state.fxManual != null
      ? '手動匯率 1 JPY = ' + state.fxManual + ' TWD'
      : (errMsg ? '⚠️ ' + errMsg + '（' + (state.fx.at || '—') + '）'
                : '即時匯率 · ' + (state.fx.at || '—') + ' · ' + (state.fx.src || ''));
    if (document.activeElement !== $('#fxJPY') && document.activeElement !== $('#fxTWD')) {
      var j = parseFloat($('#fxJPY').value);
      if (!isNaN(j)) $('#fxTWD').value = (j * r).toFixed(1);
    }
    renderExpenses();
  }

  function bindFX() {
    $('#fxJPY').addEventListener('input', function () {
      var v = parseFloat(this.value);
      $('#fxTWD').value = isNaN(v) ? '' : (v * rate()).toFixed(1);
    });
    $('#fxTWD').addEventListener('input', function () {
      var v = parseFloat(this.value);
      $('#fxJPY').value = isNaN(v) ? '' : (v / rate()).toFixed(0);
    });
    $('#fxReload').addEventListener('click', function () { fetchRate(0); });
    $('#fxManual').checked = state.fxManual != null;
    $('#fxManualRow').hidden = state.fxManual == null;
    if (state.fxManual != null) $('#fxManualVal').value = state.fxManual;
    $('#fxManual').addEventListener('change', function () {
      $('#fxManualRow').hidden = !this.checked;
      if (!this.checked) { state.fxManual = null; save('fxManual', null); renderFX(); }
      else { $('#fxManualVal').value = $('#fxManualVal').value || state.fx.rate.toFixed(4); $('#fxManualVal').focus(); }
    });
    $('#fxManualSave').addEventListener('click', function () {
      var v = parseFloat($('#fxManualVal').value);
      if (isNaN(v) || v <= 0) { $('#fxManualVal').focus(); return; }
      state.fxManual = v; save('fxManual', v); renderFX();
    });
  }

  /* =====================================================================
   *  分帳
   * ===================================================================== */
  function renderMembers() {
    $('#members').innerHTML = state.members.map(function (m, i) {
      return '<label>成員 ' + (i + 1) + '<input type="text" data-mem="' + i + '" value="' + esc(m) + '" maxlength="12"></label>';
    }).join('');
    $$('[data-mem]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        state.members[+inp.dataset.mem] = inp.value.trim() || ('成員 ' + (+inp.dataset.mem + 1));
        save('members', state.members);
        renderPayerOptions(); renderSharers(); renderExpenses();
      });
    });
    renderPayerOptions(); renderSharers();
  }

  function renderPayerOptions() {
    var sel = $('#expPayer'), cur = sel.value;
    sel.innerHTML = state.members.map(function (m, i) {
      return '<option value="' + i + '">' + esc(m) + '</option>';
    }).join('');
    sel.value = cur && cur < state.members.length ? cur : '0';
  }

  var shareSel = null;   // 目前勾選的分攤者
  function renderSharers() {
    if (!shareSel || shareSel.length !== state.members.length) {
      shareSel = state.members.map(function () { return true; });
    }
    $('#expShare').innerHTML = state.members.map(function (m, i) {
      return '<label class="' + (shareSel[i] ? 'on' : '') + '"><input type="checkbox" data-sh="' + i + '"' +
        (shareSel[i] ? ' checked' : '') + '>' + esc(m) + '</label>';
    }).join('');
    $$('[data-sh]').forEach(function (b) {
      b.addEventListener('change', function () {
        shareSel[+b.dataset.sh] = b.checked;
        b.closest('label').classList.toggle('on', b.checked);
        updateShareCount();
      });
    });
    updateShareCount();
  }
  function updateShareCount() {
    var n = shareSel.filter(Boolean).length;
    $('#shareCount').textContent = n ? '除以 ' + n + ' 人' : '請至少勾一個人';
    $('#expAdd').disabled = n === 0;
  }

  function addExpense() {
    var title = $('#expTitle').value.trim();
    var amount = parseFloat($('#expAmount').value);
    if (!title) { $('#expTitle').focus(); return; }
    if (isNaN(amount) || amount <= 0) { $('#expAmount').focus(); return; }
    var share = [];
    shareSel.forEach(function (on, i) { if (on) share.push(i); });
    if (!share.length) return;
    state.expenses.push({
      id: 'e' + Date.now(), title: title, amount: amount,
      cur: $('#expCur').value, payer: +$('#expPayer').value, share: share, at: todayISO()
    });
    save('expenses', state.expenses);
    $('#expTitle').value = ''; $('#expAmount').value = '';
    renderExpenses();
    $('#expTitle').focus();
  }

  function renderExpenses() {
    var list = state.expenses, r = rate();
    if (!list.length) {
      $('#expList').innerHTML = '<div class="card empty">還沒有任何代墊紀錄。<br>在上面記一筆，下面就會自動算出誰該還誰多少。</div>';
      $('#expSummary').textContent = '';
      $('#settle').innerHTML = '<div class="card empty">有紀錄之後，這裡會列出最少次數的還錢方式。</div>';
      return;
    }

    var totalJPY = 0;
    list.forEach(function (e) { totalJPY += toJPY(e.amount, e.cur); });
    $('#expSummary').textContent = '共 ' + list.length + ' 筆 · ' + yen(totalJPY) + '（約 ' + ntd(totalJPY * r) + '）';

    $('#expList').innerHTML = '<div class="card">' + list.slice().reverse().map(function (e) {
      var jpy = toJPY(e.amount, e.cur);
      var names = e.share.map(function (i) { return state.members[i] || ('成員 ' + (i + 1)); });
      return '<div class="exp-row">' +
        '<div class="exp-main">' +
          '<div class="t">' + esc(e.title) + '</div>' +
          '<div class="s"><b>' + esc(state.members[e.payer] || '?') + '</b> 先付 · 分給 ' + e.share.length + ' 人（' + esc(names.join('、')) + '）· 每人 ' + yen(jpy / e.share.length) + '</div>' +
        '</div>' +
        '<div class="exp-amt">' +
          '<div class="a">' + (e.cur === 'TWD' ? ntd(e.amount) : yen(e.amount)) + '</div>' +
          '<div class="b">' + (e.cur === 'TWD' ? '≈ ' + yen(jpy) : '≈ ' + ntd(jpy * r)) + '</div>' +
        '</div>' +
        '<button class="del" data-xdel="' + esc(e.id) + '" title="刪除">✕</button>' +
        '</div>';
    }).join('') + '<div class="total-row"><span>合計</span><span>' + yen(totalJPY) + '　<small style="color:var(--muted)">≈ ' + ntd(totalJPY * r) + '</small></span></div></div>';

    $$('[data-xdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.expenses = state.expenses.filter(function (e) { return e.id !== b.dataset.xdel; });
        save('expenses', state.expenses);
        renderExpenses();
      });
    });

    renderSettlement();
  }

  function balances() {
    var paid = state.members.map(function () { return 0; });
    var owed = state.members.map(function () { return 0; });
    state.expenses.forEach(function (e) {
      var jpy = toJPY(e.amount, e.cur);
      if (paid[e.payer] != null) paid[e.payer] += jpy;
      var per = jpy / e.share.length;
      e.share.forEach(function (i) { if (owed[i] != null) owed[i] += per; });
    });
    return state.members.map(function (m, i) { return { i: i, name: m, paid: paid[i], owed: owed[i], net: paid[i] - owed[i] }; });
  }

  function transfers(bal) {
    var debt = bal.filter(function (b) { return b.net < -0.5; }).map(function (b) { return { i: b.i, v: -b.net }; });
    var cred = bal.filter(function (b) { return b.net > 0.5; }).map(function (b) { return { i: b.i, v: b.net }; });
    debt.sort(function (a, b) { return b.v - a.v; });
    cred.sort(function (a, b) { return b.v - a.v; });
    var out = [], di = 0, ci = 0;
    while (di < debt.length && ci < cred.length) {
      var amt = Math.min(debt[di].v, cred[ci].v);
      if (amt > 0.5) out.push({ from: debt[di].i, to: cred[ci].i, amt: amt });
      debt[di].v -= amt; cred[ci].v -= amt;
      if (debt[di].v <= 0.5) di++;
      if (cred[ci].v <= 0.5) ci++;
    }
    return out;
  }

  function renderSettlement() {
    var bal = balances(), r = rate();
    var rows = bal.map(function (b) {
      var cls = b.net > 0.5 ? 'plus' : (b.net < -0.5 ? 'minus' : '');
      var txt = b.net > 0.5 ? '應收 ' + yen(b.net) : (b.net < -0.5 ? '應付 ' + yen(-b.net) : '剛好打平');
      return '<div class="bal"><span class="who">' + esc(b.name) + '<small>已墊 ' + yen(b.paid) + ' · 應分攤 ' + yen(b.owed) + '</small></span>' +
        '<span class="num ' + cls + '">' + txt + '<small>≈ ' + ntd(Math.abs(b.net) * r) + '</small></span></div>';
    }).join('');

    var pays = transfers(bal);
    var payHtml = pays.length
      ? pays.map(function (p) {
          return '<div class="pay"><span>' + esc(state.members[p.from]) + '</span><span class="arrow">➔</span>' +
            '<span>' + esc(state.members[p.to]) + '</span>' +
            '<span class="amt">' + yen(p.amt) + '<small>≈ ' + ntd(p.amt * r) + '</small></span></div>';
        }).join('')
      : '<div class="empty">目前大家剛好打平，不用互相轉帳。</div>';

    $('#settle').innerHTML =
      '<div class="card card-pad">' + rows + '</div>' +
      '<h3 style="font-size:.95rem;margin:16px 0 8px;color:var(--muted)">最少次數的還錢方式</h3>' +
      '<div class="card">' + payHtml + '</div>';
  }

  function exportText() {
    var bal = balances(), r = rate(), L = [];
    L.push('【' + TRIP.meta.title + '｜代墊明細】');
    L.push('匯率 1 JPY = ' + r.toFixed(4) + ' TWD' + (state.fxManual != null ? '（手動）' : ''));
    L.push('');
    state.expenses.forEach(function (e) {
      var jpy = toJPY(e.amount, e.cur);
      L.push('· ' + e.title + '　' + (e.cur === 'TWD' ? ntd(e.amount) : yen(e.amount)) +
             '　' + state.members[e.payer] + ' 先付，分給 ' + e.share.length + ' 人（每人 ' + yen(jpy / e.share.length) + '）');
    });
    var total = 0; state.expenses.forEach(function (e) { total += toJPY(e.amount, e.cur); });
    L.push('');
    L.push('合計 ' + yen(total) + '（約 ' + ntd(total * r) + '）');
    L.push('');
    L.push('— 結算 —');
    bal.forEach(function (b) {
      L.push(b.name + '：已墊 ' + yen(b.paid) + '，應分攤 ' + yen(b.owed) + ' ➔ ' +
        (b.net > 0.5 ? '應收 ' + yen(b.net) : b.net < -0.5 ? '應付 ' + yen(-b.net) : '打平'));
    });
    var pays = transfers(bal);
    if (pays.length) {
      L.push('');
      pays.forEach(function (p) { L.push(state.members[p.from] + ' ➔ ' + state.members[p.to] + '　' + yen(p.amt) + '（約 ' + ntd(p.amt * r) + '）'); });
    }
    var text = L.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash($('#expExport'), '已複製 ✓'); },
                                               function () { window.prompt('手動複製：', text); });
    } else { window.prompt('手動複製：', text); }
  }
  function flash(btn, msg) {
    var old = btn.textContent;
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = old; }, 1600);
  }

  function bindSplit() {
    $('#expAdd').addEventListener('click', addExpense);
    $('#expAmount').addEventListener('keydown', function (e) { if (e.key === 'Enter') addExpense(); });
    $('#expTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#expAmount').focus(); });
    $('#shareAll').addEventListener('click', function () { shareSel = state.members.map(function () { return true; }); renderSharers(); });
    $('#shareNone').addEventListener('click', function () { shareSel = state.members.map(function () { return false; }); renderSharers(); });
    $('#expExport').addEventListener('click', exportText);
    $('#expClear').addEventListener('click', function () {
      if (!state.expenses.length) return;
      if (!confirm('確定要清空全部 ' + state.expenses.length + ' 筆代墊紀錄嗎？這個動作無法復原。')) return;
      state.expenses = []; save('expenses', state.expenses); renderExpenses();
    });
  }

  /* ================= 啟動 ================= */
  function init() {
    renderHero();
    renderInfo();
    renderChecklist();
    renderSwap();
    renderMembers();
    bindFX();
    bindSplit();
    renderFX();

    $$('.tab').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
    $('#wSun').addEventListener('click', function () { setWeather('sun'); });
    $('#wRain').addEventListener('click', function () { setWeather('rain'); });
    $('#wBoth').addEventListener('click', function () { setWeather('both'); });
    setWeather(state.w);
    setTab(state.tab);

    $('#btnPrint').addEventListener('click', function () { window.print(); });
    $('#btnReset').addEventListener('click', function () {
      if (!confirm('清除 Checklist 勾選、加選與自訂行程，回到預設狀態嗎？（代墊紀錄不會被刪除）')) return;
      ['w', 'checks', 'extras', 'custom', 'tab'].forEach(function (k) { localStorage.removeItem(KEY + k); });
      location.reload();
    });
    $('#btnToday').addEventListener('click', function () {
      var t = todayISO(), d = null;
      TRIP.days.forEach(function (x) { if (x.date === t) d = x; });
      if (!d) { alert('今天不在旅程期間內（' + TRIP.meta.start + ' ～ ' + TRIP.meta.end + '）'); return; }
      document.getElementById(d.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    fetchRate(0);   // 背景抓即時匯率
  }

  document.addEventListener('DOMContentLoaded', init);
})();
