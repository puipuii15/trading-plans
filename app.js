(() => {
const $ = id => document.getElementById(id);
const CFG = window.APP_CONFIG || {};
const STOCKS = window.STOCKS || [];
const NAME = new Map(STOCKS.map(([c, n]) => [c, n]));

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('id-ID');
const pf = n => n == null || !isFinite(n) ? '–' : (n > 0 ? '+' : '') + n.toFixed(2).replace('.', ',') + '%';
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
const tick = p => p < 200 ? 1 : p < 500 ? 2 : p < 2000 ? 5 : p < 5000 ? 10 : 25; // fraksi harga BEI
const rnd = (p, on, dir) => { if (!on) return p; const t = tick(p); return (dir < 0 ? Math.floor(p / t) : Math.ceil(p / t)) * t; };
const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const today = () => iso(new Date());
const plus30 = d => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + 30); return iso(x); };
const dShow = d => d ? new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' }) : '';
const stockUrl = c => (CFG.STOCK_LINK || '').replace('{CODE}', encodeURIComponent(c));
const show = v => ['vSetup', 'vAuth', 'vReset', 'vApp'].forEach(id => $(id).hidden = id !== v);

// ---------- calc ----------
function calc(t) {
  const on = t.rnd !== false, en = t.buy;
  const tp1 = t.tp1 != null ? rnd(en * (1 + t.tp1 / 100), on, 1) : null;
  const tp2 = t.tp2 != null ? rnd(en * (1 + t.tp2 / 100), on, 1) : null;
  const cl = t.cl != null ? rnd(en * (1 - t.cl / 100), on, -1) : null;
  const pl = t.exit_price ? (t.exit_price - en) / en * 100 : null;
  const rr = tp1 && cl && en > cl ? (tp1 - en) / (en - cl) : null;
  const nom = t.exit_price && t.lot ? (t.exit_price - en) * t.lot * 100 : null;
  return { tp1, tp2, cl, pl, rr, nom };
}

// ---------- setup ----------
if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('XXXX') || !window.supabase) { show('vSetup'); return; }
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

let user = null, trades = [], def = { tp1: 5, tp2: 10, cl: 4 }, editId = null, lastDel = null, mode = 'in';

$('stockList').innerHTML = STOCKS.map(([c, n]) => `<option value="${esc(c)}" label="${esc(n)}">`).join('');

// ---------- auth ----------
function setMode(m) {
  mode = m;
  $('tabIn').setAttribute('aria-selected', m === 'in');
  $('tabUp').setAttribute('aria-selected', m === 'up');
  $('aBtn').textContent = m === 'in' ? 'Masuk' : 'Buat akun';
  $('aPass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
  $('aForgot').hidden = m !== 'in';
  msg('aMsg');
}
function msg(id, text, ok) { const el = $(id); el.hidden = !text; el.textContent = text || ''; el.className = 'msg ' + (ok ? 'ok' : 'err'); }
const errText = e => {
  const m = (e && e.message) || String(e);
  if (/Invalid login/i.test(m)) return 'Email atau password salah.';
  if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek inbox (dan folder spam).';
  if (/already registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/least 6/i.test(m)) return 'Password minimal 6 karakter.';
  return m;
};
$('tabIn').onclick = () => setMode('in');
$('tabUp').onclick = () => setMode('up');
$('fAuth').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('aEmail').value.trim(), password = $('aPass').value;
  if (!email || password.length < 6) return msg('aMsg', 'Isi email dan password (min. 6 karakter).');
  $('aBtn').disabled = true;
  try {
    if (mode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) msg('aMsg', 'Akun dibuat. Cek email untuk konfirmasi, lalu masuk.', true);
    }
  } catch (err) { msg('aMsg', errText(err)); }
  $('aBtn').disabled = false;
});
$('aForgot').onclick = async () => {
  const email = $('aEmail').value.trim();
  if (!email) return msg('aMsg', 'Isi email dulu, lalu klik "Lupa password?".');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  msg('aMsg', error ? errText(error) : 'Link reset password sudah dikirim ke email.', !error);
};
$('fReset').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $('rPass').value });
  if (error) return msg('rMsg', errText(error));
  history.replaceState(null, '', location.pathname);
  enter();
});
document.querySelectorAll('.eye').forEach(b => b.onclick = () => {
  const i = $(b.dataset.for), on = i.type === 'password';
  i.type = on ? 'text' : 'password'; b.classList.toggle('on', on);
  b.setAttribute('aria-label', on ? 'Sembunyikan password' : 'Tampilkan password'); i.focus();
});
$('logout').onclick = () => sb.auth.signOut();

