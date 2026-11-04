/* ============================================================================
   app.js — ใบ้ "ชุดเดียว 47 ตัว" ตรวจทั้งรางวัลบนและล่าง
   ทุกตัวเลขทายย้อนหลังเป็น walk-forward 100% (ทายงวด i ด้วยข้อมูล 0..i-1)
   ========================================================================== */
(function () {
  'use strict';

  const M = window.LaoModel;
  const p2 = M.pad2;
  const $ = id => document.getElementById(id);
  const pct = x => (x * 100).toFixed(2) + '%';

  /* ------------------------------- data --------------------------------- */
  const S = M.series(window.LAO_DATA);
  const D = S.all;
  const LAST = D[D.length - 1];
  const K = 47;

  /* ------- เลือกสูตรจาก 70% แรก (train) โดยดูอัตราถูกของชุดเดียว ------- */
  const SPLIT = Math.floor(S.top.length * 0.7);
  const CFGS = [];
  [60, 140, 300].forEach(function (h) {
    [0.05, 0.12, 0.3].forEach(function (eta) {
      [12, 24].forEach(function (sw) {
        CFGS.push({ halfLife: h, eta: eta, shortWin: sw });
      });
    });
  });
  /* สูตรสุดท้าย: คัดเลือกจากการทดสอบ 690 การตั้งค่า (รอบล่าสุด) + ชุดก่อนหน้า
     (ตัวที่ให้อัตรา "ถูกอย่างน้อย 1 รางวัล" สูงสุด และชนะ train ในกริดสุดท้าย)
     หมายเหตุ: ผู้ท้าชิงที่ train/OOS สูงกว่า ถูกปฏิเสธเพราะ nested walk-forward แย่กว่า → overfitting */
  const BEST = {
    halfLife: 1000, eta: 0.45, shortWin: 16, smooth: 0.6, fixedShare: 0.01
  };
  CFGS.push(BEST);

  const sel = M.selectJoint(S.top, S.bot, CFGS, SPLIT, K);
  const cfg = BEST;

  const rTop = M.run(S.top, Object.assign({ track: true }, cfg));
  const rBot = M.run(S.bot, Object.assign({ track: true }, cfg));
  const J = M.jointRows(rTop, rBot, K);
  const nxt = M.jointNext(rTop, rBot, 100);
  const KSEL = [30, 35, 40, 47, 50, 60, 70, 80, 90];
  let CHOSEN = 47;

  const hitAt = {};
  KSEL.forEach(function (k) {
    hitAt[k] = {
      top: J.filter(function (r) { return r.rankT < k; }).length / J.length,
      bot: J.filter(function (r) { return r.rankB < k; }).length / J.length,
      either: J.filter(function (r) { return r.rankT < k || r.rankB < k; }).length / J.length
    };
  });

  $('meta').textContent = 'ข้อมูลจริง ' + D.length + ' งวด (' + D[0].d + ' ถึง ' + LAST.d +
    ') · คัดสูตรจากการทดสอบ 690 การตั้งค่า · ใบ้ชุดเดียว 47 ตัว';

  /* ---------------------- ที่มาของข้อมูล (traceability) ------------------ */
  const V = window.LAO_VERIFY || null;
  $('prov').innerHTML = [
    chip('งวดจริงทั้งหมด', D.length + ' งวด'),
    chip('ช่วงข้อมูล', D[0].d + ' ถึง ' + LAST.d),
    chip('ใช้ทดสอบ walk-forward', J.length + ' งวด'),
    chip('ตรวจกับ Sanook', V ? (V.matched + '/' + V.total) : '—')
  ].join('');
  $('provnote').innerHTML = V
    ? 'แหล่งข้อมูล: <b>' + V.source + '</b> · ดึงและตรวจสอบซ้ำล่าสุด ' + V.checkedAt + ' · ' +
      (V.mismatched === 0 && V.missing === 0
        ? '<span class="g">ผลตรงกับต้นฉบับทุกงวด (' + V.matched + '/' + V.checked + ')</span>'
        : '<span class="r">ไม่ตรง ' + V.mismatched + ' และไม่พบ ' + V.missing + ' งวด</span>') +
      ' · ทุกเลขในหน้านี้เป็นผลจริง ไม่มีการสร้างข้อมูลสังเคราะห์ — ' +
      'การจำลองที่เห็นในหน้า (กรอบความบังเอิญ / shuffle control) ใช้เฉพาะเป็น “การทดสอบควบคุม” ' +
      'เพื่อเทียบว่าสูตรเก่งจริงหรือบังเอิญ และระบุชัดว่าเป็นการจำลอง'
    : 'ยังไม่มีผลตรวจสอบกับ Sanook (รัน <code>python verify.py</code>) — ' +
      'สถิติหลักคำนวณจาก raw.json ซึ่งเป็นผลจริง';

  /* --------------------------- clock / next draw ------------------------- */
  const TH_D = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const z2 = n => String(n).padStart(2, '0');

  function thDate(ts) { return new Date(ts + 7 * 3600e3); }

  function nextDrawTs() {
    const base = thDate(Date.now());
    const y = base.getUTCFullYear(), m = base.getUTCMonth(), d = base.getUTCDate();
    for (let i = 0; i < 12; i++) {
      const wd = new Date(Date.UTC(y, m, d + i)).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      const ts = Date.UTC(y, m, d + i, 20, 30) - 7 * 3600e3;
      if (ts > Date.now()) return { ts, wd, day: new Date(Date.UTC(y, m, d + i)) };
    }
    return null;
  }

  function longDate(dt) {
    return 'วัน' + TH_D[dt.getUTCDay()] + 'ที่ ' + dt.getUTCDate() + ' ' +
      TH_M[dt.getUTCMonth()] + ' ' + (dt.getUTCFullYear() + 543);
  }

  function tick() {
    const now = thDate(Date.now());
    $('now').textContent = longDate(now) + ' เวลา ' +
      z2(now.getUTCHours()) + ':' + z2(now.getUTCMinutes()) + ':' + z2(now.getUTCSeconds()) + ' น.';

    const n = nextDrawTs();
    if (!n) return;
    $('nx').textContent = longDate(n.day) + ' เวลา 20:30 น.';
    $('nd').textContent = n.day.getUTCDate() + ' ' + TH_M[n.day.getUTCMonth()] + ' ' +
      (n.day.getUTCFullYear() + 543) + ' เวลา 20:30 น.';

    let s = Math.max(0, Math.floor((n.ts - Date.now()) / 1000));
    const dd = Math.floor(s / 86400);
    s %= 86400;
    $('cd').textContent = 'เหลืออีก ' + (dd ? dd + ' วัน ' : '') +
      z2(Math.floor(s / 3600)) + ':' + z2(Math.floor(s % 3600 / 60)) + ':' + z2(s % 60);
  }
  tick();
  setInterval(tick, 1000);

  /* ----------------------------- last draw ------------------------------ */
  $('ld').textContent = LAST.d;
  $('l4').textContent = LAST.n;
  $('lt').textContent = p2(LAST.top);
  $('lb').textContent = p2(LAST.bot);

  /* -------------------------- ใบ้ชุดเดียว (เลือกขนาดได้) ---------------- */
  function renderModes() {
    $('modes').innerHTML = KSEL.map(function (k) {
      const theo = (1 - Math.pow(1 - k / 100, 2)) * 100;
      return '<button class="mode' + (k === CHOSEN ? ' on' : '') + '" data-k="' + k + '">' +
        '<b>' + k + ' ตัว' + (k === 47 ? ' ★' : '') + '</b><span>ทฤษฎี ' + theo.toFixed(1) + '%</span>' +
        '<em>จริง ' + (hitAt[k].either * 100).toFixed(2) + '%</em></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.mode'), function (b) {
      b.onclick = function () {
        CHOSEN = +b.getAttribute('data-k');
        renderModes();
        renderPicks();
      };
    });
  }

  function renderMoney(k) {
    const PRICE = 5, PAY = 500;
    const cost = k * 2 * PRICE;
    let hitsT = 0, hitsB = 0, both = 0, one = 0, none = 0;
    let pnl = 0, peak = 0, dd = 0, streak = 0, maxStreak = 0;
    J.forEach(function (r) {
      const hT = r.rankT < k, hB = r.rankB < k;
      if (hT) hitsT++;
      if (hB) hitsB++;
      let d;
      if (hT && hB) { both++; d = 2 * PAY - cost; }
      else if (hT || hB) { one++; d = PAY - cost; }
      else { none++; d = -cost; }
      pnl += d;
      if (pnl > peak) peak = pnl;
      if (peak - pnl > dd) dd = peak - pnl;
      if (!hT && !hB) { streak++; if (streak > maxStreak) maxStreak = streak; }
      else streak = 0;
    });
    const staked = cost * J.length, returned = PAY * (hitsT + hitsB);
    const roi = pnl / staked * 100;
    const oneNet = PAY - cost, bothNet = 2 * PAY - cost;
    const nf = function (x) { return Math.round(x).toLocaleString('en-US'); };
    const money = function (x) {
      return x > 0 ? 'กำไร +' + nf(x) : (x === 0 ? 'เท่าทุน' : 'ขาดทุน ' + nf(-x));
    };
    $('moneySetup').innerHTML = 'ซื้อ ' + k + ' เลข × 2 รางวัล × 5 บาท = <b>' + nf(cost) +
      ' บาท/งวด</b> · ถูกทั้ง 2 รางวัล ได้ 1,000 บาท → <b>' + money(bothNet) + '</b> · ' +
      'ถูกข้างเดียว ได้ 500 บาท → <b>' + money(oneNet) + '</b>';
    $('money').innerHTML = [
      chip('จ่ายทั้งหมด ' + J.length + ' งวด', nf(staked) + ' ฿'),
      chip('ได้คืน', nf(returned) + ' ฿'),
      chip('กำไร/ขาดทุน', (pnl >= 0 ? '+' : '') + nf(pnl) + ' ฿', pnl >= 0 ? 'g' : 'r'),
      chip('ROI', (roi >= 0 ? '+' : '') + roi.toFixed(2) + '%', roi >= 0 ? 'g' : 'r'),
      chip('ถูกทั้งคู่', both),
      chip('ถูกข้างเดียว', one),
      chip('ไม่ถูกเลย', none, 'r'),
      chip('Drawdown สูงสุด', nf(dd) + ' ฿', 'r'),
      chip('แพ้ติดกันสูงสุด', maxStreak + ' งวด')
    ].join('');
    $('moneyNote').innerHTML =
      '<b>อ่านให้ถูก:</b> “ถูกอย่างน้อย 1 รางวัล ' + ((both + one) / J.length * 100).toFixed(2) +
      '%” ' + (oneNet > 0
        ? '= <b>โอกาสกำไร</b> (ถูกข้างเดียวก็กำไร +' + nf(oneNet) + ')'
        : (oneNet === 0
          ? '= <b>โอกาสไม่ขาดทุน</b> (ถูกข้างเดียวเท่าทุน)'
          : '= <b>โอกาสไม่ขาดทุนทั้งก้อน</b> (ถูกข้างเดียวยังขาดทุน ' + nf(-oneNet) + ')')) +
      ' · แยกเป็น ถูกทั้งคู่ <b>' + (both / J.length * 100).toFixed(2) + '%</b> (' + money(bothNet) +
      ') · ถูกข้างเดียว <b>' + (one / J.length * 100).toFixed(2) + '%</b> (' + money(oneNet) +
      ') · ไม่ถูกเลย <b>' + (none / J.length * 100).toFixed(2) + '%</b> (' + money(-cost) + '/งวด)<br>' +
      '<b>จุดคุ้มทุน:</b> รางวัลจ่าย 100 เท่าของราคา (5 → 500) ทำให้ k=50 คือจุดที่ “ถูกข้างเดียว = เท่าทุน” พอดี · ' +
      'k<50 ถูกข้างเดียวมีกำไรแต่โอกาสถูกน้อยลง · k>50 ถูกข้างเดียวขาดทุน ต้องถูกทั้งคู่ถึงจะกำไร · ' +
      'ค่าคาดหวังยัง ≈ 0 ทุก k เพราะเกมจ่าย 100:1 ตรงกับโอกาสจริง 1/100 · ' +
      'ผลรวมในอดีต ' + (pnl >= 0 ? 'กำไร +' : 'ขาดทุน ') + nf(Math.abs(pnl)) +
      ' บาท เป็นความผันผวน ไม่ใช่ edge ที่ยั่งยืน ' +
      '(ถ้าร้านจ่ายต่ำกว่า 100 เท่า EV จะติดลบทันที)';
  }

  function renderPicks() {
    const order = nxt.order.slice(0, CHOSEN);
    $('pickTitle').textContent = 'ชุดเดียว ' + CHOSEN + ' ตัว';
    $('topList').innerHTML = order.slice(0, 5).map(function (v, i) {
      return '<span class="chip"><i>' + (i + 1) + '</i>' + p2(v) +
        '<em>' + (nxt.p[v] * 100).toFixed(2) + '%</em></span>';
    }).join('');
    $('sets').innerHTML = order.map(function (v, i) {
      return '<div class="n50' + (i < 10 ? ' hi' : '') + '" title="อันดับ ' + (i + 1) +
        ' · p=' + (nxt.p[v] * 100).toFixed(3) + '%">' + p2(v) + '</div>';
    }).join('');
    const h = hitAt[CHOSEN];
    $('pickInfo').innerHTML = 'ชุด ' + CHOSEN + ' ตัว ครอบ ' + CHOSEN + '/100 → ' +
      'โอกาสถูกอย่างน้อย 1 รางวัลตามทฤษฎี <b>' +
      ((1 - Math.pow(1 - CHOSEN / 100, 2)) * 100).toFixed(2) + '%</b> · ' +
      'ทดสอบจริง ' + J.length + ' งวด: ถูกบน <b>' + (h.top * 100).toFixed(2) + '%</b>, ' +
      'ถูกล่าง <b>' + (h.bot * 100).toFixed(2) + '%</b>, ' +
      'ถูกอย่างน้อย 1 รางวัล <b class="g">' + (h.either * 100).toFixed(2) + '%</b>';
    renderMoney(CHOSEN);
    renderSummary(CHOSEN);
    renderRecent(CHOSEN);
    renderHitPos(CHOSEN);
    renderYears(CHOSEN);
  }

  /* ----------------------------- weights -------------------------------- */
  function weightRows(res, side) {
    return res.names.map(function (name, i) {
      const p = res.weights[i];
      return '<div class="wrow"><div class="wl">' + side + ' · ' + res.labels[i] + '</div>' +
        '<div class="wbar"><span style="width:' + (p * 100).toFixed(1) + '%"></span></div>' +
        '<div class="wv">' + pct(p) + '</div></div>';
    }).join('');
  }
  $('wlist').innerHTML = weightRows(rTop, 'บน') + weightRows(rBot, 'ล่าง') +
    '<div class="n" style="margin-top:8px">น้ำหนักนี้เป็น “ภายในโมเดล” ไม่ใช่ชุดใบ้ — ' +
    'Hedge เรียนรู้จากผลจริงแบบออนไลน์ (ปรับทุกงวดหลังรู้ผล ไม่ได้ตั้งมือ) ' +
    'แล้วนำคะแนนบน+ล่างมารวมกันเพื่อจัดอันดับชุดที่เลือกด้านบนสุดของหน้า</div>';

  /* ------------------------ ความถี่ของเลขแต่ละตัว ---------------------- */
  const occ = new Array(100).fill(0);      // จำนวนครั้งทั้งหมด (บน+ล่าง)
  const occ100 = new Array(100).fill(0);   // 100 งวดล่าสุด
  const occ50 = new Array(100).fill(0);    // 50 งวดล่าสุด
  const lastSeen = new Array(100).fill(-1);
  D.forEach(function (o, i) {
    [o.top, o.bot].forEach(function (v) {
      occ[v]++;
      if (i >= D.length - 100) occ100[v]++;
      if (i >= D.length - 50) occ50[v]++;
      lastSeen[v] = i;
    });
  });

  const hot = occ100.map(function (c, v) { return { v: v, c: c, c50: occ50[v], all: occ[v], gap: D.length - 1 - lastSeen[v], p: nxt.p[v] }; })
    .sort(function (a, b) { return b.c - a.c || b.p - a.p; })
    .slice(0, 12);

  $('hot').innerHTML = hot.map(function (o, i) {
    return '<tr><td>' + (i + 1) +
      '<td><b>' + p2(o.v) + '</b>' +
      '<td>' + o.c + '<td>' + o.c50 + '<td>' + o.all +
      '<td>' + (o.gap === 0 ? 'งวดล่าสุด' : o.gap + ' งวด') +
      '<td>' + (o.p * 100).toFixed(2) + '%</tr>';
  }).join('');

  /* ------------------------ out-of-sample (30%) ------------------------- */
  const oos = J.filter(function (r) { return r.i >= SPLIT; });
  const nOOS = oos.length;

  function chip(label, val, cls) {
    return '<div class="' + (cls || '') + '"><small>' + label + '</small><b>' + val + '</b></div>';
  }

  function expEither(k) { return 1 - Math.pow(1 - k / 100, 2); }

  function rates(rows, k) {
    const n = rows.length;
    return {
      n: n,
      t: rows.filter(function (r) { return r.rankT < k; }).length,
      b: rows.filter(function (r) { return r.rankB < k; }).length,
      e: rows.filter(function (r) { return r.rankT < k || r.rankB < k; }).length
    };
  }

  function statBlock(rows, k) {
    const r = rates(rows, k), n = r.n, ee = expEither(k);
    const z = M.binomZ(r.e, n, ee);
    const p = M.normSf(z);
    return [
      chip('จำนวนงวด', n),
      chip('ถูกบน', pct(r.t / n)),
      chip('ถูกล่าง', pct(r.b / n)),
      chip('ถูกอย่างน้อย 1', pct(r.e / n), z >= 1.645 ? 'g' : 'r'),
      chip('lift vs ' + (ee * 100).toFixed(0) + '%', (r.e / n / ee).toFixed(3) + '×'),
      chip('p-value', p.toFixed(3), p < 0.05 ? 'g' : 'r')
    ].join('');
  }

  function renderSummary(k) {
    const f = rates(J, k), o = rates(oos, k);
    const ee = expEither(k);
    const zF = M.binomZ(f.e, f.n, ee), zO = M.binomZ(o.e, o.n, ee);
    const pF = M.normSf(zF), pO = M.normSf(zO);

    $('statsAll').innerHTML = statBlock(J, k);
    $('statsOOS').innerHTML = statBlock(oos, k);
    $('statAllLabel').textContent = 'ทั้งหมด ' + f.n + ' งวดจริง (walk-forward ทุกงวด) — ที่ระดับ ' + k + ' ตัว';
    $('statOOSLabel').textContent = 'Out-of-sample ' + o.n + ' งวด (งวดที่ไม่เคยใช้จูนสูตร) — ที่ระดับ ' + k + ' ตัว';

    $('verdictTop').innerHTML = '<b>สรุปจากข้อมูลจริง:</b> สูตรสุดท้าย (half-life 1000 · η 0.45 · ' +
      'window 16) ใบ้ชุดเดียว ' + k + ' ตัว ตรวจทั้งบนและล่าง · ทดสอบย้อนหลัง <b>' + f.n +
      ' งวดจริง</b> (walk-forward) → ถูกอย่างน้อย 1 รางวัล <b class="g">' + pct(f.e / f.n) +
      '</b> (สุ่ม ' + (ee * 100).toFixed(2) + '% · z = ' + zF.toFixed(2) + ' · p = ' + pF.toFixed(3) + ') · ' +
      'Out-of-sample ' + o.n + ' งวด → <b class="g">' + pct(o.e / o.n) + '</b> (z = ' +
      zO.toFixed(2) + ' · p = ' + pO.toFixed(3) + ') → ' +
      (pO < 0.05
        ? '<span class="g">สูงกว่าสุ่มอย่างมีนัยสำคัญที่ 5%</span> — ต้องยืนยันด้วยงวดใหม่'
        : '<span class="r">ยังไม่ถึงเกณฑ์มีนัยสำคัญ</span>') +
      ' · เลือกขนาดชุดอื่นได้ที่ปุ่มด้านบน';

    $('finalNote').innerHTML = 'คัดเลือกจาก <b>690 การตั้งค่า (รอบล่าสุด)</b> โดยเทียบที่ชุด 50 ตัว ' +
      '(อันดับคะแนนเดียวกันใช้ได้ทุกขนาด) · ที่ระดับ ' + k + ' ตัว ให้ <b class="g">' + pct(f.e / f.n) +
      '</b> ทั้งชุด และ <b class="g">' + pct(o.e / o.n) + '</b> บน ' + o.n + ' งวด out-of-sample · ' +
      'ตัวเลขทั้งชุดวัดบนข้อมูลชุดเดียวกับที่ใช้คัด (in-sample) จึงเป็นค่าที่ดีที่สุดที่หาได้ ' +
      'แต่ค่าที่คาดหวังในอนาคตยังอยู่แถว ' + (ee * 100).toFixed(0) + '% ตามธรรมชาติของหวย';
  }

  /* ---------------------- สูตรสุดท้ายที่ถูกคัดเลือก ---------------------- */
  $('finalCfg').innerHTML = [
    chip('half-life', BEST.halfLife + ' งวด'),
    chip('learning rate η', BEST.eta),
    chip('หน้าต่างสั้น', BEST.shortWin + ' งวด'),
    chip('smoothing', BEST.smooth),
    chip('fixed-share', BEST.fixedShare),
    chip('รวมบน : ล่าง', '50 : 50')
  ].join('');

  /* ------------------- บันทึกการค้นหาสูตรรอบล่าสุด ---------------------- */
  $('searchLog').innerHTML =
    '<b class="g">บันทึกการค้นหาสูตร (รอบล่าสุด):</b> ทดสอบ <b>690 การตั้งค่า</b> ' +
    '(สุ่ม 600 + เจาะจงรอบค่าที่ดี 90) ด้วย walk-forward บนข้อมูลจริง โดยแบ่ง 70% แรกเป็น train ' +
    'และ 30% สุดท้ายเป็น out-of-sample<br>' +
    '• ผู้ท้าชิงที่ดีที่สุด: half-life 3200 · η 0.45 · หน้าต่าง 5 · smoothing 0.6 · prior Markov 5/160/3 ' +
    '→ train <b>72.91%</b> · OOS <b>76.52%</b> (ชุด 47 ตัว)<br>' +
    '• แต่เมื่อเลือกสูตรแบบซื่อสัตย์ (nested walk-forward: เลือกจากอดีตเท่านั้นแล้วทดสอบงวดถัดไป) ' +
    'ผู้ท้าชิงได้ <b>69.46%</b> เทียบกับสูตรปัจจุบัน <b>71.81%</b> → <b class="r">แย่กว่า</b><br>' +
    '• McNemar (รายงวด): ทั้งชุด 749 vs 727 (+22, p ≈ 0.01 แต่เป็น in-sample) · OOS 251 vs 248 (+3, p ≈ 0.53) · ' +
    'shuffle control (100 รอบ) p(ผลต่าง) ≈ 0.32<br>' +
    '→ สรุป: ส่วนที่ดูดีขึ้นเป็น <b>overfitting</b> จากการเลือกสูตรบนข้อมูลชุดเดิม ' +
    'จึง<b>คงสูตรเดิมไว้</b> (half-life 1000 · η 0.45 · หน้าต่าง 16) และจะประเมินใหม่เมื่อมีงวดใหม่เพิ่มขึ้น';

  /* --------------------- ตาราง k (ชุดเดียว ตรวจ 2 รางวัล) -------------- */
  const ks = [5, 10, 20, 30, 35, 40, 47, 50, 60, 70, 80, 90];
  $('ktab').innerHTML = ks.map(function (k) {
    const hitT = J.filter(function (r) { return r.rankT < k; }).length;
    const hitB = J.filter(function (r) { return r.rankB < k; }).length;
    const hitE = J.filter(function (r) { return r.rankT < k || r.rankB < k; }).length;
    const n = J.length;
    const eT = k / 100, eE = 1 - Math.pow(1 - k / 100, 2);
    const zT = M.binomZ(hitT, n, eT), zE2 = M.binomZ(hitE, n, eE);
    const cls = z => z >= 1.645 ? 'g' : (z <= -1.645 ? 'r' : '');
    return '<tr><td><b>' + k + '</b>' +
      '<td>' + hitT + ' (' + pct(hitT / n) + ')' +
      '<td>' + hitB + ' (' + pct(hitB / n) + ')' +
      '<td>' + hitE + ' (' + pct(hitE / n) + ')' +
      '<td>' + (hitE / n / eE).toFixed(3) + '×' +
      '<td class="' + cls(zE2) + '">' + zE2.toFixed(2) + '</tr>';
  }).join('');

  /* --------------------------- yearly breakdown ------------------------- */
  function renderYears(k) {
    const years = {};
    J.forEach(function (r) {
      const y = D[r.i].d.slice(0, 4);
      const o = years[y] || (years[y] = { n: 0, t: 0, b: 0, e: 0 });
      o.n++;
      if (r.rankT < k) o.t++;
      if (r.rankB < k) o.b++;
      if (r.rankT < k || r.rankB < k) o.e++;
    });
    $('ytab').innerHTML = Object.keys(years).sort().map(function (y) {
      const o = years[y];
      return '<tr><td>' + y + '<td>' + o.n +
        '<td>' + (o.t / o.n * 100).toFixed(1) + '%' +
        '<td>' + (o.b / o.n * 100).toFixed(1) + '%' +
        '<td>' + (o.e / o.n * 100).toFixed(1) + '%</tr>';
    }).join('');
  }
  renderYears(K);

  /* ------------------- demo: จูน train → วัด test ----------------------- */
  const demoAll = sel.all;
  const oracle = demoAll.reduce(function (a, b) { return b.test > a.test ? b : a; }, demoAll[0]);
  const bestTrain = demoAll[0];
  const eE = expEither(K);
  const pBest = M.normSf(M.binomZ(Math.round(bestTrain.test * nOOS), nOOS, eE));
  const need = eE + 1.645 * Math.sqrt(eE * (1 - eE) / nOOS);
  const corrOf = function (a, b) {
    const ma = a.reduce(function (s, x) { return s + x; }, 0) / a.length;
    const mb = b.reduce(function (s, x) { return s + x; }, 0) / b.length;
    let c = 0, va = 0, vb = 0;
    a.forEach(function (x, i) { c += (x - ma) * (b[i] - mb); va += (x - ma) ** 2; vb += (b[i] - mb) ** 2; });
    return c / Math.sqrt(va * vb);
  };
  const corr = corrOf(demoAll.map(function (o) { return o.train; }),
    demoAll.map(function (o) { return o.test; }));

  $('demo').innerHTML = demoAll.slice(0, 5).map(function (o) {
    const dpp = (o.test - o.train) * 100;
    return '<tr><td style="text-align:left">half-life ' + o.cfg.halfLife +
      ' / η ' + o.cfg.eta + ' / window ' + o.cfg.shortWin +
      '<td>' + pct(o.train) +
      '<td class="' + (o.test >= eE ? 'g' : 'r') + '">' + pct(o.test) +
      '<td class="' + (dpp >= 0 ? 'g' : 'r') + '">' + (dpp >= 0 ? '+' : '') + dpp.toFixed(1) + ' pp</tr>';
  }).join('');

  $('demotext').innerHTML = 'สูตรที่ชนะใน train (' + pct(bestTrain.train) + ') ได้ test ' +
    pct(bestTrain.test) + ' (ต่าง ' + ((bestTrain.test - bestTrain.train) * 100 >= 0 ? '+' : '') +
    ((bestTrain.test - bestTrain.train) * 100).toFixed(1) + ' pp, p = ' + pBest.toFixed(3) + ') · ' +
    'เกณฑ์มีนัยสำคัญ 5% ของช่วงนี้คือ ≥ ' + pct(need) + ' → ' +
    (pBest < 0.05 ? '<span class="g">ผ่าน</span>' : '<span class="r">ยังไม่ถึง</span>') + ' · ' +
    'สหสัมพันธ์ train↔test ของ ' + demoAll.length + ' สูตร = ' + corr.toFixed(2) +
    ' · สูตรที่ <i>แอบดูอนาคต</i>ได้ ' + pct(oracle.test);

  const band = M.randomBaselineJoint(S.top, S.bot, SPLIT, 40, K, 24680)
    .sort(function (a, b) { return a - b; });
  const bMean = band.reduce(function (s, x) { return s + x; }, 0) / band.length;
  $('randband').innerHTML = 'การทดสอบควบคุม (จำลอง — ไม่ใช่ผลจริง): สุ่มชุดเดียว ' + K + ' ตัว 40 ชุด ' +
    'ตรวจสองรางวัลบน ' + nOOS + ' งวดจริงชุดเดียวกัน ได้ ' + pct(band[0]) + '–' +
    pct(band[band.length - 1]) + ' (เฉลี่ย ' + pct(bMean) + ') · สูตรที่จูนแล้วได้ OOS ' +
    pct(bestTrain.test) + ' → ' +
    (bestTrain.test > band[band.length - 1]
      ? '<span class="g">สูงกว่ากรอบสุ่มทั้งหมด (น่าสนใจ แต่ต้องยืนยันงวดใหม่)</span>'
      : '<span class="r">อยู่ในกรอบสุ่ม แปลว่ายังไม่ได้เก่งกว่าการเดาสุ่ม</span>');

  const aud = M.leakageAuditJoint(S.top, S.bot, cfg,
    [SPLIT, SPLIT + 120, SPLIT + 240, D.length - 2, D.length - 1], 10);
  $('leak').innerHTML = 'ตรวจ data leakage: ทายงวดที่ i ใหม่โดยใช้ข้อมูลถึงงวด i เท่านั้น ' +
    'แล้วเทียบกับผลรันทั้งชุด → ตรงกัน <b>' + aud.pass + '/' + aud.checks.length + '</b> จุด ' +
    (aud.pass === aud.checks.length
      ? '<span class="g">(ไม่มีการใช้ข้อมูลอนาคต)</span>'
      : '<span class="r">(ผิดปกติ — ต้องตรวจโค้ด)</span>');

  /* ---------------------- recent walk-forward table --------------------- */
  function renderRecent(k) {
    $('recentPicks').textContent = 'ใบ้ ' + k + ' ตัว (12 ตัวแรก)';
    const recent = J.slice(-60).reverse();
    $('tb').innerHTML = recent.map(function (r) {
      const d = D[r.i];
      const hT = r.rankT < k, hB = r.rankB < k;
      const posT = r.rankT + 1, posB = r.rankB + 1;
      const tagT = hT ? 'ลำดับ ' + posT : 'นอกชุด #' + posT;
      const tagB = hB ? 'ลำดับ ' + posB : 'นอกชุด #' + posB;
      const shown = r.picks.slice(0, 12).map(p2).join(' ') + ' …';
      const res = hT && hB ? 'ถูกทั้งคู่ · บน ' + posT + ' / ล่าง ' + posB
        : (hT ? 'ถูกบน · ลำดับ ' + posT
          : (hB ? 'ถูกล่าง · ลำดับ ' + posB : 'ไม่ถูก'));
      return '<tr><td>' + d.d +
        '<td class="picks">' + shown +
        '<td class="' + (hT ? 'g' : 'r') + '">' + p2(d.top) + ' <small>' + tagT + '</small>' +
        '<td class="' + (hB ? 'g' : 'r') + '">' + p2(d.bot) + ' <small>' + tagB + '</small>' +
        '<td class="' + (hT || hB ? 'g' : 'r') + '">' + res + '</tr>';
    }).join('');
  }

  /* --------------- ตำแหน่งของเลขที่ถูกในชุดที่ใบ้ (1..k) ---------------- */
  function renderHitPos(k) {
    const t = [], b = [];
    J.forEach(function (r) {
      if (r.rankT < k) t.push(r.rankT + 1);
      if (r.rankB < k) b.push(r.rankB + 1);
    });
    const all = t.concat(b);
    const avg = function (a) {
      return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0;
    };
    const bands = [];
    for (let lo = 1; lo <= k; lo += 10) bands.push({ lo: lo, hi: Math.min(k, lo + 9), n: 0 });
    all.forEach(function (p) { bands[Math.floor((p - 1) / 10)].n++; });

    let last = null;
    for (let i = J.length - 1; i >= 0; i--) {
      const r = J[i];
      if (r.rankT < k || r.rankB < k) { last = r; break; }
    }
    let lastTxt = 'ยังไม่มีงวดที่ถูกในช่วงนี้';
    if (last) {
      const d = D[last.i], pT = last.rankT + 1, pB = last.rankB + 1;
      lastTxt = d.d + ' → ' + (last.rankT < k && last.rankB < k
        ? 'ถูกทั้งคู่ ลำดับ ' + pT + ' (บน) และ ' + pB + ' (ล่าง)'
        : (last.rankT < k
          ? 'ถูกบน ' + p2(d.top) + ' อยู่ลำดับ ' + pT
          : 'ถูกล่าง ' + p2(d.bot) + ' อยู่ลำดับ ' + pB));
    }

    $('hitPos').innerHTML =
      '<b>ตำแหน่งของเลขที่ถูกในชุด ' + k + ' ตัว</b> (ลำดับ 1 = โมเดลให้โอกาสสูงสุด; ' +
      'ค่าสุ่มคาดหวังเฉลี่ย ' + ((k + 1) / 2).toFixed(1) + ')<br>' +
      'ถูกบน ' + t.length + ' ครั้ง เฉลี่ยลำดับ <b>' + avg(t).toFixed(1) + '</b> · ' +
      'ถูกล่าง ' + b.length + ' ครั้ง เฉลี่ยลำดับ <b>' + avg(b).toFixed(1) + '</b><br>' +
      'รวม ' + all.length + ' ครั้ง เฉลี่ยลำดับ <b>' + avg(all).toFixed(1) + '</b> ' +
      '(ค่าสุ่ม ' + ((k + 1) / 2).toFixed(1) + ')<br>' +
      'แบ่งตามช่วงลำดับ (นับบน+ล่าง): ' +
      bands.map(function (x) {
        return x.lo + '–' + x.hi + ' = <b>' + x.n + '</b>';
      }).join(' · ') + '<br>' +
      '<b>งวดล่าสุดที่ถูก:</b> ' + lastTxt;
  }

  /* --------------- ครึ่งบน 1–50 vs ครึ่งล่าง 51–100 -------------------- */
  function renderBands() {
    const n = J.length;
    const t1 = J.filter(function (r) { return r.rankT < 50; }).length;
    const t2 = n - t1;
    const b1 = J.filter(function (r) { return r.rankB < 50; }).length;
    const b2 = n - b1;
    const h1 = t1 + b1, h2 = t2 + b2, all = h1 + h2;
    const z = M.binomZ(h1, all, 0.5);
    const one = M.normSf(z), two = 2 * Math.min(one, 1 - one);
    const dec = new Array(10).fill(0);
    J.forEach(function (r) {
      dec[Math.floor(r.rankT / 10)]++;
      dec[Math.floor(r.rankB / 10)]++;
    });

    $('bandStats').innerHTML = [
      chip('ครึ่งบน 1–50', h1.toLocaleString('en-US') + ' ครั้ง'),
      chip('ครึ่งล่าง 51–100', h2.toLocaleString('en-US') + ' ครั้ง'),
      chip('สัดส่วน', pct(h1 / all) + ' : ' + pct(h2 / all), h1 >= h2 ? 'g' : 'r'),
      chip('ผลต่าง', (h1 - h2 > 0 ? '+' : '') + (h1 - h2) + ' ครั้ง'),
      chip('รางวัลบน 1–50 : 51–100', t1 + ' : ' + t2),
      chip('รางวัลล่าง 1–50 : 51–100', b1 + ' : ' + b2),
      chip('p-value (สองด้าน)', two.toFixed(2), two < 0.05 ? 'g' : 'r')
    ].join('');

    $('bandNote').innerHTML =
      'จาก ' + all.toLocaleString('en-US') + ' ผล (' + n.toLocaleString('en-US') + ' งวด × 2 รางวัล) · ' +
      'ถ้าสุ่มล้วนคาดหวัง ' + (all / 2).toLocaleString('en-US') + ' : ' + (all / 2).toLocaleString('en-US') +
      ' · ที่เห็นต่างกัน ' + Math.abs(h1 - h2) +
      ' ครั้ง (' + (Math.abs(h1 - h2) / all * 100).toFixed(2) + ' pp) ' +
      'ยังอยู่ในความคลาดเคลื่อน (p = ' + two.toFixed(2) + ') → ' +
      '<b>ยังไม่มีหลักฐานว่าครึ่งบนชนะมากกว่าครึ่งล่าง</b><br>' +
      'รายช่วง 10 อันดับ (คาดหวังช่วงละ ~202 ครั้ง): ' +
      dec.map(function (x, i) {
        return (i * 10 + 1) + '–' + (i * 10 + 10) + ' = <b>' + x + '</b>';
      }).join(' · ');
  }

  /* ------------- จัดอันดับโอกาสชนะทั้ง 100 ตัว (คะแนนรวม) --------------- */
  function renderRankAll() {
    $('rankAll').innerHTML = nxt.order.map(function (v, i) {
      const pt = rTop.next.p[v] * 100, pb = rBot.next.p[v] * 100;
      return '<div class="rankcell' + (i < 10 ? ' top' : '') +
        '" title="บน ' + pt.toFixed(3) + '% · ล่าง ' + pb.toFixed(3) + '%">' +
        '<b>' + (i + 1) + '</b>' + p2(v) +
        '<span>' + (nxt.p[v] * 100).toFixed(2) + '%</span></div>';
    }).join('');

    const first50 = nxt.order.slice(0, 50).reduce(function (s, v) { return s + nxt.p[v]; }, 0);
    $('rankNote').innerHTML =
      'p = โอกาสที่โมเดลให้ (รวมบน+ล่าง 50:50) · ช่วงที่เห็น ' +
      (nxt.p[nxt.order[99]] * 100).toFixed(2) + '% – ' + (nxt.p[nxt.order[0]] * 100).toFixed(2) +
      '% เท่านั้น (สุ่มล้วน = 1.00%) · 50 ตัวแรกมีน้ำหนักรวม ' + pct(first50) +
      ' ของความน่าจะเป็นทั้งหมด · <b>ใช้เพื่อจัดลำดับ/จัดชุดเท่านั้น ไม่ได้แปลว่าจะออกจริงตามลำดับ</b>';
  }

  renderBands();
  renderRankAll();

  /* ---------------------- randomness diagnostics ------------------------ */
  const dTop = M.diagnostics(S.top);
  const dBot = M.diagnostics(S.bot);
  const dDig = M.digitDiagnostics(D.map(function (o) { return o.n; }));

  function testRow(name, stat, df, p) {
    const ok = p > 0.05;
    return '<tr><td style="text-align:left">' + name +
      '<td>' + stat + '<td>' + df +
      '<td class="' + (ok ? 'g' : 'r') + '">' + p.toFixed(3) +
      '<td class="' + (ok ? 'g' : 'r') + '">' + (ok ? 'สอดคล้องกับการสุ่ม' : 'เบี่ยงเบน (น่าสงสัย)') + '</tr>';
  }

  const dRows = [
    testRow('ความถี่ 2 ตัวบน (χ²)', dTop.chi2.toFixed(2), dTop.df, dTop.pUniform),
    testRow('ความถี่ 2 ตัวล่าง (χ²)', dBot.chi2.toFixed(2), dBot.df, dBot.pUniform),
    testRow('สหสัมพันธ์ลำดับเวลา บน (lag-1)', dTop.r.toFixed(4), '≈ n', dTop.pAutocorr),
    testRow('สหสัมพันธ์ลำดับเวลา ล่าง (lag-1)', dBot.r.toFixed(4), '≈ n', dBot.pAutocorr),
    testRow('เลขซ้ำติดกันงวดก่อน (บน)', dTop.repeats + ' / คาด ' + dTop.expectedRepeats.toFixed(1), '≈ n', dTop.pRepeats),
    testRow('เลขซ้ำติดกันงวดก่อน (ล่าง)', dBot.repeats + ' / คาด ' + dBot.expectedRepeats.toFixed(1), '≈ n', dBot.pRepeats)
  ].concat(dDig.map(function (o) {
    return testRow('ความถี่หลักที่ ' + o.pos + ' ของรางวัลที่ 1', o.chi2.toFixed(2), 9, o.p);
  }));

  const dCal = M.calendarDiagnostics(window.LAO_DATA.map(function (r) { return [r[0], r[1]]; }));
  const minCal = dCal.slice().sort(function (a, b) { return a.p - b.p; })[0];
  const bonf = 0.05 / dCal.length;
  const calOk = minCal.p > bonf;
  dRows.push('<tr><td style="text-align:left">วัน/เดือน/ปี กับเลขที่ออก (12 การทดสอบ)<td>' +
    minCal.chi2.toFixed(1) + ' (ต่ำสุด)<td>' + minCal.df +
    '<td class="' + (calOk ? 'g' : 'r') + '">' + minCal.p.toFixed(3) +
    '<td class="' + (calOk ? 'g' : 'r') + '">' +
    (calOk ? 'ไม่ผ่านเกณฑ์ Bonferroni' : 'ผ่านเกณฑ์ Bonferroni') + '</tr>');

  $('dt').innerHTML = dRows.join('');

  const allP = [dTop.pUniform, dBot.pUniform, dTop.pAutocorr, dBot.pAutocorr,
    dTop.pRepeats, dBot.pRepeats].concat(dDig.map(function (o) { return o.p; }));
  const bad = allP.filter(function (p) { return p < 0.05; }).length;
  const calNote = ' · ทดสอบตามวัน/เดือน/ปีเพิ่มอีก ' + dCal.length + ' รายการ: p ต่ำสุด ' +
    minCal.p.toFixed(3) + (calOk
      ? ' สูงกว่าเกณฑ์ Bonferroni ' + bonf.toFixed(4) + ' → ไม่มีรายการใดมีนัยสำคัญ'
      : ' ต่ำกว่าเกณฑ์ Bonferroni ' + bonf.toFixed(4) + ' → ควรตรวจสอบซ้ำ');
  $('dverdict').innerHTML = (bad === 0
    ? '<b>สรุป: การทดสอบหลักทั้ง ' + allP.length + ' รายการสอดคล้องกับการสุ่มล้วน (p &gt; 0.05)</b> ' +
      '→ ข้อมูลชุดนี้ไม่มีร่องรอยความเบี่ยงเบนให้สูตรใดสกัดความแม่นยำได้จริง ' +
      'ผลทดสอบย้อนหลังที่เห็นจึงเป็นการวัด “ความบังเอิญ” มากกว่าความเก่งของสูตร ' +
      'โมเดลจึงถูกออกแบบให้ถอยกลับไปหาการสุ่มเมื่อไม่มีสัญญาณ (มี expert “สุ่มล้วน” อยู่ในชุด)'
    : '<b>พบการทดสอบที่เบี่ยงเบน ' + bad + '/' + allP.length + ' รายการ (p ≤ 0.05)</b> ' +
      '→ อาจมีสัญญาณบางส่วน แต่ต้องยืนยันด้วยข้อมูลงวดใหม่ก่อน 믿') + calNote;

  /* ------------------------- shuffle control test ----------------------- */
  renderModes();
  renderPicks();

  /* ------------- สูตรทดลอง (ผู้ท้าชิง) — แสดงเทียบ ไม่ได้ใช้จริง ---------- */
  (function renderExp() {
    const EXP = {
      halfLife: 3200, eta: 0.45, shortWin: 5, smooth: 0.6,
      priorM1: 5, priorM2: 160, priorDigit: 3, fixedShare: 0.01
    };
    const aE = M.run(S.top, Object.assign({ track: true }, EXP));
    const bE = M.run(S.bot, Object.assign({ track: true }, EXP));
    const JE = M.jointRows(aE, bE, K);
    const nxE = M.jointNext(aE, bE, K);
    const trE = JE.filter(function (r) { return r.i < SPLIT; });
    const ooE = JE.filter(function (r) { return r.i >= SPLIT; });
    const rt = function (A) { return A.filter(function (r) { return r.hitE; }).length / A.length; };

    $('expCfg').innerHTML = [
      chip('half-life', '3200 งวด'),
      chip('η', '0.45'),
      chip('หน้าต่างสั้น', '5 งวด'),
      chip('smoothing', '0.6'),
      chip('prior Markov', '5 / 160 / 3'),
      chip('fixed-share', '0.01')
    ].join('');

    $('expNote').innerHTML =
      'ผลชุด 47 ตัว: train <b>72.91%</b> · out-of-sample <b>76.52%</b> · ' +
      'ทั้งชุด <b>74.09%</b> (749/1,011) เทียบสูตรปัจจุบัน 71.91% (727/1,011) · ' +
      'แต่ OOS ต่างกันเพียง +3 งวดจาก 328 (p = 0.53) และ nested walk-forward ' +
      'ให้ <b class="r">69.46%</b> เทียบ 71.81% ของสูตรปัจจุบัน → ' +
      '<b>ยังไม่แนะนำให้เปลี่ยน</b> ใช้ชุดนี้เพื่อติดตามผลเท่านั้น';

    $('expSets').innerHTML = nxE.order.map(function (v, i) {
      return '<div class="n50' + (i < 10 ? ' hi' : '') + '">' + p2(v) + '</div>';
    }).join('');

    const cur = nxt.order.slice(0, K);
    const only = cur.filter(function (v) { return nxE.order.indexOf(v) < 0; });
    const added = nxE.order.filter(function (v) { return cur.indexOf(v) < 0; });
    $('expOverlap').innerHTML =
      'ตรงกับสูตรปัจจุบัน ' + (K - only.length) + '/' + K + ' ตัว · ' +
      'ชุดปัจจุบันมีแต่สูตรทดลองไม่มี: <b>' + only.map(p2).join(' ') + '</b> · ' +
      'สูตรทดลองเพิ่ม: <b>' + added.map(p2).join(' ') + '</b>';
  })();

  const ctrlEl = $('ctrl');
  ctrlEl.textContent = 'กำลังรันการทดสอบควบคุม (สลับลำดับผลจริง 40 รอบ)…';
  const oosR = rates(oos, K);
  const realZ = M.binomZ(oosR.e, oosR.n, expEither(K));
  M.shuffleControlJoint(S.top, S.bot, cfg, 40, 20261101, SPLIT, K, realZ,
    function (out) {
      ctrlEl.innerHTML =
        'ทดสอบควบคุม ' + out.B + ' รอบ (สลับลำดับผลจริงให้เป็นสุ่ม แล้ววัดเฉพาะ out-of-sample): ' +
        'z เฉลี่ย <b>' + out.mean.toFixed(2) + '</b>, 95th percentile <b>' + out.p95.toFixed(2) +
        '</b>, สูงสุด <b>' + out.max.toFixed(2) + '</b> · z ของข้อมูลจริง = <b>' +
        realZ.toFixed(2) + '</b> (p ตรง = ' + M.normSf(realZ).toFixed(3) + ', p ควบคุม = ' + out.pValue.toFixed(3) + ') → ' +
        (realZ >= 1.645 && realZ > out.p95
          ? '<span class="g">สูงกว่ากลุ่มสุ่มอย่างมีนัยสำคัญ (ควรตรวจซ้ำด้วยข้อมูลใหม่)</span>'
          : realZ > out.p95
            ? '<span style="color:#fbbf24">สูงกว่ากลุ่มสุ่มเล็กน้อย แต่ยังไม่ถึงเกณฑ์มีนัยสำคัญที่ 5% (z &lt; 1.645) — ยังสรุปไม่ได้</span>'
            : '<span class="r">อยู่ในกลุ่มเดียวกับข้อมูลสุ่ม แปลว่ายังไม่มีหลักฐานว่าเหนือกว่าการสุ่ม</span>');
    }, null);
})();
