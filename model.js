/* ============================================================================
   LaoModel v2 — เครื่องยนต์สถิติสำหรับหวยลาว (walk-forward, ไม่แอบดูอนาคต)
   ----------------------------------------------------------------------------
   หลักการ:
   1) แยกซีรีส์ "บน" (2 ตัวท้ายของรางวัลที่ 1) และ "ล่าง" (2 ตัวหน้า) ออกจากกัน
      เพราะพฤติกรรมของสองตำแหน่งไม่เหมือนกัน
   2) ใช้ผู้เชี่ยวชาญ (expert) 6 ตัว แต่ละตัวให้ "ความน่าจะเป็น" ครบ 100 ตัว:
        - ความถี่ถ่วงเวลา (exponential decay, half-life ~140 งวด)
        - ความถี่ช่วงสั้น (24 งวดล่าสุด)
        - ช่วงห่างคงค้าง (gap hazard ที่ประมาณจากข้อมูลจริง ไม่ใช่ "เลขค้างต้องออก")
        - Markov ลำดับ 1 (ค่าก่อนหน้า -> ค่าถัดไป)
        - Markov ลำดับ 2 (สองค่าก่อนหน้า -> ค่าถัดไป)
        - โครงสร้างหลัก/หน่วย (digit decomposition + conditional digit)
      ทุกตัวมีการ shrink เข้าหาค่าฐาน (smoothing) เพื่อไม่ให้ความถี่ 0 ทำให้ทายผิดทั้งกระดาน
   3) รวมผู้เชี่ยวชาญด้วย Hedge / multiplicative weights (online learning):
      น้ำหนักถูกปรับจากผลจริงทีละงวดหลังทราบผลเท่านั้น (ห้ามใช้ข้อมูลอนาคต)
      → น้ำหนักที่เห็นคือสิ่งที่โมเดล "เรียนรู้เอง" จากประวัติ ไม่ได้ตั้งมือ
   4) ทุกคะแนนสถิติในหน้าเว็บมาจาก walk-forward ล้วน: ทายงวดที่ i โดยใช้แค่ 0..i-1
   5) มีการทดสอบนัยสำคัญ (binomial z / p-value) และการทดสอบควบคุมด้วยการสลับลำดับ
      ผล เพื่อแยกว่า "เก่งจริง" หรือ "บังเอิญ" — เพราะหวยเป็นการสุ่ม
   ========================================================================== */