let recovering = false;
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') { recovering = true; show('vReset'); return; }
  if (recovering && ev !== 'SIGNED_OUT') return;
  const u = session && session.user;
  if (u && (!user || user.id !== u.id)) { user = u; enter(); }
  else if (!u) { user = null; trades = []; show('vAuth'); setMode('in'); }
});

async function enter() {
  recovering = false;
  show('vApp');
  $('uEmail').textContent = user.email;
  $('rows').innerHTML = '<tr><td colspan="12" class="empty">Memuat…</td></tr>';
  const [t, s] = await Promise.all([
    sb.from('trades').select('*').order('created_at', { ascending: false }),
    sb.from('user_settings').select('tp1,tp2,cl').maybeSingle()
  ]);
  if (t.error) { toast('Gagal memuat data: ' + t.error.message); trades = []; } else trades = t.data;
  if (s.data) def = { tp1: +s.data.tp1, tp2: +s.data.tp2, cl: +s.data.cl };
  resetForm(); render();
}

// ---------- form ----------
function readForm() {
  return {
    code: $('code').value.trim().toUpperCase(),
    start_date: $('start').value || null, end_date: $('end').value || null,
    lot: num($('lot').value), buy: num($('buy').value), buy2: num($('buy2').value), exit_price: num($('exit').value),
    status: $('status').value, tp1: num($('tp1').value), tp2: num($('tp2').value), cl: num($('cl').value),
    rnd: $('rnd').value === '1', note: $('note').value.trim() || null
  };
}
function fillForm(t) {
  const s = (id, v) => $(id).value = v ?? '';
  s('code', t.code); s('start', t.start_date); s('end', t.end_date); s('lot', t.lot); s('buy', t.buy); s('buy2', t.buy2);
  s('exit', t.exit_price); s('status', t.status || 'New'); s('tp1', t.tp1); s('tp2', t.tp2); s('cl', t.cl);
  s('rnd', t.rnd === false ? '0' : '1'); s('note', t.note);
  preview();
}
function resetForm() {
  editId = null; $('f').reset();
  $('start').value = today(); $('end').value = plus30(today());
  $('tp1').value = def.tp1; $('tp2').value = def.tp2; $('cl').value = def.cl;
  $('fTitle').textContent = 'Tambah saham'; $('save').textContent = 'Simpan'; $('cancel').hidden = true;
  preview();
}
function codeHint() {
  const c = $('code').value.trim().toUpperCase(), h = $('codeHint');
  if (!c) { h.textContent = ''; h.className = 'hint'; return; }
  const n = NAME.get(c);
  h.textContent = n ? n : 'Kode tidak ada di daftar BEI — cek lagi (atau saham IPO baru).';
  h.className = 'hint' + (n ? '' : ' warn');
}
function preview() {
  codeHint();
  const t = readForm();
  if (!t.buy) { ['oTp1', 'oTp2', 'oEn', 'oCl', 'oRr', 'oPl'].forEach(i => $(i).textContent = '–'); ['dTp1', 'dTp2', 'dCl'].forEach(i => $(i).textContent = ''); return; }
  const c = calc(t), d = v => v ? pf((v - t.buy) / t.buy * 100) : '';
  $('oEn').textContent = fmt(t.buy) + (t.buy2 ? ' – ' + fmt(t.buy2) : '');
  $('oTp1').textContent = fmt(c.tp1); $('dTp1').textContent = d(c.tp1);
  $('oTp2').textContent = fmt(c.tp2); $('dTp2').textContent = d(c.tp2);
  $('oCl').textContent = fmt(c.cl); $('dCl').textContent = d(c.cl);
  $('oRr').textContent = c.rr ? '1 : ' + c.rr.toFixed(2).replace('.', ',') : '–';
  const o = $('oPl'); o.textContent = pf(c.pl) + (c.nom ? ' (' + (c.nom > 0 ? '+' : '') + fmt(c.nom) + ')' : ''); o.className = c.pl > 0 ? 'up' : c.pl < 0 ? 'dn' : '';
}
$('f').addEventListener('input', preview);
$('f').addEventListener('submit', async e => {
  e.preventDefault();
  const t = readForm();
  if (!t.code || !t.buy) return toast('Isi kode saham dan harga Spec buy.');
  $('save').disabled = true;
  const q = editId ? sb.from('trades').update(t).eq('id', editId).select().single()
                   : sb.from('trades').insert(t).select().single();
  const { data, error } = await q;
  $('save').disabled = false;
  if (error) return toast('Gagal simpan: ' + error.message);
  const i = trades.findIndex(x => x.id === data.id);
  if (i >= 0) trades[i] = data; else trades.unshift(data);
  render(); resetForm(); $('code').focus();
});
$('cancel').onclick = resetForm;
$('setDef').onclick = async () => {
  const t = readForm();
  const nd = { tp1: t.tp1 ?? 0, tp2: t.tp2 ?? 0, cl: t.cl ?? 0 };
  const { error } = await sb.from('user_settings').upsert({ user_id: user.id, ...nd });
  if (error) return toast('Gagal simpan default: ' + error.message);
  def = nd; toast(`Default disimpan: TP1 ${def.tp1}%, TP2 ${def.tp2}%, CL ${def.cl}%`);
};

