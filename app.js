/* Mesa Fondeo – gestor de cuentas de fondeo de futuros · fundedlab_es · by Javier Carbonell */
(() => {
  'use strict';

  // ================================================================ estado
  const KEY = 'mesa-fondeo-v1';
  const PHASES = ['Evaluación', 'Fondeada (PA)', 'Live', 'Perdida', 'Retirada'];
  const PLATFORMS = ['Quantower', 'NinjaTrader', 'Tradovate', 'TradingView', 'R|Trader Pro', 'ATAS', 'Sierra Chart', 'Otra'];
  const FEEDS = ['Rithmic', 'Tradovate', 'dxFeed', 'CQG', 'Otra'];
  const DD_TYPES = ['Trailing intradía', 'Trailing fin de día (EOD)', 'Estático'];
  const EXPENSE_CATS = ['Evaluación / suscripción', 'Reset', 'Activación PA', 'Cuota mensual PA', 'Datos de mercado', 'Licencia plataforma', 'Copiador / VPS', 'Otro gasto'];
  const INCOME_CATS = ['Payout', 'Reembolso', 'Otro ingreso'];
  const FIRMS = ['Apex', 'Topstep', 'Tradeify', 'Take Profit Trader', 'My Funded Futures', 'Lucid Trading', 'Alpha Futures', 'Bulenox', 'Elite Trader Funding'];
  const FEE_NOTE = 'Cuota mensual';
  const LISTS = ['accounts', 'movements', 'copyGroups', 'days'];

  const blank = () => ({ accounts: [], movements: [], copyGroups: [], days: [], deleted: {}, settings: { currency: 'USD' } });

  let S = load();
  const ui = { tab: 'home', accFilter: 'Activas', accQuery: '', moneyType: 'all', moneyRange: 'all', creds: new Set() };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const d = JSON.parse(raw);
      return migrate({ ...blank(), ...d, settings: { currency: d.settings?.currency || 'USD' } });
    } catch { return blank(); }
  }
  function migrate(d) {
    const map = { 'Fase 1': 'Evaluación', 'Fase 2': 'Evaluación', Fondeada: 'Fondeada (PA)' };
    LISTS.forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
    d.accounts.forEach((a) => { if (map[a.phase]) a.phase = map[a.phase]; });
    d.deleted ??= {};
    return d;
  }

  // Cada guardado marca con fecha lo que cambió y lo que se borró (para combinar entre dispositivos).
  const sig = (x) => JSON.stringify({ ...x, updatedAt: 0 });
  let snap = new Map();
  let ver = 0; // versión de los datos: invalida las cachés de cálculo
  function snapshot() { snap = new Map(LISTS.flatMap((k) => S[k].map((x) => [x.id, sig(x)]))); }
  function persist() {
    ver++;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('No se pudo guardar en este dispositivo'); }
  }
  function save() {
    const now = Date.now();
    const seen = new Set();
    for (const k of LISTS) for (const x of S[k]) { seen.add(x.id); if (snap.get(x.id) !== sig(x)) x.updatedAt = now; }
    for (const id of snap.keys()) if (!seen.has(id)) S.deleted[id] = now;
    const old = now - 365 * 864e5;
    for (const [id, t] of Object.entries(S.deleted)) if (t < old) delete S.deleted[id];
    snapshot();
    persist();
    scheduleSync();
  }
  snapshot();

  // ================================================================ utilidades
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

  const fmtCache = new Map();
  const nf = (opts) => {
    const k = JSON.stringify(opts);
    if (!fmtCache.has(k)) fmtCache.set(k, new Intl.NumberFormat('es-ES', { useGrouping: 'always', ...opts }));
    return fmtCache.get(k);
  };
  const money = (v, sign = false) => {
    v = v || 0;
    const dec = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
    const s = nf({ style: 'currency', currency: S.settings.currency || 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
    return sign && v > 0 ? '+' + s : s;
  };
  const kfmt = (v) => (Math.abs(v) >= 1000 ? nf({ maximumFractionDigits: 1 }).format(v / 1000) + 'k' : String(Math.round(v)));
  const pct = (v) => (isFinite(v) ? nf({ maximumFractionDigits: 1 }).format(v) + '%' : '—');
  const fmtDate = (s) => {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es-ES', y === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const monthKey = (d) => (d || '').slice(0, 7);
  const monthName = (k, long = false) => {
    const [y, m] = k.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-ES', long ? { month: 'long', year: 'numeric' } : { month: 'short' });
  };
  const fileSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  const accById = (id) => idx().acc.get(id);
  const accLabel = (a) => (a ? `${a.firm} ${kfmt(num(a.size))}${a.label ? ' · ' + a.label : ''}` : '—');
  const initials = (s) => (s || '?').replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const isActive = (a) => !['Perdida', 'Retirada'].includes(a.phase);
  const isEval = (a) => a.phase === 'Evaluación';
  const isFunded = (a) => a.phase === 'Fondeada (PA)' || a.phase === 'Live';
  const phaseClass = (p) => (p === 'Evaluación' ? 'b-eval' : p === 'Perdida' ? 'b-lost' : p === 'Retirada' ? 'b-other' : 'b-funded');
  const needsInvoice = (m) => (m.type === 'gasto' || m.category === 'Payout') && !(m.files || []).length;

  const svg = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
  const ICON = {
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
    eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'),
    key: svg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L20 3M16 7l3 3M14 9l2 2"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    check: svg('<path d="M20 6L9 17l-5-5"/>'),
    close: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
    clip: svg('<path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
    in: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    out: svg('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
    day: svg('<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    share: svg('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>'),
    open: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>'),
    dup: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>'),
    wallet: svg('<rect x="2" y="5" width="20" height="15" rx="3"/><path d="M16 12h2M2 9h20"/>'),
    chart: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    copier: svg('<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
    file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  };

  function toast(msg) {
    $$('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  const haptic = () => { try { navigator.vibrate?.(8); } catch { /* no-op */ } };

  async function copyText(text, what = 'Copiado') {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
      ta.remove();
    }
    haptic(); toast(`${what} ✓`);
  }

  // ================================================================ cálculos (con caché por versión)
  let cache = { ver: -1 };
  function idx() {
    if (cache.ver === ver) return cache;
    const acc = new Map(S.accounts.map((a) => [a.id, a]));
    const movBy = new Map(), daysBy = new Map();
    for (const m of S.movements) { if (!movBy.has(m.accountId)) movBy.set(m.accountId, []); movBy.get(m.accountId).push(m); }
    for (const d of S.days) { if (!daysBy.has(d.accountId)) daysBy.set(d.accountId, []); daysBy.get(d.accountId).push(d); }
    for (const l of daysBy.values()) l.sort((x, y) => x.date.localeCompare(y.date));
    cache = { ver, acc, movBy, daysBy, stats: new Map(), days: new Map() };
    return cache;
  }

  function totals(movs = S.movements) {
    let spent = 0, earned = 0;
    for (const m of movs) (m.type === 'gasto' ? (spent += num(m.amount)) : (earned += num(m.amount)));
    return { spent, earned, net: earned - spent, roi: spent ? ((earned - spent) / spent) * 100 : NaN };
  }

  // Reglas en dólares: objetivo, drawdown máximo (trailing o estático) y nivel donde se bloquea el trailing.
  function accStats(a) {
    const c = idx();
    if (c.stats.has(a.id)) return c.stats.get(a.id);
    const size = num(a.size);
    const bal = a.balance === '' || a.balance == null ? size : num(a.balance);
    const peak = Math.max(num(a.peak) || size, bal);
    const dd = num(a.maxDD);
    let floor = a.ddType === 'Estático' ? size - dd : peak - dd;
    if (a.ddType !== 'Estático' && num(a.lockAt)) floor = Math.min(floor, num(a.lockAt));
    const profit = bal - size, target = num(a.target), ddRoom = bal - floor;
    const r = {
      bal, peak, floor, profit, ddRoom,
      targetPct: target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 0,
      ddPct: dd > 0 ? Math.max(0, Math.min(100, (ddRoom / dd) * 100)) : 100,
      ...totals(c.movBy.get(a.id) || []),
    };
    c.stats.set(a.id, r);
    return r;
  }

  // Días operados y retiros. Los días mínimos se cuentan desde el último retiro.
  function accDays(a) {
    const c = idx();
    if (c.days.has(a.id)) return c.days.get(a.id);
    const closes = c.daysBy.get(a.id) || [];
    const payouts = (c.movBy.get(a.id) || []).filter((m) => m.type === 'ingreso' && m.category === 'Payout');
    const lastPayout = payouts.map((m) => m.date || '').sort().pop() || '';
    const minProfit = num(a.minDayProfit);
    const r = {
      closes, total: closes.length, lastPayout, lastClose: closes[closes.length - 1],
      cycle: closes.filter((d) => d.date > lastPayout && (!minProfit || num(d.pnl) >= minProfit)).length,
      payouts: payouts.length, withdrawn: payouts.reduce((s, m) => s + num(m.amount), 0),
      minDays: num(a.minDays),
    };
    c.days.set(a.id, r);
    return r;
  }
  const closedToday = (a) => (idx().daysBy.get(a.id) || []).some((d) => d.date === today());

  function inRange(date, range) {
    if (range === 'all') return true;
    if (range === 'month') return (date || '').startsWith(today().slice(0, 7));
    if (range === 'year') return (date || '').startsWith(today().slice(0, 4));
    return true;
  }

  function pendingFees() {
    const mk = today().slice(0, 7);
    return S.accounts.filter((a) => isActive(a) && num(a.monthlyFee) > 0 &&
      !(idx().movBy.get(a.id) || []).some((m) => m.note === FEE_NOTE && (m.date || '').startsWith(mk)));
  }

  // ================================================================ navegación
  const VIEWS = {
    home: { title: 'Inicio', render: renderHome },
    accounts: { title: 'Cuentas', render: renderAccounts, fab: ['Cuenta', () => accountSheet()] },
    money: { title: 'Finanzas', render: renderMoney, fab: ['Movimiento', () => movementSheet()] },
    copy: { title: 'Copiador', render: renderCopy, fab: ['Grupo', () => groupSheet()] },
    settings: { title: 'Ajustes', render: renderSettings },
  };

  function go(tab) {
    if (ui.tab === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    ui.tab = tab;
    try { sessionStorage.setItem('tab', tab); } catch { /* no-op */ }
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    const v = VIEWS[ui.tab];
    $('#title').textContent = v.title;
    const { net } = totals();
    $('#subtitle').innerHTML = ui.tab === 'home'
      ? esc(new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))
      : `Neto total <b class="${net >= 0 ? 'pos' : 'neg'} num">${money(net, true)}</b>`;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    $('#view').innerHTML = v.render();
    let fab = $('.fab');
    if (v.fab) {
      if (!fab) { fab = document.createElement('button'); fab.className = 'fab'; document.body.appendChild(fab); }
      fab.innerHTML = `${ICON.plus}${v.fab[0]}`;
      fab.onclick = v.fab[1];
    } else fab?.remove();
    bindView();
  }

  // ================================================================ INICIO
  function renderHome() {
    const t = totals();
    const active = S.accounts.filter(isActive);
    const funded = active.filter(isFunded);
    const fundedCap = funded.reduce((s, a) => s + num(a.size), 0);
    const potential = funded.reduce((s, a) => s + Math.max(0, accStats(a).profit) * num(a.split || 90) / 100, 0);
    const monthly = active.reduce((s, a) => s + num(a.monthlyFee), 0);
    const atRisk = active.filter((a) => num(a.maxDD) && accStats(a).ddPct < 30);
    const missing = S.movements.filter(needsInvoice).length;

    const hero = `
      <section class="hero">
        <div class="who"><img src="icons/icon.svg" alt="fundedlab_es" width="40" height="40">
          <div><div class="brand-name">fundedlab<span>_es</span></div><div class="brand-by">Mesa Fondeo · by Javier Carbonell</div></div></div>
        ${S.accounts.length || S.movements.length ? `
          <div class="l">Beneficio neto total</div>
          <div class="big num ${t.net >= 0 ? 'pos' : 'neg'}">${money(t.net, true)}</div>
          <div class="chips-row">
            <span class="pill ${t.roi >= 0 ? 'pos' : 'neg'}">ROI ${pct(t.roi)}</span>
            <span class="pill info">${active.length} activa${active.length === 1 ? '' : 's'}</span>
            ${funded.length ? `<span class="pill mute">${funded.length} fondeada${funded.length === 1 ? '' : 's'}</span>` : ''}
          </div>
          ${spark()}` : ''}
      </section>`;

    if (!S.accounts.length && !S.movements.length) {
      return hero + `
        <div class="empty">
          <div class="art">${ICON.wallet}</div>
          <h3>Empieza a controlar tu mesa</h3>
          <p>Registra tus cuentas de fondeo de futuros, los cierres de cada día, lo que gastas y lo que retiras, con sus facturas.</p>
          <div class="row" style="justify-content:center">
            <button class="btn primary" data-act="new-acc">${ICON.plus}Añadir cuenta</button>
            <button class="btn" data-act="demo">Ver ejemplo</button>
          </div>
        </div>`;
    }

    const closedN = active.filter(closedToday).length;
    return hero + `
      <div class="stats">
        <div class="stat"><div class="l">Gastado</div><div class="v num neg">${money(t.spent)}</div></div>
        <div class="stat"><div class="l">Retirado</div><div class="v num pos">${money(t.earned)}</div></div>
        <div class="stat"><div class="l">Fondeado</div><div class="v num">${money(fundedCap)}</div><div class="s">${funded.length} cuenta${funded.length === 1 ? '' : 's'}</div></div>
      </div>

      ${atRisk.length ? `<div class="note warn">⚠️ Cerca del drawdown: ${atRisk.map((a) => `<b>${esc(accLabel(a))}</b> (margen ${money(accStats(a).ddRoom)})`).join(', ')}</div>` : ''}
      ${missing ? `<div class="note" style="cursor:pointer" data-go-invoices="1">${ICON.clip.replace('<svg', '<svg style="width:15px;height:15px;vertical-align:-3px"')} ${missing} movimiento${missing === 1 ? '' : 's'} sin factura adjunta · <u>ver</u></div>` : ''}

      ${active.length ? `
        <div class="card">
          <div class="card-head"><h3>Cierre del día</h3><span class="pill ${closedN === active.length ? 'pos' : 'mute'}">${closedN}/${active.length} cerradas</span></div>
          ${active.map((a) => { const d = accDays(a), done = closedToday(a); return `
            <div class="list-item" data-closeday="${a.id}">
              <div class="avatar">${esc(initials(a.firm))}</div>
              <div class="body"><div class="t">${esc(accLabel(a))}</div>
                <div class="s num">Mín. ${money(accStats(a).floor)} · Días ${d.cycle}${d.minDays ? '/' + d.minDays : ''}</div></div>
              ${done ? `<span class="pill pos">${ICON.check.replace('<svg', '<svg style="width:13px;height:13px"')}Hecho</span>` : `<button class="btn sm primary" data-closeday="${a.id}">Cerrar</button>`}
            </div>`; }).join('')}
        </div>` : ''}

      ${monthly ? `<div class="stats two">
        <div class="stat"><div class="l">Cuotas mensuales</div><div class="v num neg">${money(monthly)}<span class="small muted"> /mes</span></div></div>
        <div class="stat"><div class="l">Payout potencial</div><div class="v num">${money(potential)}</div><div class="s">beneficio × split</div></div>
      </div>` : ''}

      <div class="card">
        <div class="card-head"><h3>Gasto vs retiros</h3><span class="small muted">últimos 6 meses</span></div>
        ${monthChart()}
        <div class="legend"><span><i style="background:var(--red)"></i>Gasto</span><span><i style="background:var(--green)"></i>Retiros</span></div>
      </div>

      ${firmTable()}

      <div class="section-title"><span>Últimos movimientos</span><button class="btn sm ghost" data-go="money">Ver todo</button></div>
      <div class="card">${movementList(S.movements.slice().sort(byDateDesc).slice(0, 5)) || '<div class="muted small">Sin movimientos todavía.</div>'}</div>`;
  }

  // Curva del beneficio neto acumulado
  function spark() {
    const ms = S.movements.filter((m) => m.date).sort((a, b) => a.date.localeCompare(b.date));
    if (ms.length < 2) return '';
    let acc = 0;
    const pts = ms.map((m) => (acc += m.type === 'gasto' ? -num(m.amount) : num(m.amount)));
    pts.unshift(0);
    const W = 400, H = 70, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 6 - ((v - min) / span) * (H - 14)]);
    const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const color = acc >= 0 ? '#34d399' : '#f87171';
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${line}L${W} ${H}L0 ${H}Z" fill="url(#sg)"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function monthChart() {
    const months = [];
    const d = new Date(); d.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
    }
    const by = new Map(months.map((k) => [k, []]));
    for (const m of S.movements) by.get(monthKey(m.date))?.push(m);
    const data = months.map((k) => totals(by.get(k)));
    const max = Math.max(1, ...data.map((x) => Math.max(x.spent, x.earned)));
    const W = 340, H = 150, pad = 22, bw = 16, gw = (W - 10) / months.length;
    let bars = '';
    data.forEach((x, i) => {
      const cx = 5 + gw * i + gw / 2;
      const hs = Math.max(x.spent ? 2 : 0, ((H - pad - 12) * x.spent) / max), he = Math.max(x.earned ? 2 : 0, ((H - pad - 12) * x.earned) / max);
      bars += `<rect x="${cx - bw - 1.5}" y="${H - pad - hs}" width="${bw}" height="${hs}" rx="4" fill="var(--red)" opacity=".9"><title>Gasto ${money(x.spent)}</title></rect>`;
      bars += `<rect x="${cx + 1.5}" y="${H - pad - he}" width="${bw}" height="${he}" rx="4" fill="var(--green)"><title>Retiros ${money(x.earned)}</title></rect>`;
      bars += `<text x="${cx}" y="${H - 5}" fill="var(--muted)" font-size="11" text-anchor="middle">${monthName(months[i])}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto y retiros por mes">
      ${[0.33, 0.66].map((f) => `<line x1="0" x2="${W}" y1="${(H - pad) * f}" y2="${(H - pad) * f}" stroke="var(--line)" stroke-dasharray="3 4"/>`).join('')}
      <line x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line-strong)"/>${bars}</svg>`;
  }

  function firmTable() {
    const firms = {};
    for (const m of S.movements) {
      const f = m.firm || accById(m.accountId)?.firm || 'Sin empresa';
      firms[f] ??= { spent: 0, earned: 0, n: 0 };
      firms[f][m.type === 'gasto' ? 'spent' : 'earned'] += num(m.amount);
    }
    for (const a of S.accounts) { firms[a.firm] ??= { spent: 0, earned: 0, n: 0 }; firms[a.firm].n++; }
    const rows = Object.entries(firms).sort((a, b) => (b[1].earned - b[1].spent) - (a[1].earned - a[1].spent));
    if (!rows.length) return '';
    return `
      <div class="card"><h3>Por empresa</h3>
        <table class="t"><thead><tr><th>Empresa</th><th class="r">Gasto</th><th class="r">Retiros</th><th class="r">Neto</th></tr></thead><tbody>
        ${rows.map(([f, x]) => `<tr><td>${esc(f)} <span class="muted small">(${x.n})</span></td><td class="r neg">${kfmt(x.spent)}</td><td class="r pos">${kfmt(x.earned)}</td><td class="r ${x.earned - x.spent >= 0 ? 'pos' : 'neg'}"><b>${kfmt(x.earned - x.spent)}</b></td></tr>`).join('')}
        </tbody></table></div>`;
  }

  // ================================================================ CUENTAS
  const ACC_FILTERS = {
    Activas: isActive, Evaluación: isEval, Fondeadas: isFunded,
    Perdida: (a) => a.phase === 'Perdida', Retirada: (a) => a.phase === 'Retirada', Todas: () => true,
  };

  function renderAccounts() {
    return `
      <div class="search-wrap">${ICON.search}<input class="search" id="accSearch" type="search" placeholder="Buscar empresa, ID de cuenta, usuario…" value="${esc(ui.accQuery)}" autocomplete="off"></div>
      <div class="chips">${Object.entries(ACC_FILTERS).map(([f, fn]) => `<button class="chip ${ui.accFilter === f ? 'on' : ''}" data-accfilter="${f}">${f}<span class="n">${S.accounts.filter(fn).length}</span></button>`).join('')}</div>
      <div id="accList">${accountList()}</div>`;
  }

  function accountList() {
    const q = ui.accQuery.toLowerCase().trim();
    const list = S.accounts.filter((a) => ACC_FILTERS[ui.accFilter](a) &&
      (!q || `${a.firm} ${a.label} ${a.accountId} ${a.login} ${a.server} ${a.platform} ${a.feed}`.toLowerCase().includes(q)));
    if (list.length) return list.map(accountCard).join('');
    return S.accounts.length
      ? `<div class="empty"><div class="art">${ICON.search}</div><p>No hay cuentas que coincidan.</p></div>`
      : `<div class="empty"><div class="art">${ICON.wallet}</div><h3>Sin cuentas todavía</h3><p>Añade tu primera cuenta de fondeo con sus reglas y credenciales.</p><button class="btn primary" data-act="new-acc">${ICON.plus}Añadir cuenta</button></div>`;
  }

  const CRED_NAMES = { accountId: 'ID cuenta', login: 'Usuario', password: 'Contraseña', server: 'Sistema', gateway: 'Gateway' };

  function accountCard(a) {
    const st = accStats(a), dd = accDays(a);
    const ddCls = st.ddPct < 30 ? 'r' : st.ddPct < 60 ? 'a' : 'g';
    const rules = [
      num(a.dailyLoss) && `Pérdida diaria ${money(num(a.dailyLoss))}`,
      num(a.maxContracts) && `Máx. ${num(a.maxContracts)} contratos`,
      num(a.monthlyFee) && `Cuota ${money(num(a.monthlyFee))}/mes`,
      num(a.split) && `Split ${num(a.split)}%`,
    ].filter(Boolean).join(' · ');
    const open = ui.creds.has(a.id);
    const hasCreds = Object.keys(CRED_NAMES).some((k) => a[k]);
    return `
      <article class="card">
        <div class="acc-head">
          <div class="acc-title"><div class="avatar">${esc(initials(a.firm))}</div>
            <div style="min-width:0"><div class="acc-name">${esc(a.firm)} · ${kfmt(num(a.size))}${a.label ? ` <span class="muted" style="font-weight:500">${esc(a.label)}</span>` : ''}</div>
              <div class="acc-meta">${[a.accountId, a.platform, a.feed].filter(Boolean).map(esc).join(' · ')}</div></div></div>
          <span class="badge ${phaseClass(a.phase)}">${esc(a.phase)}</span>
        </div>
        <div class="acc-balance"><span class="v num">${money(st.bal)}</span><span class="pill ${st.profit >= 0 ? 'pos' : 'neg'} num">${money(st.profit, true)}</span></div>
        ${num(a.target) && isEval(a) ? `<div class="meter"><div class="top"><span>Objetivo <b>${pct(st.targetPct)}</b></span><span class="num">${money(Math.max(0, st.profit))} / ${money(num(a.target))}</span></div><div class="bar g"><i style="width:${st.targetPct}%"></i></div></div>` : ''}
        ${num(a.maxDD) ? `<div class="meter"><div class="top"><span>Balance mínimo <b class="num minbal">${money(st.floor)}</b></span><span>Margen <b class="num">${money(st.ddRoom)}</b></span></div><div class="bar ${ddCls}"><i style="width:${st.ddPct}%"></i></div></div>` : ''}
        ${dd.minDays ? `<div class="meter"><div class="top"><span>Días ${dd.lastPayout ? 'desde el último retiro' : 'operados'} <b>${dd.cycle} / ${dd.minDays}</b>${dd.cycle >= dd.minDays ? ' <span class="pos">✓</span>' : ''}</span></div><div class="bar b"><i style="width:${Math.min(100, (dd.cycle / dd.minDays) * 100)}%"></i></div></div>` : ''}
        <div class="mini3">
          <div><div class="l">Retiros</div><div class="v num">${dd.payouts} · ${money(dd.withdrawn)}</div></div>
          <div><div class="l">Neto cuenta</div><div class="v num ${st.net >= 0 ? 'pos' : 'neg'}">${money(st.net, true)}</div></div>
          <div><div class="l">Último cierre</div><div class="v num ${dd.lastClose ? (num(dd.lastClose.pnl) >= 0 ? 'pos' : 'neg') : 'muted'}">${dd.lastClose ? money(num(dd.lastClose.pnl), true) : '—'}</div></div>
        </div>
        ${rules ? `<div class="small muted" style="margin-top:10px">${rules}</div>` : ''}
        ${open ? `<div class="creds">${Object.entries(CRED_NAMES).filter(([k]) => a[k]).map(([k, n]) => `
          <div class="cred"><span class="k">${n}</span>
            <span class="val" ${k === 'password' ? `data-secret="${a.id}"` : ''}>${k === 'password' ? '••••••••' : esc(a[k])}</span>
            ${k === 'password' ? `<button class="icon-btn" data-reveal="${a.id}" aria-label="Mostrar contraseña">${ICON.eye}</button>` : ''}
            <button class="icon-btn" data-copy="${a.id}:${k}" aria-label="Copiar ${n}">${ICON.copy}</button></div>`).join('')}
          <button class="btn sm ghost" data-copyall="${a.id}">${ICON.copy}Copiar todo</button></div>` : ''}
        <div class="acc-actions">
          <button class="btn primary" data-closeday="${a.id}">${ICON.day}${closedToday(a) ? 'Editar cierre' : 'Cierre de día'}</button>
          ${hasCreds ? `<button class="btn icon ${open ? 'primary' : ''}" data-creds="${a.id}" aria-label="Credenciales" title="Credenciales">${ICON.key}</button>` : ''}
          <button class="btn icon" data-history="${a.id}" aria-label="Historial" title="Historial">${ICON.clock}</button>
          <button class="btn icon" data-accmenu="${a.id}" aria-label="Más opciones" title="Más">${ICON.more}</button>
        </div>
      </article>`;
  }

  function accountMenu(id) {
    const a = accById(id);
    sheet(accLabel(a), `
      <div class="menu">
        <button class="btn" data-m="edit">${ICON.edit}Editar cuenta y reglas</button>
        <button class="btn" data-m="gasto">${ICON.out}Registrar gasto / compra</button>
        <button class="btn" data-m="retiro">${ICON.in}Registrar retiro (payout)</button>
        <button class="btn" data-m="copy">${ICON.copy}Copiar todos los datos</button>
        <button class="btn" data-m="dup">${ICON.dup}Duplicar cuenta</button>
        <button class="btn danger" data-m="del">${ICON.trash}Eliminar cuenta</button>
      </div>`);
    $$('.sheet [data-m]').forEach((b) => (b.onclick = () => {
      const m = b.dataset.m;
      if (m === 'edit') return accountSheet(id);
      if (m === 'gasto') return movementSheet(null, { type: 'gasto', accountId: id, category: 'Reset' });
      if (m === 'retiro') return movementSheet(null, { type: 'ingreso', accountId: id, category: 'Payout' });
      if (m === 'copy') { closeSheet(); return copyAll(a); }
      if (m === 'dup') {
        const { id: _i, accountId: _a, login: _l, password: _p, balance: _b, peak: _k, createdAt: _c, updatedAt: _u, ...rest } = a;
        return accountSheet(null, rest);
      }
      if (m === 'del') {
        if (!confirm(`¿Eliminar ${accLabel(a)}? Sus gastos y retiros se conservan.`)) return;
        S.accounts = S.accounts.filter((x) => x.id !== id);
        S.days = S.days.filter((x) => x.accountId !== id);
        S.copyGroups.forEach((g) => { g.slaves = g.slaves.filter((s) => s.accountId !== id); if (g.masterId === id) g.masterId = ''; });
        save(); closeSheet(); render(); toast('Cuenta eliminada');
      }
    }));
  }

  function copyAll(a) {
    copyText([
      `${a.firm} ${kfmt(num(a.size))} (${a.phase})`,
      `Plataforma: ${a.platform}${a.feed ? ' · ' + a.feed : ''}`,
      ...Object.entries(CRED_NAMES).filter(([k]) => a[k]).map(([k, n]) => `${n}: ${a[k]}`),
    ].join('\n'), 'Datos de la cuenta copiados');
  }

  const opt = (arr, v) => arr.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');

  function accountSheet(id, preset = {}) {
    const a = id ? accById(id) : { phase: 'Evaluación', platform: 'Quantower', feed: 'Rithmic', ddType: 'Trailing intradía', split: 90, ...preset };
    const firms = [...new Set([...FIRMS, ...S.accounts.map((x) => x.firm)])];
    const field = (name, label, ph = '', mode = 'decimal') => `<label class="f"><span>${label}</span><input name="${name}" inputmode="${mode}" value="${esc(a[name])}" placeholder="${ph}"></label>`;
    sheet(id ? 'Editar cuenta' : 'Nueva cuenta', `
      <form id="accForm">
        <div class="grid2">
          <label class="f"><span>Empresa de fondeo</span><input name="firm" list="firmList" required value="${esc(a.firm)}" placeholder="Apex, Topstep…"></label>
          ${field('size', 'Tamaño de la cuenta', '50000').replace('<input', '<input required')}
          <label class="f"><span>Estado</span><select name="phase">${opt(PHASES, a.phase)}</select></label>
          <label class="f"><span>Etiqueta</span><input name="label" value="${esc(a.label)}" placeholder="NQ, #2…"></label>
          <label class="f"><span>Plataforma</span><select name="platform">${opt(PLATFORMS, a.platform)}</select></label>
          <label class="f"><span>Conexión / datos</span><select name="feed">${opt(FEEDS, a.feed)}</select></label>
        </div>
        <div class="form-sec">Acceso</div>
        <label class="f"><span>ID de cuenta</span><input name="accountId" value="${esc(a.accountId)}" autocomplete="off" placeholder="APEX-123456-01"></label>
        <div class="grid2">
          <label class="f"><span>Usuario</span><input name="login" value="${esc(a.login)}" autocomplete="off"></label>
          <label class="f"><span>Contraseña</span><input name="password" type="password" value="${esc(a.password)}" autocomplete="new-password"></label>
          <label class="f"><span>Sistema / servidor</span><input name="server" value="${esc(a.server)}" autocomplete="off" placeholder="Rithmic Paper Trading"></label>
          <label class="f"><span>Gateway</span><input name="gateway" value="${esc(a.gateway)}" autocomplete="off" placeholder="Chicago Area"></label>
        </div>
        <div class="form-sec">Balance y reglas ($)</div>
        <div class="grid2">
          ${field('balance', 'Balance actual', '= tamaño')}
          ${field('peak', 'Balance máximo (pico)', 'automático')}
          ${field('target', 'Objetivo de beneficio', '3000')}
          ${field('maxDD', 'Drawdown máximo', '2500')}
          <label class="f"><span>Tipo de drawdown</span><select name="ddType">${opt(DD_TYPES, a.ddType)}</select></label>
          ${field('lockAt', 'Trailing se detiene en', '50100')}
          ${field('dailyLoss', 'Pérdida diaria máx.')}
          ${field('maxContracts', 'Máx. contratos', '', 'numeric')}
          ${field('split', 'Profit split %', '90')}
          ${field('monthlyFee', 'Cuota mensual', '0')}
          ${field('minDays', 'Días mínimos para retirar', '8', 'numeric')}
          ${field('minDayProfit', 'Ganancia mín. para contar día', '0 = todos')}
        </div>
        ${id ? '' : `<label class="f"><span>Precio pagado ahora (se registra como gasto)</span><input name="cost" inputmode="decimal" placeholder="0"></label>`}
        <label class="f"><span>Notas</span><textarea name="notes" rows="2">${esc(a.notes)}</textarea></label>
        <datalist id="firmList">${firms.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
        <p class="small muted">Revisa las reglas actuales de tu empresa: cambian a menudo.</p>
        <button class="btn primary block" type="submit">${ICON.check}Guardar cuenta</button>
      </form>`);

    $('#accForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const cost = num(f.cost); delete f.cost;
      if (f.balance !== '' && num(f.balance) > (num(f.peak) || num(f.size))) f.peak = f.balance;
      let acc = a;
      if (id) Object.assign(a, f);
      else {
        acc = { id: uid(), createdAt: Date.now(), ...f };
        S.accounts.push(acc);
      }
      save(); closeSheet(); render(); haptic(); toast('Cuenta guardada');
      if (!id && cost > 0) movementSheet(null, { type: 'gasto', amount: cost, accountId: acc.id, category: isFunded(acc) ? 'Activación PA' : 'Evaluación / suscripción' }, 'Adjunta la factura de la compra');
    };
  }

  // ---------------------------------------------------------------- cierre de día
  function closeDaySheet(id) {
    const a = accById(id);
    const intraday = a.ddType === 'Trailing intradía';
    const existing = (idx().daysBy.get(id) || []).find((d) => d.date === today());
    sheet(`Cierre de día · ${accLabel(a)}`, `
      <form id="dayForm">
        <div class="grid2">
          <label class="f"><span>Fecha</span><input name="date" type="date" required value="${esc(existing?.date || today())}"></label>
          <label class="f"><span>Balance de cierre</span><input name="balance" inputmode="decimal" required value="${esc(existing?.balance ?? '')}" placeholder="${esc(accStats(a).bal)}"></label>
        </div>
        ${intraday ? `<label class="f"><span>Balance máximo del día (intradía, opcional)</span><input name="high" inputmode="decimal" value="${esc(existing?.high ?? '')}" placeholder="Si el trailing subió durante el día"></label>` : ''}
        <div class="grid2">
          <label class="f"><span>Estado</span><select name="phase">${opt(PHASES, a.phase)}</select></label>
          <label class="f"><span>Nota</span><input name="note" value="${esc(existing?.note ?? '')}"></label>
        </div>
        <button class="btn primary block" type="submit">${ICON.check}Guardar cierre</button>
      </form>`);
    setTimeout(() => $('#dayForm [name=balance]')?.focus(), 250);
    $('#dayForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const list = idx().daysBy.get(id) || [];
      const before = list.filter((d) => d.date < f.date).pop();
      const hasLater = list.some((d) => d.date > f.date);
      const same = list.find((d) => d.date === f.date);
      const prevBal = before ? num(before.balance) : same?.prev != null ? num(same.prev) : accStats(a).bal;
      const bal = num(f.balance);
      const day = same || { id: uid(), accountId: id, date: f.date };
      if (!same) S.days.push(day);
      Object.assign(day, { balance: bal, prev: prevBal, pnl: Math.round((bal - prevBal) * 100) / 100, high: f.high || '', note: f.note || '' });
      if (!hasLater) a.balance = bal;
      a.phase = f.phase;
      a.peak = Math.max(num(a.peak) || num(a.size), bal, intraday ? num(f.high) : 0);
      save(); render(); haptic();
      const st = accStats(a), dd = accDays(a);
      const summary = [
        `${accLabel(a)}${a.accountId ? ' [' + a.accountId + ']' : ''} · cierre ${f.date}`,
        `P/L del día: ${money(day.pnl, true)}`,
        `Balance: ${money(st.bal)}`,
        num(a.maxDD) ? `Balance mínimo nuevo: ${money(st.floor)} (margen ${money(st.ddRoom)})` : '',
        `Días: ${dd.cycle}${dd.minDays ? '/' + dd.minDays : ''}`,
      ].filter(Boolean);
      sheet('Día cerrado ✓', `
        <div class="stats two">
          <div class="stat"><div class="l">P/L del día</div><div class="v num ${day.pnl >= 0 ? 'pos' : 'neg'}">${money(day.pnl, true)}</div></div>
          <div class="stat"><div class="l">Balance</div><div class="v num">${money(st.bal)}</div></div>
        </div>
        ${num(a.maxDD) ? `<div class="card" style="text-align:center"><div class="small muted">Balance mínimo nuevo</div><div class="num" id="newMin" style="font-size:32px;font-weight:750;letter-spacing:-.02em">${money(st.floor)}</div>
          <div class="small muted">Margen <b class="${st.ddPct < 30 ? 'neg' : 'pos'}">${money(st.ddRoom)}</b> · ${esc(a.ddType)}</div></div>` : ''}
        <div class="stats two">
          <div class="stat"><div class="l">Días ${dd.lastPayout ? 'desde retiro' : 'operados'}</div><div class="v">${dd.cycle}${dd.minDays ? ' / ' + dd.minDays : ''}${dd.minDays && dd.cycle >= dd.minDays ? ' ✓' : ''}</div></div>
          <div class="stat"><div class="l">Retiros</div><div class="v num">${dd.payouts} · ${money(dd.withdrawn)}</div></div>
        </div>
        <div class="row nowrap"><button class="btn grow" id="copySummary">${ICON.copy}Copiar resumen</button><button class="btn primary grow" id="okClose">Listo</button></div>`);
      $('#copySummary').onclick = () => copyText(summary.join('\n'), 'Resumen copiado');
      $('#okClose').onclick = closeSheet;
    };
  }

  function historySheet(id) {
    const a = accById(id);
    const dd = accDays(a);
    const movs = (idx().movBy.get(id) || []).slice().sort(byDateDesc);
    const t = totals(movs);
    sheet(`Historial · ${accLabel(a)}`, `
      <div class="stats two">
        <div class="stat"><div class="l">Días operados</div><div class="v">${dd.total}</div><div class="s">${dd.cycle}${dd.minDays ? '/' + dd.minDays : ''} desde el último retiro</div></div>
        <div class="stat"><div class="l">Retirado</div><div class="v num pos">${money(dd.withdrawn)}</div><div class="s">${dd.payouts} retiro${dd.payouts === 1 ? '' : 's'}</div></div>
        <div class="stat"><div class="l">Gastado</div><div class="v num neg">${money(t.spent)}</div></div>
        <div class="stat"><div class="l">Neto</div><div class="v num ${t.net >= 0 ? 'pos' : 'neg'}">${money(t.net, true)}</div></div>
      </div>
      <div class="section-title"><span>Retiros y gastos</span><button class="btn sm ghost" data-addmov="${id}:ingreso">${ICON.plus}Retiro</button></div>
      <div class="card">${movementList(movs) || '<div class="small muted">Sin movimientos.</div>'}</div>
      <div class="section-title"><span>Cierres diarios</span><span class="small" style="text-transform:none;letter-spacing:0">mantén pulsado para borrar</span></div>
      <div class="card">${dd.closes.length ? dd.closes.slice().reverse().map((d) => `
        <div class="list-item" data-delday="${d.id}">
          <div class="ico day">${ICON.day}</div>
          <div class="body"><div class="t">${esc(fmtDate(d.date))}</div><div class="s num">Balance ${money(num(d.balance))}${d.note ? ' · ' + esc(d.note) : ''}</div></div>
          <div class="amt num ${num(d.pnl) >= 0 ? 'pos' : 'neg'}">${money(num(d.pnl), true)}</div></div>`).join('') : '<div class="small muted">Sin cierres todavía.</div>'}</div>`);
    $$('.sheet [data-delday]').forEach((el) => {
      let timer;
      const del = () => {
        if (!confirm('¿Borrar este cierre?')) return;
        S.days = S.days.filter((x) => x.id !== el.dataset.delday);
        const last = S.days.filter((x) => x.accountId === id).sort((x, y) => x.date.localeCompare(y.date)).pop();
        if (last) a.balance = last.balance;
        save(); render(); historySheet(id);
      };
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); del(); });
      el.addEventListener('touchstart', () => { timer = setTimeout(del, 600); }, { passive: true });
      ['touchend', 'touchmove'].forEach((ev) => el.addEventListener(ev, () => clearTimeout(timer), { passive: true }));
      el.addEventListener('click', () => toast('Mantén pulsado para borrar el cierre'));
    });
  }

  // ================================================================ FINANZAS
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.id > a.id ? 1 : -1);

  function movementList(movs) {
    return movs.map((m) => {
      const a = accById(m.accountId);
      const out = m.type === 'gasto';
      const n = (m.files || []).length;
      return `<div class="list-item" data-mov="${m.id}">
        <div class="ico ${out ? 'out' : 'in'}">${out ? ICON.out : ICON.in}</div>
        <div class="body"><div class="t">${esc(m.category)}${n ? `<span class="clip">${ICON.clip}${n}</span>` : needsInvoice(m) ? '<span class="clip miss" title="Sin factura">' + ICON.clip + '!</span>' : ''}</div>
          <div class="s">${esc(a ? accLabel(a) : m.firm || 'General')} · ${esc(fmtDate(m.date))}${m.note ? ' · ' + esc(m.note) : ''}</div></div>
        <div class="amt num ${out ? 'neg' : 'pos'}">${out ? '−' : '+'}${money(num(m.amount))}</div></div>`;
    }).join('');
  }

  function renderMoney() {
    const inR = S.movements.filter((m) => inRange(m.date, ui.moneyRange));
    const filt = { all: () => true, gasto: (m) => m.type === 'gasto', ingreso: (m) => m.type === 'ingreso', nofile: needsInvoice };
    const movs = inR.filter(filt[ui.moneyType]).sort(byDateDesc);
    const t = totals(inR);
    const fees = pendingFees();
    const groups = new Map();
    movs.forEach((m) => { const k = monthKey(m.date) || '0000-00'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
    const seg = (key, val, label) => `<button class="${ui[key] === val ? 'on' : ''}" data-ui="${key}:${val}">${label}</button>`;
    const chip = (val, label) => `<button class="chip ${ui.moneyType === val ? 'on' : ''}" data-ui="moneyType:${val}">${label}<span class="n">${inR.filter(filt[val]).length}</span></button>`;
    return `
      <div class="seg">${seg('moneyRange', 'month', 'Este mes')}${seg('moneyRange', 'year', 'Este año')}${seg('moneyRange', 'all', 'Todo')}</div>
      <div class="stats">
        <div class="stat"><div class="l">Gastado</div><div class="v num neg">${money(t.spent)}</div></div>
        <div class="stat"><div class="l">Retirado</div><div class="v num pos">${money(t.earned)}</div></div>
        <div class="stat"><div class="l">Neto</div><div class="v num ${t.net >= 0 ? 'pos' : 'neg'}">${money(t.net, true)}</div><div class="s">ROI ${pct(t.roi)}</div></div>
      </div>
      ${fees.length ? `<div class="note"><div class="row between nowrap"><span>${fees.length} cuota${fees.length === 1 ? '' : 's'} mensual${fees.length === 1 ? '' : 'es'} sin registrar este mes · <b>${money(fees.reduce((s, a) => s + num(a.monthlyFee), 0))}</b></span>
        <button class="btn sm primary" data-act="fees">Registrar</button></div></div>` : ''}
      <div class="row nowrap" style="margin-bottom:14px">
        <button class="btn grow" data-act="new-gasto">${ICON.out}Gasto / compra</button>
        <button class="btn grow" data-act="new-ingreso">${ICON.in}Retiro</button>
      </div>
      <div class="chips">${chip('all', 'Todos')}${chip('gasto', 'Gastos')}${chip('ingreso', 'Retiros')}${chip('nofile', 'Sin factura')}</div>
      ${movs.length ? [...groups].map(([k, ms]) => {
        const tt = totals(ms);
        return `<div class="section-title"><span>${k === '0000-00' ? 'Sin fecha' : monthName(k, true)}</span><span class="num ${tt.net >= 0 ? 'pos' : 'neg'}" style="letter-spacing:0">${money(tt.net, true)}</span></div><div class="card">${movementList(ms)}</div>`;
      }).join('') : `<div class="empty"><div class="art">${ui.moneyType === 'nofile' ? ICON.check : ICON.chart}</div><p>${ui.moneyType === 'nofile' ? '¡Todo tiene su factura!' : 'No hay movimientos en este periodo.'}</p></div>`}
      ${S.movements.length ? `<button class="btn block" data-act="csv" style="margin-top:6px">${ICON.share}Exportar CSV</button>` : ''}`;
  }

  function registerFees() {
    const list = pendingFees();
    for (const a of list) S.movements.push({ id: uid(), type: 'gasto', category: isFunded(a) ? 'Cuota mensual PA' : 'Evaluación / suscripción', amount: num(a.monthlyFee), date: today(), accountId: a.id, firm: a.firm, note: FEE_NOTE });
    save(); render(); toast(`${list.length} cuota${list.length === 1 ? '' : 's'} registrada${list.length === 1 ? '' : 's'}`);
  }

  // ---------------------------------------------------------------- movimiento + facturas
  let sheetUrls = [];
  function movementSheet(id, preset = {}, hint = '') {
    const m = id ? S.movements.find((x) => x.id === id) : { type: 'gasto', date: today(), ...preset };
    let files = [...(m.files || [])];
    const cats = (t) => (t === 'gasto' ? EXPENSE_CATS : INCOME_CATS);
    const accOpts = `<option value="">General / sin cuenta</option>` + S.accounts.map((a) => `<option value="${a.id}" ${a.id === m.accountId ? 'selected' : ''}>${esc(accLabel(a))}</option>`).join('');
    sheet(id ? 'Editar movimiento' : m.type === 'gasto' ? 'Nuevo gasto / compra' : 'Nuevo retiro', `
      ${hint ? `<div class="note">${esc(hint)}</div>` : ''}
      <form id="movForm">
        <div class="seg" id="typeSeg">
          <button type="button" data-type="gasto" class="${m.type === 'gasto' ? 'on' : ''}">Gasto / compra</button>
          <button type="button" data-type="ingreso" class="${m.type === 'ingreso' ? 'on' : ''}">Retiro / ingreso</button>
        </div>
        <input type="hidden" name="type" value="${m.type}">
        <div class="grid2">
          <label class="f"><span>Importe</span><input name="amount" inputmode="decimal" required value="${esc(m.amount)}" placeholder="0,00"></label>
          <label class="f"><span>Fecha</span><input name="date" type="date" required value="${esc(m.date)}"></label>
        </div>
        <label class="f"><span>Categoría</span><select name="category" id="catSel"></select></label>
        <label class="f"><span>Cuenta</span><select name="accountId">${accOpts}</select></label>
        <div class="grid2">
          <label class="f"><span>Empresa (si no hay cuenta)</span><input name="firm" list="firmList2" value="${esc(m.firm)}"></label>
          <label class="f"><span>Nota</span><input name="note" value="${esc(m.note)}" placeholder="Nº factura, método…"></label>
        </div>
        <datalist id="firmList2">${[...new Set([...FIRMS, ...S.accounts.map((x) => x.firm)])].map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
        <div class="form-sec">Factura / justificante</div>
        <div class="attach-list" id="attList"></div>
        <label class="attach-zone">${ICON.upload}<span>Adjuntar factura (foto o PDF)</span><input type="file" id="attInput" accept="image/*,application/pdf" multiple hidden></label>
        <button class="btn primary block" type="submit">${ICON.check}Guardar</button>
      </form>
      ${id ? `<button class="btn danger block" id="delMov" style="margin-top:10px">${ICON.trash}Eliminar movimiento</button>` : ''}`);

    const fillCats = (t) => { $('#catSel').innerHTML = cats(t).map((c) => `<option ${c === m.category ? 'selected' : ''}>${c}</option>`).join(''); };
    fillCats(m.type);
    $$('#typeSeg button').forEach((b) => (b.onclick = () => {
      $$('#typeSeg button').forEach((x) => x.classList.toggle('on', x === b));
      $('#movForm [name=type]').value = b.dataset.type; fillCats(b.dataset.type);
    }));

    const drawFiles = async () => {
      const box = $('#attList');
      if (!box) return;
      box.innerHTML = files.map((f) => `<div class="att" data-att="${f.id}" title="${esc(f.name)}">
        <button type="button" class="x" data-rm="${f.id}" aria-label="Quitar">×</button>
        <span class="ext">${esc((f.name.split('.').pop() || '').toUpperCase().slice(0, 4))}</span><span class="nm">${esc(f.name)}</span></div>`).join('');
      box.style.display = files.length ? '' : 'none';
      for (const f of files.filter((x) => x.type.startsWith('image/'))) {
        const rec = await Files.get(f.id).catch(() => null);
        const el = box.querySelector(`[data-att="${f.id}"]`);
        if (rec?.blob && el) { const u = URL.createObjectURL(rec.blob); sheetUrls.push(u); el.insertAdjacentHTML('afterbegin', `<img src="${u}" alt="">`); }
      }
    };
    drawFiles();
    $('#attList').onclick = (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { files = files.filter((f) => f.id !== rm.dataset.rm); drawFiles(); return; }
      const att = e.target.closest('[data-att]');
      if (att) viewFile(files.find((f) => f.id === att.dataset.att));
    };
    $('#attInput').onchange = async (e) => {
      const list = [...e.target.files];
      e.target.value = '';
      for (const file of list) {
        try { files.push(await Files.add(file, uid())); } catch (err) { toast(err.message || 'No se pudo adjuntar'); }
      }
      drawFiles(); haptic();
    };

    $('#movForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      f.amount = num(f.amount);
      if (f.accountId && !f.firm) f.firm = accById(f.accountId)?.firm || '';
      f.files = files;
      const removed = (m.files || []).filter((x) => !files.some((y) => y.id === x.id));
      if (id) Object.assign(m, f); else S.movements.push({ id: uid(), ...f });
      removed.forEach(dropFile);
      save(); closeSheet(); render(); haptic();
      toast(files.length ? 'Guardado con factura ✓' : 'Movimiento guardado');
    };
    $('#delMov')?.addEventListener('click', () => {
      if (!confirm('¿Eliminar este movimiento y sus facturas?')) return;
      (m.files || []).forEach(dropFile);
      S.movements = S.movements.filter((x) => x.id !== id);
      save(); closeSheet(); render();
    });
  }

  // Quita una factura del dispositivo y, si está sincronizada, también de la nube.
  function dropFile(meta) {
    Files.del(meta.id).catch(() => {});
    if (meta.up && syncOn()) { sync.delFiles = [...(sync.delFiles || []), meta.id]; saveSync(); }
  }

  async function viewFile(meta) {
    if (!meta) return;
    let rec = await Files.get(meta.id).catch(() => null);
    if (!rec && meta.up && syncOn()) {
      toast('Descargando factura…');
      try { rec = await downloadFile(meta); } catch (err) { toast(err.message); return; }
    }
    if (!rec) { toast('Esta factura está en otro dispositivo. Activa la sincronización para verla aquí.'); return; }
    const url = URL.createObjectURL(rec.blob);
    sheetUrls.push(url);
    const isImg = rec.type.startsWith('image/'), isPdf = rec.type === 'application/pdf';
    // La factura se abre en una capa encima del movimiento
    const layer = document.createElement('div');
    layer.className = 'sheet-bg';
    layer.style.zIndex = 50;
    layer.innerHTML = `<div class="sheet viewer" role="dialog" aria-label="Factura">
      <div class="sheet-head"><h2>${esc(meta.name)}</h2><button class="icon-btn" data-x aria-label="Cerrar">${ICON.close}</button></div>
      ${isImg ? `<img src="${url}" alt="${esc(meta.name)}">` : isPdf ? `<iframe src="${url}" title="${esc(meta.name)}"></iframe>` : `<div class="empty"><div class="art">${ICON.file}</div><p>${esc(meta.name)}</p></div>`}
      <p class="small muted">${fileSize(rec.blob.size)}</p>
      <div class="row nowrap"><a class="btn grow" href="${url}" target="_blank" rel="noopener">${ICON.open}Abrir</a><button class="btn primary grow" data-sharefile>${ICON.share}Compartir / guardar</button></div>
    </div>`;
    layer.addEventListener('click', (e) => { if (e.target === layer || e.target.closest('[data-x]')) layer.remove(); });
    layer.querySelector('[data-sharefile]').onclick = async () => {
      const file = new File([rec.blob], meta.name, { type: rec.type });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: meta.name }); return; } catch (err) { if (err.name === 'AbortError') return; } }
      download(meta.name, rec.blob);
    };
    document.body.appendChild(layer);
  }

  function exportCSV() {
    const rows = [['fecha', 'tipo', 'categoria', 'importe', 'empresa', 'cuenta', 'nota', 'facturas']];
    S.movements.slice().sort(byDateDesc).forEach((m) => rows.push([m.date, m.type === 'gasto' ? 'gasto' : 'retiro', m.category, num(m.amount).toFixed(2).replace('.', ','), m.firm || accById(m.accountId)?.firm || '', accLabel(accById(m.accountId)), m.note || '', (m.files || []).map((f) => f.name).join(' | ')]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    download(`movimientos-${today()}.csv`, new Blob(['﻿' + csv], { type: 'text/csv' }));
  }

  // ================================================================ COPIADOR
  function renderCopy() {
    const intro = `<div class="note">Define la cuenta <b>líder</b> y las que la <b>siguen</b>, con su ratio y límite de contratos.
      La app no envía órdenes: la copia en tiempo real la hace el copiador de tu plataforma (Quantower, Tradovate, NinjaTrader…); aquí calculas contratos y copias IDs y ratios para configurarlo.</div>`;
    if (!S.copyGroups.length) return intro + `<div class="empty"><div class="art">${ICON.copier}</div><h3>Sin grupos de copia</h3><p>Crea un grupo para calcular los contratos de cada cuenta.</p><button class="btn primary" data-act="new-group">${ICON.plus}Crear grupo</button></div>`;
    return intro + S.copyGroups.map(groupCard).join('');
  }

  // Contratos de la cuenta seguidora; si no sale entero, equivalente en micros (1 mini = 10 micros)
  function followerSize(g, s, lead) {
    const master = accById(g.masterId), acc = accById(s.accountId);
    if (!acc) return { text: '—', plain: '—' };
    let q = lead * num(s.multiplier || 1);
    if (g.mode === 'balance' && master) q *= num(acc.size) / (num(master.size) || 1);
    const max = num(acc.maxContracts);
    let capped = false;
    if (max && q > max) { q = max; capped = true; }
    const whole = Math.floor(q + 1e-9);
    const cap = capped ? ' (máx.)' : '';
    if (Math.abs(q - whole) < 1e-9 || g.unit === 'micro') {
      const u = g.unit === 'micro' ? 'micros' : 'contratos';
      return { text: `<b>${whole}</b> ${u}${cap}`, plain: `${whole} ${u}${cap}` };
    }
    const micros = Math.floor(q * 10 + 1e-9);
    return { text: `<b>${whole}</b> contratos <span class="muted">o ${micros} micros</span>${cap}`, plain: `${whole} contratos o ${micros} micros${cap}` };
  }

  function groupCard(g) {
    const master = accById(g.masterId);
    const lead = num(g.calcLot ?? 1);
    const unit = g.unit === 'micro' ? 'micros' : 'contratos';
    return `
      <article class="card">
        <div class="card-head"><div><h3>${esc(g.name)}</h3><div class="small muted">${g.mode === 'balance' ? 'Proporcional al tamaño × ratio' : 'Ratio fijo'} · en ${unit}</div></div>
          <button class="btn icon" data-editgroup="${g.id}" aria-label="Editar">${ICON.edit}</button></div>
        <div class="node lead"><span>👑 <b>${esc(accLabel(master))}</b>${master?.accountId ? `<br><span class="id">${esc(master.accountId)}</span>` : ''}</span><span class="num"><b>${lead}</b> ${unit}</span></div>
        <div class="flow">↓</div>
        ${g.slaves.map((s) => { const a = accById(s.accountId); return `<div class="node"><span>${esc(accLabel(a))}${a?.accountId ? `<br><span class="id">${esc(a.accountId)}</span>` : ''}</span><span class="num" style="text-align:right">×${esc(s.multiplier)} → ${followerSize(g, s, lead).text}</span></div>`; }).join('') || '<div class="small muted">Sin cuentas seguidoras.</div>'}
        <div class="row nowrap" style="margin-top:14px">
          <span class="small muted">Contratos líder</span>
          <input class="lot-input num" inputmode="decimal" data-calclot="${g.id}" value="${esc(g.calcLot ?? 1)}" aria-label="Contratos de la cuenta líder">
          <button class="btn grow" data-copylots="${g.id}">${ICON.copy}Copiar</button>
        </div>
      </article>`;
  }

  function groupSheet(id) {
    const g = id ? S.copyGroups.find((x) => x.id === id) : { name: '', masterId: '', mode: 'fixed', unit: 'mini', slaves: [] };
    const active = S.accounts.filter(isActive);
    if (active.length < 2) { toast('Necesitas al menos 2 cuentas activas'); return; }
    sheet(id ? 'Editar grupo' : 'Nuevo grupo de copia', `
      <form id="grpForm">
        <label class="f"><span>Nombre</span><input name="name" required value="${esc(g.name)}" placeholder="NQ Apex"></label>
        <label class="f"><span>Cuenta líder</span><select name="masterId" required>${active.map((a) => `<option value="${a.id}" ${a.id === g.masterId ? 'selected' : ''}>${esc(accLabel(a))}</option>`).join('')}</select></label>
        <div class="grid2">
          <label class="f"><span>Cálculo</span><select name="mode">
            <option value="fixed" ${g.mode !== 'balance' ? 'selected' : ''}>Ratio fijo</option>
            <option value="balance" ${g.mode === 'balance' ? 'selected' : ''}>Proporcional al tamaño</option></select></label>
          <label class="f"><span>Unidad</span><select name="unit">
            <option value="mini" ${g.unit !== 'micro' ? 'selected' : ''}>Minis (NQ, ES…)</option>
            <option value="micro" ${g.unit === 'micro' ? 'selected' : ''}>Micros (MNQ, MES…)</option></select></label>
        </div>
        <div class="form-sec">Cuentas seguidoras · ratio</div>
        ${active.map((a) => {
          const s = g.slaves.find((x) => x.accountId === a.id);
          return `<div class="node"><label class="check grow"><input type="checkbox" name="sl_${a.id}" ${s ? 'checked' : ''}> ${esc(accLabel(a))}</label>
            <span class="row nowrap">×<input class="mul-input" name="mul_${a.id}" inputmode="decimal" value="${esc(s?.multiplier ?? 1)}"></span></div>`;
        }).join('')}
        <button class="btn primary block" type="submit" style="margin-top:14px">${ICON.check}Guardar grupo</button>
      </form>
      ${id ? `<button class="btn danger block" id="delGrp" style="margin-top:10px">${ICON.trash}Eliminar grupo</button>` : ''}`);
    $('#grpForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const slaves = S.accounts.filter((a) => f['sl_' + a.id] && a.id !== f.masterId).map((a) => ({ accountId: a.id, multiplier: num(f['mul_' + a.id]) || 1 }));
      const data = { name: f.name, masterId: f.masterId, mode: f.mode, unit: f.unit, slaves };
      if (id) Object.assign(g, data); else S.copyGroups.push({ id: uid(), calcLot: 1, ...data });
      save(); closeSheet(); render(); toast('Grupo guardado');
    };
    $('#delGrp')?.addEventListener('click', () => {
      if (!confirm('¿Eliminar este grupo?')) return;
      S.copyGroups = S.copyGroups.filter((x) => x.id !== id);
      save(); closeSheet(); render();
    });
  }

  // ================================================================ AJUSTES
  function renderSettings() {
    const nFiles = S.movements.reduce((s, m) => s + (m.files || []).length, 0);
    return `
      <div class="card"><h3>☁ Sincronización (PC, móvil, tablet…)</h3>
        ${syncOn() ? `
          <p class="small"><span class="pill ${sync.error ? 'neg' : 'pos'}">${sync.error ? '⚠ ' + esc(sync.error) : '✓ Activada'}</span>${sync.last ? ` <span class="muted">· ${new Date(sync.last).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>` : ''}</p>
          <p class="small muted">Cada cambio, cierre y factura se guarda en este dispositivo y se sube cifrado a tu GitHub. Los demás dispositivos lo reciben al abrir la app.</p>
          <div class="row"><button class="btn primary grow" data-act="sync-now">Sincronizar ahora</button><button class="btn grow" data-act="sync-off">Desconectar</button></div>` : `
          <p class="small muted">Haz esto una vez en cada dispositivo con el <b>mismo token</b> y la <b>misma contraseña</b>:</p>
          <ol class="steps">
            <li><a href="https://github.com/settings/tokens/new?scopes=gist&description=Mesa%20Fondeo" target="_blank" rel="noopener">Crea un token de GitHub</a> (permiso <b>gist</b> ya marcado, «No expiration») y cópialo.</li>
            <li>Pégalo aquí y elige una contraseña de sincronización.</li>
          </ol>
          <label class="f"><span>Token de GitHub</span><input id="syncToken" type="password" autocomplete="off" placeholder="ghp_…"></label>
          <label class="f"><span>Contraseña de sincronización (cifra tus datos)</span><input id="syncPass" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>
          <button class="btn primary block" data-act="sync-on">Activar sincronización</button>`}
      </div>

      <div class="card"><h3>Pasar datos por archivo</h3>
        <p class="small muted">Sin nube: envía un archivo cifrado (WhatsApp, AirDrop, correo…) y ábrelo en el otro dispositivo con <b>Recibir datos</b>. Se combina con lo que haya, incluidas las facturas.</p>
        <label class="f"><span>Contraseña del archivo</span><input type="password" id="sharePass" autocomplete="new-password" placeholder="Mínimo 4 caracteres"></label>
        <div class="row nowrap">
          <button class="btn primary grow" data-act="share">${ICON.share}Compartir datos</button>
          <label class="btn grow">${ICON.upload}Recibir datos<input type="file" id="restore" hidden></label>
        </div>
      </div>

      <div class="card"><h3>General</h3>
        <label class="f"><span>Moneda</span><select data-setting="currency">${opt(['USD', 'EUR', 'GBP', 'MXN', 'COP', 'ARS', 'CLP'], S.settings.currency)}</select></label>
        <div class="small muted" id="storageInfo">${S.accounts.length} cuentas · ${S.movements.length} movimientos · ${S.days.length} cierres · ${nFiles} facturas</div>
      </div>

      <div class="card"><h3>Instalar la app</h3>
        <p class="small muted" style="margin:0"><b>iPhone:</b> Safari → Compartir → «Añadir a pantalla de inicio».<br>
        <b>Android:</b> Chrome → ⋮ → «Instalar aplicación».<br><b>PC:</b> Chrome / Edge → icono de instalar en la barra de direcciones.</p>
      </div>

      <div class="note warn">Las credenciales se guardan sin cifrar en este dispositivo. En la nube y en los archivos compartidos van cifradas con tu contraseña.</div>
      <button class="btn danger block" data-act="wipe">${ICON.trash}Borrar todos los datos de este dispositivo</button>
      <p class="small muted" style="text-align:center;margin-top:18px">fundedlab<span style="color:var(--brand)">_es</span> · Mesa Fondeo · by Javier Carbonell</p>`;
  }

  async function storageInfo() {
    const el = $('#storageInfo');
    if (!el || !navigator.storage?.estimate) return;
    const { usage } = await navigator.storage.estimate();
    if (usage && $('#storageInfo')) el.insertAdjacentText('beforeend', ` · ${fileSize(usage)} usados`);
  }

  // ================================================================ cifrado
  // base64 por bloques: String.fromCharCode(...arr) revienta la pila con archivos grandes
  function b64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const keyCache = new Map();
  let lastSalt = null;
  async function deriveKey(pass, salt) {
    const ck = pass + '|' + b64(salt);
    if (!keyCache.has(ck)) {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
      keyCache.set(ck, await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
    }
    return keyCache.get(ck);
  }
  async function encryptBytes(bytes, pass) {
    const salt = lastSalt?.pass === pass ? lastSalt.salt : crypto.getRandomValues(new Uint8Array(16));
    lastSalt = { pass, salt };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt), bytes);
    return { enc: 'AES-GCM', salt: b64(salt), iv: b64(iv), data: b64(ct) };
  }
  async function decryptBytes(p, pass) {
    const salt = unb64(p.salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, await deriveKey(pass, salt), unb64(p.data));
    lastSalt = { pass, salt };
    return new Uint8Array(pt);
  }
  const encryptData = async (obj, pass) => ({ app: 'mesa-fondeo', format: 1, ...(await encryptBytes(new TextEncoder().encode(JSON.stringify(obj)), pass)) });
  const decryptData = async (p, pass) => JSON.parse(new TextDecoder().decode(await decryptBytes(p, pass)));

  // ================================================================ compartir por archivo
  const shareable = () => { const { lastSync: _l, ...d } = S; return d; };

  async function shareData() {
    const pass = $('#sharePass')?.value || '';
    if (pass && pass.length < 4) { toast('La contraseña debe tener al menos 4 caracteres'); return; }
    if (!pass && !confirm('Sin contraseña, el archivo lleva tus credenciales legibles. ¿Compartir igualmente?')) return;
    toast('Preparando archivo…');
    const data = shareable();
    data.files = {};
    for (const m of S.movements) for (const f of m.files || []) {
      const rec = await Files.get(f.id).catch(() => null);
      if (rec) data.files[f.id] = { name: rec.name, type: rec.type, data: b64(await rec.blob.arrayBuffer()) };
    }
    const payload = pass ? await encryptData(data, pass) : { app: 'mesa-fondeo', format: 1, data };
    const name = `mesa-fondeo-${today()}.json`;
    const file = new File([JSON.stringify(payload)], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Datos Mesa Fondeo' }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    download(name, file);
  }

  async function receiveData(file) {
    let p;
    try { p = JSON.parse(await file.text()); } catch { toast('Archivo no válido'); return; }
    let d = p;
    if (p.enc) {
      const pass = prompt('Contraseña del archivo');
      if (!pass) return;
      try { d = await decryptData(p, pass); } catch { toast('Contraseña incorrecta'); return; }
    } else if (p.app === 'mesa-fondeo') d = p.data;
    if (!Array.isArray(d?.accounts) || !Array.isArray(d?.movements)) { toast('Archivo no válido'); return; }
    for (const [id, f] of Object.entries(d.files || {})) await Files.put(id, new Blob([unb64(f.data)], { type: f.type }), f.name, f.type);
    delete d.files;
    const r = mergeData(migrate({ ...blank(), ...d }));
    render();
    toast(`Combinado: ${r.added} nuevo(s), ${r.updated} actualizado(s), ${r.removed} borrado(s)`);
  }

  // Combina por id: gana la versión modificada más tarde; los borrados se aplican si son posteriores al último cambio.
  function mergeData(remote) {
    const stamp = (x) => x.updatedAt || x.createdAt || 0;
    const deleted = { ...S.deleted };
    for (const [id, t] of Object.entries(remote.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);
    const isDel = (x) => deleted[x.id] && deleted[x.id] >= stamp(x);
    const r = { added: 0, updated: 0, removed: 0 };
    for (const k of LISTS) {
      const map = new Map(S[k].map((x) => [x.id, x]));
      for (const x of remote[k] || []) {
        const l = map.get(x.id);
        if (!l) { map.set(x.id, x); if (!isDel(x)) r.added++; }
        else if (stamp(x) > stamp(l)) { map.set(x.id, x); if (sig(x) !== sig(l)) r.updated++; }
      }
      r.removed += S[k].filter(isDel).length;
      S[k] = [...map.values()].filter((x) => !isDel(x));
    }
    S.deleted = deleted;
    S.lastSync = Date.now();
    snapshot();
    persist();
    return r;
  }

  // ================================================================ sincronización automática
  // Datos cifrados en un gist secreto de tu GitHub; las facturas, cifradas, en un segundo gist.
  const SYNC_KEY = 'mesa-fondeo-sync';
  const GIST_DESC = 'mesa-fondeo-sync', GIST_FILE = 'mesa-fondeo.json', FILES_DESC = 'mesa-fondeo-files';
  let sync = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; } })();
  let syncing = false, syncAgain = false, syncTimer = null;
  const saveSync = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch { /* no-op */ } };
  const syncOn = () => !!(sync.token && sync.pass);
  const stateSig = (d) => JSON.stringify([LISTS.map((k) => (d[k] || []).map(sig).sort()), Object.keys(d.deleted || {}).sort()]);

  function scheduleSync() {
    if (!syncOn()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), 1500);
  }

  async function ghFetch(path, opts = {}, extra = {}) {
    const res = await fetch('https://api.github.com' + path, {
      ...opts,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${sync.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...extra },
    });
    if (res.status === 304) return res;
    if (res.status === 401) throw new Error('El token de GitHub no es válido');
    if (res.status === 403 || res.status === 404) throw new Error('El token no tiene permiso de gists');
    if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
    return res;
  }
  const gh = async (path, opts) => { const r = await ghFetch(path, opts); return r.status === 204 ? null : r.json(); };

  async function findGist(desc, file) {
    for (let page = 1; page <= 5; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const g = list.find((x) => x.description === desc && (!file || x.files?.[file]));
      if (g) return g.id;
      if (list.length < 100) break;
    }
    return null;
  }

  async function syncNow(manual = false) {
    if (!syncOn()) return;
    if (syncing) { syncAgain = true; return; }
    if (!navigator.onLine) { sync.error = 'Sin conexión'; saveSync(); syncBadge(); return; }
    syncing = true; syncBadge();
    try {
      if (!sync.gistId) { sync.gistId = await findGist(GIST_DESC, GIST_FILE); sync.etag = ''; }
      let remote = null, unchanged = false;
      if (sync.gistId) {
        // Petición condicional: si nada cambió en la nube GitHub responde 304 sin datos.
        const res = await ghFetch(`/gists/${sync.gistId}`, {}, sync.etag ? { 'If-None-Match': sync.etag } : {});
        if (res.status === 304) unchanged = true;
        else {
          const g = await res.json();
          sync.etag = res.headers.get('ETag') || '';
          const f = g.files?.[GIST_FILE];
          const content = f?.truncated ? await (await fetch(f.raw_url)).text() : f?.content;
          if (content) {
            try { remote = await decryptData(JSON.parse(content), sync.pass); } catch { sync.etag = ''; throw new Error('La contraseña de sincronización no coincide'); }
          }
        }
      }
      let changed = false;
      if (remote) {
        const before = stateSig(S);
        mergeData(migrate({ ...blank(), ...remote }));
        changed = stateSig(S) !== before;
      }
      const mine = stateSig(S);
      const needPush = unchanged ? mine !== sync.sig : !remote || stateSig(remote) !== mine;
      if (needPush) {
        const body = { description: GIST_DESC, files: { [GIST_FILE]: { content: JSON.stringify(await encryptData(shareable(), sync.pass)) } } };
        if (sync.gistId) await gh(`/gists/${sync.gistId}`, { method: 'PATCH', body: JSON.stringify(body) });
        else sync.gistId = (await gh('/gists', { method: 'POST', body: JSON.stringify({ ...body, public: false }) })).id;
        sync.etag = '';
      }
      sync.sig = mine;
      await syncFiles();
      sync.last = Date.now(); sync.error = '';
      saveSync();
      if (changed || ui.tab === 'settings') render();
      if (manual) toast('Sincronizado ✓');
    } catch (err) {
      sync.error = err.message; saveSync();
      if (manual) toast(err.message);
    } finally {
      syncing = false; syncBadge();
      if (syncAgain) { syncAgain = false; syncNow(); }
    }
  }

  // Sube las facturas nuevas de este dispositivo y borra de la nube las eliminadas.
  async function syncFiles() {
    const pending = [];
    for (const m of S.movements) for (const f of m.files || []) if (!f.up) pending.push([m, f]);
    const dels = sync.delFiles || [];
    if (!pending.length && !dels.length) return;
    if (!sync.filesId) sync.filesId = await findGist(FILES_DESC);
    let flagged = false;
    for (const [, f] of pending) {
      const rec = await Files.get(f.id).catch(() => null);
      if (!rec) continue; // está en otro dispositivo: se subirá desde allí
      const content = JSON.stringify({ name: rec.name, type: rec.type, ...(await encryptBytes(new Uint8Array(await rec.blob.arrayBuffer()), sync.pass)) });
      const files = { [`f-${f.id}.json`]: { content } };
      if (sync.filesId) await gh(`/gists/${sync.filesId}`, { method: 'PATCH', body: JSON.stringify({ files }) });
      else sync.filesId = (await gh('/gists', { method: 'POST', body: JSON.stringify({ description: FILES_DESC, public: false, files }) })).id;
      f.up = true; flagged = true;
      saveSync();
    }
    if (dels.length && sync.filesId) {
      const files = Object.fromEntries(dels.map((id) => [`f-${id}.json`, null]));
      try { await gh(`/gists/${sync.filesId}`, { method: 'PATCH', body: JSON.stringify({ files }) }); } catch { /* ya no existían */ }
      sync.delFiles = [];
    }
    if (flagged) { save(); }
  }

  async function downloadFile(meta) {
    if (!sync.filesId) sync.filesId = await findGist(FILES_DESC);
    if (!sync.filesId) throw new Error('No se encontró la factura en la nube');
    const g = await gh(`/gists/${sync.filesId}`);
    const f = g.files?.[`f-${meta.id}.json`];
    if (!f) throw new Error('La factura aún no se ha subido desde el otro dispositivo');
    const p = JSON.parse(f.truncated ? await (await fetch(f.raw_url)).text() : f.content);
    const bytes = await decryptBytes(p, sync.pass);
    const blob = new Blob([bytes], { type: p.type });
    await Files.put(meta.id, blob, p.name, p.type);
    return { blob, name: p.name, type: p.type };
  }

  function syncBadge() {
    const el = $('#headerActions');
    if (!el) return;
    if (!syncOn()) { el.innerHTML = ''; return; }
    const [cls, label] = syncing ? ['busy', 'Sincronizando'] : sync.error ? ['err', 'Error'] : ['', 'Sincronizado'];
    el.innerHTML = `<button class="sync-chip ${cls}" data-act="sync-now" title="${esc(sync.error || label)}"><i></i>${label}</button>`;
  }

  async function enableSync() {
    const token = $('#syncToken').value.trim(), pass = $('#syncPass').value;
    if (!token || pass.length < 6) { toast('Pega el token y una contraseña de al menos 6 caracteres'); return; }
    sync = { token, pass };
    saveSync();
    toast('Conectando…');
    await syncNow(true);
    if (sync.error) { sync = {}; saveSync(); syncBadge(); render(); }
  }

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ================================================================ ejemplo
  function loadDemo() {
    const mk = (o) => ({ id: uid(), createdAt: Date.now(), platform: 'Quantower', feed: 'Rithmic', ddType: 'Trailing intradía', split: 90, ...o });
    const a1 = mk({ firm: 'Apex', size: 50000, phase: 'Fondeada (PA)', peak: 53100, target: 3000, maxDD: 2500, lockAt: 50100, maxContracts: 10, monthlyFee: 85, minDays: 8, accountId: 'APEX-123456-01', login: 'APEX-123456', password: 'demo', server: 'Apex', gateway: 'Chicago Area' });
    const a2 = mk({ firm: 'Apex', size: 50000, phase: 'Fondeada (PA)', peak: 51900, target: 3000, maxDD: 2500, lockAt: 50100, maxContracts: 10, monthlyFee: 85, minDays: 8, accountId: 'APEX-123456-02', login: 'APEX-123456', password: 'demo', server: 'Apex', gateway: 'Chicago Area' });
    const a3 = mk({ firm: 'Topstep', size: 150000, phase: 'Evaluación', platform: 'TradingView', feed: 'Tradovate', ddType: 'Trailing fin de día (EOD)', peak: 154900, target: 9000, maxDD: 4500, dailyLoss: 3000, maxContracts: 15, monthlyFee: 149, minDays: 5, minDayProfit: 150, accountId: 'S1OCT1234567', login: 'mi_usuario' });
    const a4 = mk({ firm: 'Tradeify', size: 100000, phase: 'Perdida', platform: 'NinjaTrader', feed: 'Tradovate', ddType: 'Trailing fin de día (EOD)', balance: 96400, target: 6000, maxDD: 3500, accountId: 'TDY100-7788' });
    S.accounts.push(a1, a2, a3, a4);
    const d = (m, day) => { const x = new Date(); x.setMonth(x.getMonth() - m, day); return x.toISOString().slice(0, 10); };
    const mv = (type, category, amount, date, acc, note = '') => S.movements.push({ id: uid(), type, category, amount, date, accountId: acc.id, firm: acc.firm, note, files: [] });
    mv('gasto', 'Evaluación / suscripción', 167, d(5, 3), a1); mv('gasto', 'Evaluación / suscripción', 167, d(5, 3), a2);
    mv('gasto', 'Activación PA', 85, d(4, 12), a1); mv('gasto', 'Activación PA', 85, d(4, 14), a2);
    mv('gasto', 'Evaluación / suscripción', 359, d(3, 2), a4); mv('gasto', 'Reset', 99, d(3, 20), a4);
    mv('gasto', 'Licencia plataforma', 70, d(2, 1), a1, 'Quantower');
    mv('ingreso', 'Payout', 2000, d(2, 22), a1); mv('ingreso', 'Payout', 1500, d(1, 18), a2);
    mv('gasto', 'Evaluación / suscripción', 149, d(1, 2), a3);
    mv('ingreso', 'Payout', 2500, d(0, 6), a1);
    const closes = (acc, pnls) => {
      let bal = num(acc.size) + 1000;
      const dates = [];
      for (let i = 1; dates.length < pnls.length; i++) { const x = new Date(); x.setDate(x.getDate() - i); if (x.getDay() % 6) dates.unshift(x.toISOString().slice(0, 10)); }
      pnls.forEach((p, i) => { const prev = bal; bal += p; S.days.push({ id: uid(), accountId: acc.id, date: dates[i], balance: bal, prev, pnl: p, note: '' }); });
      acc.balance = bal; acc.peak = Math.max(num(acc.peak), bal);
    };
    closes(a1, [420, -180, 650, 310, 220, -90, 380]);
    closes(a2, [250, 300, -400, 180]);
    closes(a3, [900, 150, -300, 1200, 640, 410]);
    S.copyGroups.push({ id: uid(), name: 'NQ Apex', masterId: a1.id, mode: 'fixed', unit: 'mini', calcLot: 2, slaves: [{ accountId: a2.id, multiplier: 1 }, { accountId: a3.id, multiplier: 1.5 }] });
    save(); render(); toast('Datos de ejemplo cargados');
  }

  // ================================================================ hojas
  function sheet(title, html) {
    closeSheet();
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Cerrar">${ICON.close}</button></div>${html}</div>`;
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) closeSheet(); });
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    $$('.sheet-bg').forEach((x) => x.remove());
    document.body.style.overflow = '';
    sheetUrls.forEach((u) => URL.revokeObjectURL(u));
    sheetUrls = [];
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const layers = $$('.sheet-bg');
    if (layers.length > 1) layers.pop().remove(); else closeSheet();
  });

  // ================================================================ eventos
  let searchTimer;
  function bindView() {
    $('#accSearch')?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { ui.accQuery = e.target.value; $('#accList').innerHTML = accountList(); }, 120);
    });
    $('#restore')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) receiveData(file);
    });
    $$('[data-setting]').forEach((el) => el.addEventListener('change', () => {
      S.settings[el.dataset.setting] = el.value.trim(); fmtCache.clear(); save(); render(); toast('Ajuste guardado');
    }));
    $$('[data-calclot]').forEach((el) => el.addEventListener('change', () => {
      const g = S.copyGroups.find((x) => x.id === el.dataset.calclot); g.calcLot = num(el.value) || 0; save(); render();
    }));
    if (ui.tab === 'settings') storageInfo();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-mov], [data-closeday], [data-go-invoices]');
    if (!t || t.closest('.sheet [data-delday]')) return;
    const d = t.dataset;
    if (d.tab) return go(d.tab);
    if (d.go) return go(d.go);
    if (d.goInvoices) { ui.moneyType = 'nofile'; ui.moneyRange = 'all'; return go('money'); }
    if (d.accfilter) { ui.accFilter = d.accfilter; return render(); }
    if (d.ui) { const [k, val] = d.ui.split(':'); ui[k] = val; return render(); }
    if (d.closeday) return closeDaySheet(d.closeday);
    if (d.history) return historySheet(d.history);
    if (d.accmenu) return accountMenu(d.accmenu);
    if (d.creds) { ui.creds.has(d.creds) ? ui.creds.delete(d.creds) : ui.creds.add(d.creds); return render(); }
    if (d.editgroup) return groupSheet(d.editgroup);
    if (d.mov) return movementSheet(d.mov);
    if (d.addmov) {
      const [id, type] = d.addmov.split(':');
      return movementSheet(null, { type, accountId: id, category: type === 'gasto' ? 'Reset' : 'Payout' });
    }
    if (d.copy) {
      const [id, field] = d.copy.split(':');
      return copyText(String(accById(id)?.[field] ?? ''), CRED_NAMES[field]);
    }
    if (d.reveal) {
      const el = $(`[data-secret="${d.reveal}"]`);
      el.textContent = el.textContent.startsWith('•') ? accById(d.reveal).password : '••••••••';
      return;
    }
    if (d.copyall) return copyAll(accById(d.copyall));
    if (d.copylots) {
      const g = S.copyGroups.find((x) => x.id === d.copylots);
      const lead = num(g.calcLot ?? 1);
      const m = accById(g.masterId);
      return copyText([
        g.name,
        `Líder ${accLabel(m)}${m?.accountId ? ' [' + m.accountId + ']' : ''}: ${lead} ${g.unit === 'micro' ? 'micros' : 'contratos'}`,
        ...g.slaves.map((s) => { const a = accById(s.accountId); return `${accLabel(a)}${a?.accountId ? ' [' + a.accountId + ']' : ''} ×${s.multiplier}: ${followerSize(g, s, lead).plain}`; }),
      ].join('\n'), 'Configuración copiada');
    }
    switch (d.act) {
      case 'new-acc': return accountSheet();
      case 'new-group': return groupSheet();
      case 'new-gasto': return movementSheet(null, { type: 'gasto' });
      case 'new-ingreso': return movementSheet(null, { type: 'ingreso', category: 'Payout' });
      case 'fees': return registerFees();
      case 'demo': return loadDemo();
      case 'csv': return exportCSV();
      case 'share': return shareData();
      case 'sync-on': return enableSync();
      case 'sync-now': return syncNow(true);
      case 'sync-off':
        if (confirm('¿Desconectar la sincronización en este dispositivo? Los datos se quedan aquí.')) { sync = {}; saveSync(); syncBadge(); render(); }
        return;
      case 'wipe':
        if (confirm(`¿Borrar TODAS las cuentas, movimientos, cierres y facturas de este dispositivo?${syncOn() ? ' También se desconectará la sincronización (la nube y los demás dispositivos no se tocan).' : ''}`)) {
          sync = {}; saveSync(); syncBadge();
          S = blank(); snapshot(); persist(); Files.gc([]).catch(() => {}); render(); toast('Datos borrados');
        }
        return;
    }
  });

  // ================================================================ arranque
  try { const t = sessionStorage.getItem('tab'); if (t && VIEWS[t]) ui.tab = t; } catch { /* no-op */ }
  render();
  syncBadge();
  syncNow();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  // Evita que el navegador borre los datos por falta de espacio y limpia facturas huérfanas.
  navigator.storage?.persist?.().catch(() => {});
  Files.gc(S.movements.flatMap((m) => (m.files || []).map((f) => f.id))).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
