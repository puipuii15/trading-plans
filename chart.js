// Grafik candle + indikator (SMA, Ichimoku, Volume, RSI, MACD) pakai Lightweight Charts v4.
window.TPChart = (() => {
  const UP = '#22b573', DN = '#e5484d';
  const SMA_COLORS = ['#f5a524', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#eab308'];

  // ---------- rumus indikator ----------
  const sma = (a, n) => a.map((_, i) => {
    if (i < n - 1) return null;
    let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k];
    return s / n;
  });
  const ema = (a, n) => {
    const k = 2 / (n + 1); let p = null;
    return a.map(v => { if (v == null) return null; p = p == null ? v : v * k + p * (1 - k); return p; });
  };
  const rsi = (c, n = 14) => {
    const out = [null]; let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) {
        g += up; l += dn;
        if (i === n) { g /= n; l /= n; out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } else out.push(null);
      } else {
        g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
        out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l));
      }
    }
    return out;
  };
  const macd = c => {
    const e12 = ema(c, 12), e26 = ema(c, 26);
    const m = c.map((_, i) => i < 25 ? null : e12[i] - e26[i]);
    const sig = ema(m, 9).map((v, i) => i < 33 ? null : v);
    return { m, sig, hist: m.map((v, i) => v != null && sig[i] != null ? v - sig[i] : null) };
  };
  const mid = (h, l, i, n) => {
    if (i < n - 1) return null;
    let hi = -Infinity, lo = Infinity;
    for (let k = i - n + 1; k <= i; k++) { hi = Math.max(hi, h[k]); lo = Math.min(lo, l[k]); }
    return (hi + lo) / 2;
  };

  // ---------- util ----------
  const day = t => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10); // tanggal WIB
  const futureDays = (last, n) => {
    const out = [], d = new Date(last + 'T00:00:00Z');
    while (out.length < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); }
    return out;
  };
  const ptsW = (times, vals) => vals.map((v, i) => v == null || !isFinite(v) ? { time: times[i] } : { time: times[i], value: v }); // kosong tetap dihitung, supaya sejajar
  const pts = (times, vals) => vals.map((v, i) => v == null || !isFinite(v) ? null : { time: times[i], value: v }).filter(Boolean);

  function base(el, dark, opts = {}) {
    const LC = window.LightweightCharts;
    const ink = dark ? '#8fb0bb' : '#4d6a75', grid = dark ? 'rgba(143,176,187,.08)' : 'rgba(6,34,46,.06)';
    return LC.createChart(el, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: ink, fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderVisible: false, minimumWidth: 64 },
      timeScale: { borderVisible: false, rightOffset: 3 },
      crosshair: { mode: 0 },
      localization: { locale: 'id-ID', priceFormatter: p => Math.round(p).toLocaleString('id-ID') },
      ...opts,
    });
  }

  /**
   * el: kontainer; candles: [[t,o,h,l,c,v]]; o: { inds, lines:[{price,color,title}], dark, panels:true/false }
   * inds: { sma:[20,50], ichi:bool, vol:bool, rsi:bool, macd:bool }
   */
  function render(el, candles, o) {
    if (!window.LightweightCharts) { el.textContent = 'Library grafik gagal dimuat.'; return { destroy() {}, setLines() {} }; }
    const inds = o.inds || {}, panels = o.panels;
    el.innerHTML = '';
    el.classList.add('tpc');
    const mkPane = cls => { const d = document.createElement('div'); d.className = 'tpc-pane ' + cls; el.append(d); return d; };
    const mainEl = mkPane('tpc-main');
    const t = candles.map(c => day(c[0])), C = candles.map(c => c[4]), H = candles.map(c => c[2]), L = candles.map(c => c[3]);
    const charts = [];
    const fut = inds.ichi && C.length > 52 ? futureDays(t[t.length - 1], 26) : [];
    const pad = arr => arr.concat(fut.map(time => ({ time }))); // ruang kosong agar sumbu waktu sejajar

    const main = base(mainEl, o.dark); charts.push(main);
    const cs = main.addCandlestickSeries({ upColor: UP, downColor: DN, borderVisible: false, wickUpColor: UP, wickDownColor: DN, priceLineVisible: true });
    cs.setData(candles.map((c, i) => ({ time: t[i], open: c[1], high: c[2], low: c[3], close: c[4] })));

    if (inds.vol) {
      const v = main.addHistogramSeries({ priceScaleId: '', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      v.setData(candles.map((c, i) => ({ time: t[i], value: c[5] || 0, color: c[4] >= c[1] ? 'rgba(34,181,115,.35)' : 'rgba(229,72,77,.35)' })));
    }
    (inds.sma || []).forEach((n, k) => {
      if (n > 1 && n < C.length) main.addLineSeries({ color: SMA_COLORS[k % SMA_COLORS.length], lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: 'SMA' + n })
        .setData(pts(t, sma(C, n)));
    });
    if (inds.ichi && C.length > 52) {
      const T = t.concat(fut);
      const ten = C.map((_, i) => mid(H, L, i, 9)), kij = C.map((_, i) => mid(H, L, i, 26));
      const A = new Array(T.length).fill(null), B = new Array(T.length).fill(null), chk = new Array(T.length).fill(null);
      C.forEach((_, i) => {
        if (ten[i] != null && kij[i] != null) A[i + 26] = (ten[i] + kij[i]) / 2;
        const b = mid(H, L, i, 52); if (b != null) B[i + 26] = b;
        if (i >= 26) chk[i - 26] = C[i];
      });
      const line = (vals, color, title, extra = {}) => main.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title, ...extra }).setData(pts(T, vals));
      line(ten.concat(new Array(26).fill(null)), '#3b82f6', 'Tenkan');
      line(kij.concat(new Array(26).fill(null)), '#be123c', 'Kijun');
      line(A, 'rgba(34,181,115,.9)', 'Span A');
      line(B, 'rgba(229,72,77,.9)', 'Span B');
      line(chk, 'rgba(168,85,247,.7)', 'Chikou', { lineStyle: 2 });
    }

    let priceLines = [];
    const setLines = lines => {
      priceLines.forEach(p => cs.removePriceLine(p));
      priceLines = (lines || []).filter(x => x.price).map(x => cs.createPriceLine({ price: x.price, color: x.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: x.title }));
    };
    setLines(o.lines);

    if (panels && inds.rsi) {
      const ch = base(mkPane('tpc-sub'), o.dark); charts.push(ch);
      const s = ch.addLineSeries({ color: '#a855f7', lineWidth: 1.5, priceLineVisible: false, title: 'RSI 14' });
      s.setData(pad(ptsW(t, rsi(C))));
      [70, 30].forEach(v => s.createPriceLine({ price: v, color: 'rgba(143,176,187,.6)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
    }
    if (panels && inds.macd) {
      const ch = base(mkPane('tpc-sub'), o.dark); charts.push(ch);
      const { m, sig, hist } = macd(C);
      ch.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false })
        .setData(pad(hist.map((v, i) => v == null ? { time: t[i] } : { time: t[i], value: v, color: v >= 0 ? 'rgba(34,181,115,.6)' : 'rgba(229,72,77,.6)' })));
      ch.addLineSeries({ color: '#3b82f6', lineWidth: 1.5, priceLineVisible: false, title: 'MACD' }).setData(ptsW(t, m));
      ch.addLineSeries({ color: '#f5a524', lineWidth: 1.5, priceLineVisible: false, title: 'Signal' }).setData(ptsW(t, sig));
    }

    // sinkron geser/zoom antar panel
    if (charts.length > 1) {
      charts.slice(1).forEach(c => c.applyOptions({ localization: { priceFormatter: p => p.toFixed(1).replace('.', ',') } }));
      let busy = false;
      charts.forEach(src => src.timeScale().subscribeVisibleLogicalRangeChange(r => {
        if (busy || !r) return; busy = true;
        charts.forEach(c => c !== src && c.timeScale().setVisibleLogicalRange(r)); busy = false;
      }));
    }
    const n = candles.length;
    if (n > 0) main.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - (o.bars || 90)), to: n + (inds.ichi ? 26 : 3) });

    return { setLines, destroy() { charts.forEach(c => c.remove()); el.innerHTML = ''; } };
  }

  return { render, calc: { sma, ema, rsi, macd } };
})();