// ---------- table ----------
function render() {
  const q = $('q').value.trim().toLowerCase(), fs = $('fs').value;
  const list = trades.filter(t => (!fs || t.status === fs) && (!q || (t.code + ' ' + (NAME.get(t.code) || '') + ' ' + (t.note || '')).toLowerCase().includes(q)));
  $('rows').innerHTML = list.map(t => {
    const c = calc(t), cls = c.pl > 0 ? 'up' : c.pl < 0 ? 'dn' : '', nm = NAME.get(t.code);
    return `<tr>
    <td><a class="code" href="${esc(stockUrl(t.code))}" target="_blank" rel="noopener" title="Buka di RTI">${esc(t.code)}</a>
      ${nm ? `<span class="small cname" title="${esc(nm)}">${esc(nm)}</span>` : ''}${t.lot ? `<span class="small">${esc(t.lot)} lot</span>` : ''}</td>
    <td>${esc(dShow(t.start_date))}</td><td>${esc(dShow(t.end_date))}</td>
    <td class="n">${fmt(t.buy)}${t.buy2 ? ' – ' + fmt(t.buy2) : ''}</td>
    <td class="n dn">${fmt(c.cl)}<span class="small">-${esc(t.cl ?? '')}%</span></td>
    <td class="n up">${fmt(c.tp1)}<span class="small">+${esc(t.tp1 ?? '')}%</span></td>
    <td class="n up">${fmt(c.tp2)}<span class="small">+${esc(t.tp2 ?? '')}%</span></td>
    <td class="n">${t.exit_price ? fmt(t.exit_price) : '–'}</td>
    <td class="n ${cls}"><b>${pf(c.pl)}</b>${c.nom ? `<span class="small">${c.nom > 0 ? '+' : ''}${fmt(c.nom)}</span>` : ''}</td>
    <td><span class="chip ${esc(t.status)}">${esc(t.status)}</span></td>
    <td class="note">${esc(t.note)}</td>
    <td><div class="row-act"><button type="button" data-e="${esc(t.id)}">Edit</button><button type="button" data-d="${esc(t.id)}">Hapus</button></div></td></tr>`;
  }).join('');
  $('empty').hidden = trades.length > 0;
  if (trades.length && !list.length) $('rows').innerHTML = '<tr><td colspan="12" class="empty">Tidak ada yang cocok dengan filter.</td></tr>';

  const closed = trades.filter(t => t.exit_price && ['TP1', 'TP2', 'CL', 'Closed'].includes(t.status));
  const pls = closed.map(t => calc(t).pl);
  $('sTot').textContent = trades.length;
  $('sOpen').textContent = trades.filter(t => t.status === 'New' || t.status === 'Open').length;
  $('sWin').textContent = pls.length ? Math.round(pls.filter(p => p > 0).length / pls.length * 100) + '%' : '–';
  const avg = pls.length ? pls.reduce((a, b) => a + b, 0) / pls.length : null, sa = $('sAvg');
  sa.textContent = pf(avg); sa.className = 'num ' + (avg > 0 ? 'up' : avg < 0 ? 'dn' : '');
}
$('q').addEventListener('input', render);
$('fs').addEventListener('change', render);
$('rows').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.e) {
    const t = trades.find(x => x.id === b.dataset.e); if (!t) return;
    editId = t.id; fillForm(t);
    $('fTitle').textContent = 'Edit ' + t.code; $('save').textContent = 'Update'; $('cancel').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (b.dataset.d) {
    const i = trades.findIndex(x => x.id === b.dataset.d); if (i < 0) return;
    const t = trades[i];
    const { error } = await sb.from('trades').delete().eq('id', t.id);
    if (error) return toast('Gagal hapus: ' + error.message);
    trades.splice(i, 1); lastDel = { t, i }; render(); toast(t.code + ' dihapus', true);
  }
});