(function (root) {
  'use strict';

  var N = 100;
  var LOGN = Math.log(N);

  function pad2(v) { return (v < 10 ? '0' : '') + v; }

  var DEFAULT = {
    halfLife: 140,     // จำนวนงวดครึ่งชีวิตของน้ำหนักความถี่
    shortWin: 24,      // หน้าต่างความถี่ระยะสั้น
    smooth: 0.6,       // Dirichlet smoothing ของความถี่
    priorM1: 25,       // จำนวน pseudo-count ที่ shrink Markov-1 เข้าฐาน
    priorM2: 60,       // Markov-2 ข้อมูลน้อยกว่า จึง shrink แรงกว่า
    priorDigit: 4,     // smoothing ระดับหลัก/หน่วย
    eta: 0.12,         // learning rate ของ Hedge
    fixedShare: 0.01,  // ดึงน้ำหนักกลับเข้าหาส่วนผสมสม่ำเสมอ (กันน้ำหนักยุบไปที่ตัวเดียว)
    warmup: 80,        // งวดเริ่มต้นที่ยังไม่นับสถิติ
    mix: 0.02,         // ผสม uniform 2% กันความน่าจะเป็นเป็น 0
    ks: [5, 10, 20, 30, 40, 50]
  };

  // ผู้เชี่ยวชาญ "สุ่มล้วน" — ไม่มีสัญญาณก็ถอยกลับมาที่การสุ่มได้ ไม่แย่กว่าสุ่ม
  function makeUniform() {
    return {
      name: 'uniform',
      label: 'สุ่มล้วน (baseline)',
      update: function () {},
      prob: function (out) { for (var v = 0; v < N; v++) out[v] = 1 / N; }
    };
  }

  /* ---------------------------- experts ---------------------------------- */

  function makeDecay(lambda, smooth) {
    var cnt = new Float64Array(N);
    var total = 0;
    return {
      name: 'freq',
      label: 'ความถี่ถ่วงเวลา (half-life)',
      update: function (x) {
        for (var v = 0; v < N; v++) cnt[v] *= lambda;
        total *= lambda;
        cnt[x] += 1;
        total += 1;
      },
      prob: function (out) {
        var a = smooth, d = total + N * a;
        for (var v = 0; v < N; v++) out[v] = (cnt[v] + a) / d;
      }
    };
  }

  function makeShort(win, smooth) {
    var cnt = new Float64Array(N);
    var buf = [];
    return {
      name: 'recent',
      label: 'ความถี่ ' + win + ' งวดล่าสุด',
      update: function (x) {
        buf.push(x);
        cnt[x] += 1;
        if (buf.length > win) cnt[buf.shift()] -= 1;
      },
      prob: function (out) {
        var a = smooth, d = buf.length + N * a;
        for (var v = 0; v < N; v++) out[v] = (cnt[v] + a) / d;
      }
    };
  }

  // ช่วงห่างคงค้าง: ประมาณ hazard rate ต่อ "ขนาด gap" จากข้อมูลจริง
  // (ถ้าหวยสุ่มจริง hazard จะแบนทุก bucket → ผู้เชี่ยวชาญตัวนี้จะไม่ช่วยและน้ำหนักจะลดเอง)
  function makeGap() {
    var THR = [1, 2, 3, 5, 8, 13, 21, 36];
    var B = THR.length + 1;
    var last = new Int32Array(N);
    var expo = new Float64Array(B);
    var ev = new Float64Array(B);
    var t = 0;
    for (var i = 0; i < N; i++) last[i] = -100000;
    function bk(g) {
      var b = 0;
      while (b < THR.length && g >= THR[b]) b++;
      return b;
    }
    return {
      name: 'gap',
      label: 'ช่วงห่างคงค้าง (hazard)',
      update: function (x) {
        for (var v = 0; v < N; v++) expo[bk(t - last[v])] += 1;
        ev[bk(t - last[x])] += 1;
        last[x] = t;
        t += 1;
      },
      prob: function (out) {
        var h = new Float64Array(B), s = 0, b;
        for (b = 0; b < B; b++) h[b] = (ev[b] + 1) / (expo[b] + 100);
        for (b = 0; b < N; b++) {
          out[b] = h[bk(t - last[b])];
          s += out[b];
        }
        if (s > 0) for (b = 0; b < N; b++) out[b] /= s;
      }
    };
  }

  function makeMarkov1(prior, baseFn) {
    var trans = new Array(N), rowN = new Float64Array(N);
    for (var i = 0; i < N; i++) trans[i] = new Float64Array(N);
    var lastX = -1, base = new Float64Array(N);
    return {
      name: 'markov1',
      label: 'Markov ลำดับ 1',
      update: function (x) {
        if (lastX >= 0) { trans[lastX][x] += 1; rowN[lastX] += 1; }
        lastX = x;
      },
      prob: function (out) {
        baseFn(base);
        var r = lastX >= 0 ? trans[lastX] : null;
        var n = lastX >= 0 ? rowN[lastX] : 0;
        if (!r || n === 0) { out.set(base); return; }
        var den = n + prior;
        for (var v = 0; v < N; v++) out[v] = (r[v] + prior * base[v]) / den;
      }
    };
  }

  function makeMarkov2(prior, baseFn) {
    var map = new Map(), a = -1, b = -1, base = new Float64Array(N);
    return {
      name: 'markov2',
      label: 'Markov ลำดับ 2',
      update: function (x) {
        if (a >= 0 && b >= 0) {
          var k = a * N + b, r = map.get(k);
          if (!r) { r = { c: new Float64Array(N), n: 0 }; map.set(k, r); }
          r.c[x] += 1; r.n += 1;
        }
        a = b; b = x;
      },
      prob: function (out) {
        baseFn(base);
        var r = (a >= 0 && b >= 0) ? map.get(a * N + b) : null;
        if (!r || r.n === 0) { out.set(base); return; }
        var den = r.n + prior;
        for (var v = 0; v < N; v++) out[v] = (r.c[v] + prior * base[v]) / den;
      }
    };
  }

  function makeDigit(prior) {
    var c1 = new Float64Array(10), c2 = new Float64Array(10);
    var cc = new Array(10);
    for (var i = 0; i < 10; i++) cc[i] = new Float64Array(10);
    var s = 0;
    return {
      name: 'digit',
      label: 'โครงสร้างหลัก/หน่วย',
      update: function (x) {
        var a = Math.floor(x / 10), b = x % 10, i, j;
        for (i = 0; i < 10; i++) {
          c1[i] *= 0.995; c2[i] *= 0.995;
          for (j = 0; j < 10; j++) cc[i][j] *= 0.995;
        }
        s *= 0.995;
        c1[a] += 1; c2[b] += 1; cc[a][b] += 1; s += 1;
      },
      prob: function (out) {
        var den1 = s + 10 * prior, p1 = new Float64Array(10);
        var i, j;
        for (i = 0; i < 10; i++) p1[i] = (c1[i] + prior) / den1;
        for (i = 0; i < 10; i++) {
          var den2 = c1[i] + 10 * prior;
          for (j = 0; j < 10; j++) out[i * 10 + j] = p1[i] * ((cc[i][j] + prior) / den2);
        }
      }
    };
  }

  /* ---------------------------- helpers ---------------------------------- */

  function rankOrder(p) {
    var idx = new Array(N);
    for (var v = 0; v < N; v++) idx[v] = v;
    idx.sort(function (a, b) { var d = p[b] - p[a]; return d !== 0 ? d : a - b; });
    return idx;
  }

  function binomZ(hit, n, p0) {
    if (!n) return 0;
    var mu = n * p0, sd = Math.sqrt(n * p0 * (1 - p0));
    return sd ? (hit - mu) / sd : 0;
  }

  // P(Z > z) แบบประมาณ (Abramowitz-Stegun)
  function normSf(z) {
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989422804014327 * Math.exp(-z * z / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
            t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? p : 1 - p;
  }

  // P(χ² > x) ด้วย Wilson–Hilferty approximation
  function chi2Sf(x, df) {
    if (x <= 0) return 1;
    var t = Math.pow(x / df, 1 / 3);
    var m = 1 - 2 / (9 * df), s = Math.sqrt(2 / (9 * df));
    return normSf((t - m) / s);
  }

  /* ------------------- การทดสอบความเป็นสุ่มของข้อมูล --------------------- */
  // ถ้าข้อมูล "สุ่มจริง" ทุกการทดสอบนี้ควรได้ p > 0.05
  function diagnostics(vals) {
    var n = vals.length, v, i;
    var cnt = new Float64Array(N);
    for (i = 0; i < n; i++) cnt[vals[i]] += 1;
    var e = n / N, chi2 = 0;
    for (v = 0; v < N; v++) chi2 += (cnt[v] - e) * (cnt[v] - e) / e;

    var mean = 0;
    for (i = 0; i < n; i++) mean += vals[i];
    mean /= n;
    var s2 = 0, cov = 0;
    for (i = 0; i < n; i++) s2 += (vals[i] - mean) * (vals[i] - mean);
    for (i = 1; i < n; i++) cov += (vals[i] - mean) * (vals[i - 1] - mean);
    var r = (cov / (n - 1)) / (s2 / n);
    var zr = r * Math.sqrt(n);

    var rep = 0;
    for (i = 1; i < n; i++) if (vals[i] === vals[i - 1]) rep++;
    var er = (n - 1) / N;
    var sr = Math.sqrt(er * (1 - 1 / N));
    var zrep = sr ? (rep - er) / sr : 0;

    return {
      n: n,
      chi2: chi2, df: N - 1, pUniform: chi2Sf(chi2, N - 1),
      r: r, zAutocorr: zr, pAutocorr: 2 * normSf(Math.abs(zr)),
      repeats: rep, expectedRepeats: er, zRepeats: zrep, pRepeats: 2 * normSf(Math.abs(zrep))
    };
  }

  function digitDiagnostics(rows) { // rows = array of 4-char strings
    var out = [];
    for (var pos = 0; pos < 4; pos++) {
      var c = new Float64Array(10), i;
      for (i = 0; i < rows.length; i++) c[+rows[i][pos]] += 1;
      var e = rows.length / 10, chi2 = 0;
      for (i = 0; i < 10; i++) chi2 += (c[i] - e) * (c[i] - e) / e;
      out.push({ pos: pos + 1, chi2: chi2, df: 9, p: chi2Sf(chi2, 9) });
    }
    return out;
  }

  // ทดสอบว่า "วันในสัปดาห์ / เดือน / ปี" เกี่ยวข้องกับเลขที่ออกหรือไม่ (12 การทดสอบ)
  function calendarDiagnostics(rows) { // rows = [[date, '1234'], ...]
    var groups = [
      { name: 'วันในสัปดาห์', key: function (d) { return new Date(d + 'T00:00:00Z').getUTCDay(); } },
      { name: 'เดือน', key: function (d) { return +d.slice(5, 7); } },
      { name: 'ปี', key: function (d) { return d.slice(0, 4); } }
    ];
    var out = [];
    groups.forEach(function (g) {
      for (var pos = 0; pos < 4; pos++) {
        var tab = new Map(), rowT = new Map(), colT = new Map(), n = rows.length;
        rows.forEach(function (r) {
          var gg = g.key(r[0]), dg = r[1][pos], k = gg + '|' + dg;
          tab.set(k, (tab.get(k) || 0) + 1);
          rowT.set(gg, (rowT.get(gg) || 0) + 1);
          colT.set(dg, (colT.get(dg) || 0) + 1);
        });
        var chi2 = 0;
        tab.forEach(function (c, k) {
          var q = k.split('|');
          var e = rowT.get(q[0]) * colT.get(q[1]) / n;
          if (e > 0) chi2 += (c - e) * (c - e) / e;
        });
        var df = (rowT.size - 1) * (colT.size - 1);
        out.push({
          group: g.name, pos: pos + 1, chi2: chi2, df: df,
          p: chi2Sf(chi2, df), cells: rowT.size * colT.size
        });
      }
    });
    return out;
  }

  /* ------------------------------ runner --------------------------------- */

  function run(vals, opts) {
    var c = Object.assign({}, DEFAULT, opts || {});
    var decay = Math.pow(0.5, 1 / c.halfLife);
    var longFreq = makeDecay(decay, c.smooth);
    var baseFn = function (o) { longFreq.prob(o); };
    var experts = [
      makeUniform(),
      longFreq,
      makeShort(c.shortWin, c.smooth),
      makeGap(),
      makeMarkov1(c.priorM1, baseFn),
      makeMarkov2(c.priorM2, baseFn),
      makeDigit(c.priorDigit)
    ];
    var E = experts.length;
    var w = new Float64Array(E);
    for (var e = 0; e < E; e++) w[e] = 1 / E;

    var P = experts.map(function () { return new Float64Array(N); });
    var comb = new Float64Array(N);
    var kmax = Math.max.apply(null, c.ks);
    var ks = c.ks.map(function (k) { return { k: k, hit: 0 }; });
    var rows = [];
    var llSum = 0, cnt = 0;
    var i, v, j, x;

    for (i = 0; i < vals.length; i++) {
      x = vals[i];
      for (j = 0; j < E; j++) experts[j].prob(P[j]);   // ทายก่อนเห็นผลงวดนี้

      if (i >= c.warmup) {
        comb.fill(0);
        for (j = 0; j < E; j++) {
          var we = w[j], pe = P[j];
          if (we === 0) continue;
          for (v = 0; v < N; v++) comb[v] += we * pe[v];
        }
        for (v = 0; v < N; v++) comb[v] = (1 - c.mix) * comb[v] + c.mix / N;

        var order = rankOrder(comb);
        var rank = order.indexOf(x);
        var ll = -Math.log(Math.max(comb[x], 1e-12));
        llSum += ll; cnt++;
        rows.push({
          i: i, x: x, rank: rank, ll: ll, p: comb[x],
          prob: c.track ? comb.slice() : null,
          picks: order.slice(0, kmax)
        });
        for (j = 0; j < ks.length; j++) if (rank < ks[j].k) ks[j].hit++;
      }

      // Hedge update: ทำหลังรู้ผลแล้วเท่านั้น
      var sum = 0, w2 = new Float64Array(E);
      for (j = 0; j < E; j++) {
        var p = Math.max(P[j][x], 1e-9);
        w2[j] = w[j] * Math.exp(c.eta * (Math.log(p) + LOGN));
        sum += w2[j];
      }
      if (sum > 0 && isFinite(sum)) {
        var fs = c.fixedShare;
        for (j = 0; j < E; j++) w[j] = (1 - fs) * (w2[j] / sum) + fs / E;
      }

      for (j = 0; j < E; j++) experts[j].update(x);
    }

    // พยากรณ์งวดถัดไป (ยังไม่เห็นผล)
    for (j = 0; j < E; j++) experts[j].prob(P[j]);
    comb.fill(0);
    for (j = 0; j < E; j++) for (v = 0; v < N; v++) comb[v] += w[j] * P[j][v];
    for (v = 0; v < N; v++) comb[v] = (1 - c.mix) * comb[v] + c.mix / N;

    var meanLL = cnt ? llSum / cnt : LOGN;
    return {
      cfg: c,
      n: cnt,
      rows: rows,
      labels: experts.map(function (o) { return o.label; }),
      names: experts.map(function (o) { return o.name; }),
      weights: Array.prototype.slice.call(w),
      ll: meanLL,
      llBase: LOGN,
      gain: 1 - meanLL / LOGN,
      ks: ks.map(function (o) {
        var z = binomZ(o.hit, cnt, o.k / N);
        return {
          k: o.k, hit: o.hit,
          rate: cnt ? o.hit / cnt : 0,
          expected: o.k / N,
          z: z, p: normSf(z)
        };
      }),
      next: { order: rankOrder(comb), p: comb }
    };
  }

  /* ---------------- ค้นหา config ที่ชนะบนช่วง train เท่านั้น ------------- */
  // ใช้สำหรับ "จูนสูตรให้อัตราชนะสูงสุด" อย่างถูกต้อง: เลือกจากอดีต แล้ววัดผลบนอนาคต
  function selectConfig(vals, cfgs, split, k) {
    var all = cfgs.map(function (o) {
      var r = run(vals.slice(0, split), o);
      var s = r.ks.filter(function (x) { return x.k === k; })[0] || r.ks[r.ks.length - 1];
      return { cfg: o, rate: s.rate, hit: s.hit, n: r.n, ll: r.ll, z: s.z };
    });
    var sorted = all.slice().sort(function (a, b) {
      return b.rate - a.rate || a.ll - b.ll;
    });
    return { best: sorted[0], all: sorted };
  }

  // สุ่มล้วน k ตัวต่องวด ในช่วง index เดียวกัน → กรอบว่าความบังเอิญให้อัตราเท่าไร
  function randomBaseline(vals, from, B, k, seed) {
    var rnd = mulberry32(seed || 777), out = [], b, i, j, t;
    for (b = 0; b < B; b++) {
      var hit = 0, n = 0;
      for (i = from; i < vals.length; i++) {
        var pool = new Array(N);
        for (j = 0; j < N; j++) pool[j] = j;
        for (j = 0; j < k; j++) {
          var q = j + Math.floor(rnd() * (N - j));
          t = pool[j]; pool[j] = pool[q]; pool[q] = t;
        }
        var inSet = false;
        for (j = 0; j < k; j++) if (pool[j] === vals[i]) { inSet = true; break; }
        if (inSet) hit++;
        n++;
      }
      out.push(hit / n);
    }
    return out;
  }

  /* ------------------------- leakage audit ------------------------------ */
  // ตรวจว่า "ทายงวดที่ i โดยใช้ข้อมูลถึง i" ให้ผลตรงกับที่รันทั้งชุดหรือไม่
  // ถ้ามีการแอบใช้ข้อมูลอนาคต ค่าจะไม่ตรงกัน
  function leakageAudit(vals, cfg, inds, k) {
    var full = run(vals, cfg);
    var out = inds.map(function (i) {
      var row = null;
      for (var j = 0; j < full.rows.length; j++) if (full.rows[j].i === i) { row = full.rows[j]; break; }
      if (!row) return { i: i, ok: true, skipped: true };
      var pre = run(vals.slice(0, i), cfg);
      var a = row.picks.slice(0, k).join(',');
      var b = pre.next.order.slice(0, k).join(',');
      return { i: i, ok: a === b };
    });
    return { checks: out, pass: out.filter(function (o) { return o.ok; }).length };
  }

  /* ----------------------- โมเดลชุดเดียว (joint) ------------------------- */
  // รวมคะแนน "บน" + "ล่าง" แล้วเลือกชุดเดียว 50 ตัว ใช้ตรวจทั้งสองรางวัล
  function jointOrder(pT, pB) {
    var s = new Float64Array(N);
    for (var v = 0; v < N; v++) s[v] = 0.5 * pT[v] + 0.5 * pB[v];
    return { order: rankOrder(s), p: s };
  }

  function jointRows(a, b, k) {
    var out = [], m = Math.min(a.rows.length, b.rows.length), i, j;
    for (i = 0; i < m; i++) {
      var ra = a.rows[i], rb = b.rows[i];
      if (!ra.prob || !rb.prob || ra.i !== rb.i) continue;
      j = jointOrder(ra.prob, rb.prob);
      var rT = j.order.indexOf(ra.x), rB = j.order.indexOf(rb.x);
      out.push({
        i: ra.i, xTop: ra.x, xBot: rb.x,
        rankT: rT, rankB: rB, hitT: rT < k, hitB: rB < k,
        hitE: rT < k || rB < k,
        picks: j.order.slice(0, k)
      });
    }
    return out;
  }

  function jointNext(a, b, k) {
    var j = jointOrder(a.next.p, b.next.p);
    return { order: j.order.slice(0, k), p: j.p };
  }

  // เลือกสูตรจาก train (ใช้ joint hit rate) — ห้ามใช้ข้อมูล test
  function selectJoint(tv, bv, cfgs, split, k) {
    var all = cfgs.map(function (o) {
      var c = Object.assign({}, o, { track: true });
      var a = run(tv, c), b = run(bv, c);
      var jr = jointRows(a, b, k);
      var tr = jr.filter(function (r) { return r.i < split; });
      var te = jr.filter(function (r) { return r.i >= split; });
      function rate(A) { return A.length ? A.filter(function (r) { return r.hitE; }).length / A.length : 0; }
      function rt(A) { return A.length ? A.filter(function (r) { return r.hitT; }).length / A.length : 0; }
      function rb(A) { return A.length ? A.filter(function (r) { return r.hitB; }).length / A.length : 0; }
      return {
        cfg: o, train: rate(tr), test: rate(te),
        trainT: rt(tr), trainB: rb(tr), testT: rt(te), testB: rb(te),
        nTrain: tr.length, nTest: te.length
      };
    });
    var sorted = all.slice().sort(function (x, y) {
      return y.train - x.train || (y.trainT + y.trainB) - (x.trainT + x.trainB);
    });
    return { best: sorted[0], all: sorted };
  }

  // สุ่ม 50 ตัวชุดเดียว ตรวจทั้งบน+ล่าง
  function randomBaselineJoint(tv, bv, from, B, k, seed) {
    var rnd = mulberry32(seed || 777), out = [], b, i, j, t, pool;
    for (b = 0; b < B; b++) {
      var h = 0, n = 0;
      for (i = from; i < tv.length; i++) {
        pool = new Array(N);
        for (j = 0; j < N; j++) pool[j] = j;
        for (j = 0; j < k; j++) {
          var q = j + Math.floor(rnd() * (N - j));
          t = pool[j]; pool[j] = pool[q]; pool[q] = t;
        }
        var inT = false, inB = false;
        for (j = 0; j < k; j++) {
          if (pool[j] === tv[i]) inT = true;
          if (pool[j] === bv[i]) inB = true;
        }
        if (inT || inB) h++;
        n++;
      }
      out.push(h / n);
    }
    return out;
  }

  function leakageAuditJoint(tv, bv, cfg, inds, k) {
    var c = Object.assign({}, cfg, { track: true });
    var rows = jointRows(run(tv, c), run(bv, c), k);
    var checks = inds.map(function (i) {
      var row = null;
      for (var j = 0; j < rows.length; j++) if (rows[j].i === i) { row = rows[j]; break; }
      if (!row) return { i: i, ok: true, skipped: true };
      var nx = jointNext(run(tv.slice(0, i), c), run(bv.slice(0, i), c), k);
      return { i: i, ok: row.picks.join(',') === nx.order.join(',') };
    });
    return { checks: checks, pass: checks.filter(function (o) { return o.ok; }).length };
  }

  function shuffleControlJoint(tv, bv, cfg, B, seed, from, k, realZ, onDone, onProgress) {
    var rnd = mulberry32(seed || 12345), zs = [], b = 0;
    var c = Object.assign({}, cfg, { track: true });
    function chunk() {
      var end = Math.min(B, b + 3);
      for (; b < end; b++) {
        var rows = jointRows(run(shuffleCopy(tv, rnd), c), run(shuffleCopy(bv, rnd), c), k)
          .filter(function (r) { return r.i >= from; });
        var hit = rows.filter(function (r) { return r.hitE; }).length;
        // สุ่มล้วน: P(ถูกอย่างน้อย 1 รางวัล) = 1 - (1 - k/100)^2
        var p0 = 1 - Math.pow(1 - k / N, 2);
        zs.push(binomZ(hit, rows.length, p0));
      }
      if (onProgress) onProgress(b / B);
      if (b < B) { setTimeout(chunk, 0); }
      else {
        var mean = zs.reduce(function (s, z) { return s + z; }, 0) / zs.length;
        var sorted = zs.slice().sort(function (a, d) { return a - d; });
        onDone({
          B: B, mean: mean,
          p95: sorted[Math.floor(0.95 * (sorted.length - 1))],
          max: sorted[sorted.length - 1],
          zs: zs,
          pValue: (zs.filter(function (z) { return z >= realZ; }).length + 1) / (B + 1)
        });
      }
    }
    chunk();
  }

  /* ------------------- seeded shuffle / control test --------------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffleCopy(vals, rnd) {
    var a = vals.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // รัน B รอบบนข้อมูลที่สลับลำดับแล้ว (คงการกระจายตัวเดิม) → ดูว่า z ที่ได้เป็นเพราะสูตร
  // หรือเพราะความบังเอิญของลำดับ (ถ้าเป็นสุ่มจริง z ของข้อมูลจริงควรอยู่ในกลุ่มนี้)
  function shuffleControl(vals, opts, B, seed, onDone, onProgress) {
    var rnd = mulberry32(seed || 12345);
    var zs = [], b = 0;
    var kk = (opts && opts.ks) ? opts.ks[opts.ks.length - 1] : 50;
    var from = (opts && opts.from) || 0;
    function chunk() {
      var end = Math.min(B, b + 4);
      for (; b < end; b++) {
        var r = run(shuffleCopy(vals, rnd), opts);
        var rows = r.rows.filter(function (x) { return x.i >= from; });
        var hit = rows.filter(function (x) { return x.rank < kk; }).length;
        zs.push(binomZ(hit, rows.length, kk / N));
      }
      if (onProgress) onProgress(b / B);
      if (b < B) { setTimeout(chunk, 0); }
      else {
        var mean = zs.reduce(function (s, z) { return s + z; }, 0) / zs.length;
        var sorted = zs.slice().sort(function (a, c) { return a - c; });
        onDone({
          B: B, mean: mean,
          p95: sorted[Math.floor(0.95 * (sorted.length - 1))],
          max: sorted[sorted.length - 1],
          zs: zs,
          pValue: opts && typeof opts.realZ === 'number'
            ? (zs.filter(function (z) { return z >= opts.realZ; }).length + 1) / (B + 1)
            : null
        });
      }
    }
    chunk();
  }

  root.LaoModel = {
    N: N, pad2: pad2, DEFAULT: DEFAULT,
    run: run, rankOrder: rankOrder, binomZ: binomZ, normSf: normSf,
    chi2Sf: chi2Sf, diagnostics: diagnostics, digitDiagnostics: digitDiagnostics,
    calendarDiagnostics: calendarDiagnostics,
    selectConfig: selectConfig, randomBaseline: randomBaseline, leakageAudit: leakageAudit,
    jointOrder: jointOrder, jointRows: jointRows, jointNext: jointNext, selectJoint: selectJoint,
    randomBaselineJoint: randomBaselineJoint, leakageAuditJoint: leakageAuditJoint,
    shuffleControlJoint: shuffleControlJoint,
    shuffleControl: shuffleControl, mulberry32: mulberry32,
    // แปลงข้อมูลดิบ → ซีรีส์ตัวเลข
    series: function (raw) {
      var arr = raw.map(function (r) {
        return { d: r[0], n: r[1], top: +r[1].slice(2), bot: +r[1].slice(0, 2) };
      });
      arr.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
      return {
        all: arr,
        top: arr.map(function (o) { return o.top; }),
        bot: arr.map(function (o) { return o.bot; })
      };
    }
  };
})(typeof window !== 'undefined' ? window : this);
