/* ============================================================================
   autoupdate.js — ตรวจผลงวดใหม่จาก Sanook ผ่าน /api/refresh
   ต้องเปิดหน้าเว็บผ่าน `python serve.py` (http://127.0.0.1:8931/)
   ========================================================================== */
(function () {
  'use strict';

  const el = document.getElementById('autoUpdate');
  const btn = document.getElementById('refreshBtn');
  if (!el) return;

  const D = window.LAO_DATA || [];
  const lastLocal = D.length ? D[D.length - 1][0] : null;

  function thaiNow() { return new Date(Date.now() + 7 * 3600e3); }
  function minutesOfDay() {
    const n = thaiNow();
    return n.getUTCHours() * 60 + n.getUTCMinutes();
  }
  function stamp() {
    const n = thaiNow();
    const z = x => String(x).padStart(2, '0');
    return z(n.getUTCHours()) + ':' + z(n.getUTCMinutes());
  }

  let busy = false;

  function show(html, cls) {
    el.innerHTML = '<span class="' + (cls || '') + '">' + html + '</span>';
  }

  function check(manual) {
    if (busy) return;
    busy = true;
    if (manual) show('กำลังตรวจผลจาก Sanook…');

    fetch('/api/refresh', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        busy = false;
        if (!j.ok) {
          show('ตรวจไม่ได้: ' + (j.error || 'ไม่ทราบสาเหตุ'), 'r');
          return;
        }
        const serverLast = j.last ? j.last[0] : lastLocal;
        if (serverLast && lastLocal && serverLast > lastLocal) {
          show('พบผลใหม่ ' + serverLast + ' — กำลังโหลดหน้าใหม่…', 'g');
          setTimeout(function () { location.reload(); }, 700);
          return;
        }
        const after = minutesOfDay() >= 20 * 60 + 30;
        show('งวดล่าสุดในระบบ: <b>' + (lastLocal || '—') + '</b> · ตรวจล่าสุด ' + stamp() +
          ' น. · ' + (after
            ? 'ยังไม่พบผลใหม่ (Sanook อาจประกาศช้ากว่า 20:30 เล็กน้อย)'
            : 'ยังไม่ถึง 20:30 — ระบบจะเริ่มตรวจเองหลังผลออก'));
      })
      .catch(function () {
        busy = false;
        show('เชื่อมต่อเซิร์ฟเวอร์อัปเดตไม่ได้ — ต้องรัน <code>python serve.py</code> ' +
          'แล้วเปิด <code>http://127.0.0.1:8931/</code>', 'r');
      });
  }

  // ตรวจทันทีเมื่อเปิดหน้า (เผื่อเพิ่งออกผลและยังไม่ได้อัปเดต)
  check(false);

  // หลัง 20:30 ถึง 23:59 ตรวจทุก 60 วินาที
  setInterval(function () {
    const m = minutesOfDay();
    if (m >= 20 * 60 + 30 && m <= 23 * 60 + 59) check(false);
  }, 60000);

  // กลับมาที่แท็บหลังผลออก → ตรวจอีกครั้ง
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && minutesOfDay() >= 20 * 60 + 30) check(false);
  });

  if (btn) btn.onclick = function () { check(true); };
})();