// ---------- toast / undo / csv ----------
let tT;
function toast(m, undo) { $('tMsg').textContent = m; $('undo').hidden = !undo; $('toast').classList.add('on'); clearTimeout(tT); tT = setTimeout(() => $('toast').classList.remove('on'), 5000); }
$('undo').onclick = async () => {
  $('toast').classList.remove('on');
  if (!lastDel) return;
  const { t, i } = lastDel; lastDel = null;
  const { data, error } = await sb.from('trades').insert(t).select().single();
  if (error) return toast('Gagal undo: ' + error.message);
  trades.splice(i, 0, data); render();
};
$('copy').onclick = async () => {
  const h = ['Saham', 'Nama', 'Start', 'End', 'Spec Buy', 'Buy Atas', 'CL/TS', 'TP1', 'TP2', 'Exit', 'P/L %', 'Info', 'Keterangan'];
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [h.join(',')].concat(trades.map(t => { const c = calc(t); return [t.code, NAME.get(t.code), t.start_date, t.end_date, t.buy, t.buy2, c.cl, c.tp1, c.tp2, t.exit_price, c.pl != null ? c.pl.toFixed(2) : '', t.status, t.note].map(q).join(','); }));
  try { await navigator.clipboard.writeText(lines.join('\n')); toast('CSV disalin — paste ke Excel/Sheets'); } catch (e) { toast('Gagal menyalin'); }
};

// label kolom untuk tampilan HP
new MutationObserver(() => { for (const c of document.querySelectorAll('.stack td:not([data-l])')) { let i = 0, p = c; while (p = p.previousElementSibling) i += p.colSpan; c.dataset.l = c.closest('table').rows[0].cells[i]?.textContent || ''; } })
  .observe(document.body, { childList: true, subtree: true });
})();
