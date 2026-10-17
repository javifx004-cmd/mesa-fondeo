/* Mesa Fondeo – gestor de cuentas de fondeo de futuros (PWA, datos locales) */
(() => {
  'use strict';

  // ---------------------------------------------------------------- estado
  const KEY = 'mesa-fondeo-v1';
  const PHASES = ['Evaluación', 'Fondeada (PA)', 'Live', 'Perdida', 'Retirada'];
  const PLATFORMS = ['Quantower', 'NinjaTrader', 'Tradovate', 'TradingView', 'R|Trader Pro', 'ATAS', 'Sierra Chart', 'Otra'];
  const FEEDS = ['Rithmic', 'Tradovate', 'dxFeed', 'CQG', 'Otra'];
  const DD_TYPES = ['Trailing intradía', 'Trailing fin de día (EOD)', 'Estático'];
  const EXPENSE_CATS = ['Evaluación / suscripción', 'Reset', 'Activación PA', 'Cuota mensual PA', 'Datos de mercado', 'Licencia plataforma', 'Copiador / VPS', 'Otro gasto'];
  const INCOME_CATS = ['Payout', 'Reembolso', 'Otro ingreso'];
  const FEE_NOTE = 'Cuota mensual';

  const blank = () => ({
    accounts: [],
    movements: [],
    copyGroups: [],
    days: [],
    deleted: {},
    settings: { currency: 'USD' },
  });
  const LISTS = ['accounts', 'movements', 'copyGroups', 'days'];

  let S = load();
  let ui = { tab: 'home', accFilter: 'Activas', accQuery: '', moneyType: 'all', moneyRange: 'all' };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const d = JSON.parse(raw);
      const b = blank();
      return migrate({ ...b, ...d, settings: { currency: d.settings?.currency || 'USD' } });
    } catch { return blank(); }
  }
  // Datos de la primera versión (fases tipo forex)
  function migrate(d) {
    const map = { 'Fase 1': 'Evaluación', 'Fase 2': 'Evaluación', Fondeada: 'Fondeada (PA)' };
    d.accounts.forEach((a) => { if (map[a.phase]) a.phase = map[a.phase]; });
    LISTS.forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
    d.deleted ??= {};
    return d;
  }
  // Cada guardado marca con fecha lo que cambió y lo que se borró, para poder combinar datos entre dispositivos.
  const sig = (x) => JSON.stringify({ ...x, updatedAt: 0 });
  let snap = new Map();
  function snapshot() { snap = new Map(LISTS.flatMap((k) => S[k].map((x) => [x.id, sig(x)]))); }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('No se pudo guardar en este dispositivo'); }
  }
  function save() {
    const now = Date.now();
    const seen = new Set();
    S.deleted ??= {};
    for (const k of LISTS) for (const x of S[k]) { seen.add(x.id); if (snap.get(x.id) !== sig(x)) x.updatedAt = now; }
    for (const id of snap.keys()) if (!seen.has(id)) S.deleted[id] = now;
    const old = now - 365 * 864e5;
    for (const [id, t] of Object.entries(S.deleted)) if (t < old) delete S.deleted[id];
    snapshot();
    persist();
    scheduleSync();
  }
  snapshot();

  // ---------------------------------------------------------------- utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const today = () => new Date().toISOString().slice(0, 10);
  const money = (v, sign = false) => {
    const s = new Intl.NumberFormat('es-ES', { style: 'currency', currency: S.settings.currency || 'USD', maximumFractionDigits: 2 }).format(v || 0);
    return sign && v > 0 ? '+' + s : s;
  };
  const kfmt = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k' : String(Math.round(v)));
  const pct = (v) => (isFinite(v) ? v.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '%' : '—');
  const accById = (id) => S.accounts.find((a) => a.id === id);
  const accLabel = (a) => (a ? `${a.firm} ${kfmt(num(a.size))}${a.label ? ' · ' + a.label : ''}` : '—');
  const isActive = (a) => !['Perdida', 'Retirada'].includes(a.phase);
  const isEval = (a) => a.phase === 'Evaluación';
  const isFunded = (a) => a.phase === 'Fondeada (PA)' || a.phase === 'Live';
  const phaseClass = (p) => (p === 'Evaluación' ? 'b-eval' : p === 'Perdida' ? 'b-lost' : p === 'Retirada' ? 'b-other' : 'b-funded');
  const monthKey = (d) => d.slice(0, 7);
  const monthName = (k) => {
    const [y, m] = k.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
  };

  const ICON = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  };

  function toast(msg) {
    $$('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  async function copyText(text, what = 'Copiado') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
      ta.remove();
    }
    toast(`${what} ✓`);
  }

  // ---------------------------------------------------------------- cálculos
  function totals(movs = S.movements) {
    let spent = 0, earned = 0;
    for (const m of movs) (m.type === 'gasto' ? (spent += num(m.amount)) : (earned += num(m.amount)));
    return { spent, earned, net: earned - spent, roi: spent ? ((earned - spent) / spent) * 100 : NaN };
  }

  // Reglas de futuros en dólares: objetivo, drawdown máximo (trailing o estático) y nivel donde se bloquea el trailing.
  function accStats(a) {
    const size = num(a.size);
    const bal = a.balance === '' || a.balance == null ? size : num(a.balance);
    const peak = Math.max(num(a.peak) || size, bal);
    const dd = num(a.maxDD);
    let floor = a.ddType === 'Estático' ? size - dd : peak - dd;
    if (a.ddType !== 'Estático' && num(a.lockAt)) floor = Math.min(floor, num(a.lockAt));
    const profit = bal - size;
    const target = num(a.target);
    const ddRoom = bal - floor;
    const movs = S.movements.filter((m) => m.accountId === a.id);
    return {
      bal, peak, floor, profit, ddRoom,
      targetPct: target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 0,
      ddPct: dd > 0 ? Math.max(0, Math.min(100, (ddRoom / dd) * 100)) : 100,
      ...totals(movs),
    };
  }

  // Días operados (cierres) y retiros de una cuenta. Los días mínimos se cuentan desde el último retiro.
  function accDays(a) {
    const closes = S.days.filter((d) => d.accountId === a.id).sort((x, y) => x.date.localeCompare(y.date));
    const payouts = S.movements.filter((m) => m.accountId === a.id && m.type === 'ingreso' && m.category === 'Payout');
    const lastPayout = payouts.map((m) => m.date || '').sort().pop() || '';
    const minProfit = num(a.minDayProfit);
    const cycle = closes.filter((d) => d.date > lastPayout && (!minProfit || num(d.pnl) >= minProfit));
    return {
      closes, cycle: cycle.length, total: closes.length, lastPayout, lastClose: closes[closes.length - 1],
      payouts: payouts.length, withdrawn: payouts.reduce((s, m) => s + num(m.amount), 0),
      minDays: num(a.minDays),
    };
  }
  const closedToday = (a) => S.days.some((d) => d.accountId === a.id && d.date === today());

  function inRange(date, range) {
    if (range === 'all') return true;
    const now = new Date();
    if (range === 'month') return date.startsWith(now.toISOString().slice(0, 7));
    if (range === 'year') return date.startsWith(String(now.getFullYear()));
    return true;
  }

  // Cuentas con cuota mensual que aún no tienen el gasto registrado este mes
  function pendingFees() {
    const mk = today().slice(0, 7);
    return S.accounts.filter((a) => isActive(a) && num(a.monthlyFee) > 0 &&
      !S.movements.some((m) => m.accountId === a.id && m.note === FEE_NOTE && (m.date || '').startsWith(mk)));
  }

  // ---------------------------------------------------------------- router
  const VIEWS = {
    home: { title: 'Inicio', render: renderHome },
    accounts: { title: 'Cuentas', render: renderAccounts, fab: () => accountSheet() },
    money: { title: 'Finanzas', render: renderMoney, fab: () => movementSheet() },
    copy: { title: 'Copiador', render: renderCopy, fab: () => groupSheet() },
    settings: { title: 'Ajustes', render: renderSettings },
  };

  function go(tab) {
    ui.tab = tab;
    try { sessionStorage.setItem('tab', tab); } catch { /* no-op */ }
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    const v = VIEWS[ui.tab];
    $('#title').textContent = v.title;
    const { net } = totals();
    $('#subtitle').innerHTML = `Neto total: <b class="${net >= 0 ? 'pos' : 'neg'}">${money(net, true)}</b>`;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    $('#view').innerHTML = v.render();
    $$('.fab').forEach((f) => f.remove());
    if (v.fab) {
      const f = document.createElement('button');
      f.className = 'fab'; f.textContent = '+'; f.setAttribute('aria-label', 'Añadir');
      f.onclick = v.fab;
      document.body.appendChild(f);
    }
    bindView();
  }

  // ---------------------------------------------------------------- INICIO
  const BRAND = `
    <div class="brand">
      <img src="icons/icon.svg" alt="fundedlab_es">
      <div><div class="brand-name">fundedlab<span>_es</span></div><div class="brand-by">Mesa Fondeo · by Javier Carbonell</div></div>
    </div>`;

  function renderHome() {
    const t = totals();
    const active = S.accounts.filter(isActive);
    const funded = active.filter(isFunded);
    const evals = active.filter(isEval);
    const fundedCap = funded.reduce((s, a) => s + num(a.size), 0);
    const pending = funded.reduce((s, a) => s + Math.max(0, accStats(a).profit) * num(a.split || 90) / 100, 0);
    const monthly = active.reduce((s, a) => s + num(a.monthlyFee), 0);
    const atRisk = active.filter((a) => num(a.maxDD) && accStats(a).ddPct < 30);

    if (!S.accounts.length && !S.movements.length) {
      return BRAND + `
        <div class="empty">
          <h3>Bienvenido a Mesa Fondeo</h3>
          <p>Registra tus cuentas de fondeo de futuros, lo que gastas en evaluaciones, resets y activaciones, y lo que cobras en payouts.</p>
          <div class="row" style="justify-content:center">
            <button class="btn primary" data-act="new-acc">Añadir cuenta</button>
            <button class="btn" data-act="demo">Cargar ejemplo</button>
          </div>
        </div>`;
    }

    return BRAND + `
      ${atRisk.length ? `<div class="note warn" style="margin-bottom:12px">⚠️ Cerca del drawdown: ${atRisk.map((a) => `<b>${esc(accLabel(a))}</b> (${money(accStats(a).ddRoom)})`).join(', ')}</div>` : ''}
      ${active.length ? `<div class="card"><div class="row between"><h3 style="margin:0">Cierre del día</h3><span class="small muted">${active.filter(closedToday).length}/${active.length} cerradas</span></div>
        ${active.map((a) => { const dd = accDays(a); return `<div class="list-item">
          <div><div class="t">${esc(accLabel(a))}</div><div class="small muted">Mín. ${money(accStats(a).floor)} · Días ${dd.cycle}${dd.minDays ? '/' + dd.minDays : ''}</div></div>
          ${closedToday(a) ? `<button class="btn sm" data-closeday="${a.id}">✓ Cerrada</button>` : `<button class="btn sm primary" data-closeday="${a.id}">Cerrar día</button>`}</div>`; }).join('')}
      </div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="l">Gastado</div><div class="v neg">${money(t.spent)}</div></div>
        <div class="kpi"><div class="l">Cobrado</div><div class="v pos">${money(t.earned)}</div></div>
        <div class="kpi"><div class="l">Beneficio neto</div><div class="v ${t.net >= 0 ? 'pos' : 'neg'}">${money(t.net, true)}</div></div>
        <div class="kpi"><div class="l">ROI</div><div class="v ${t.roi >= 0 ? 'pos' : 'neg'}">${pct(t.roi)}</div></div>
        <div class="kpi"><div class="l">Capital fondeado</div><div class="v">${money(fundedCap)}</div><div class="small muted">${funded.length} fondeada(s) · ${evals.length} en evaluación</div></div>
        <div class="kpi"><div class="l">Payout potencial</div><div class="v">${money(pending)}</div><div class="small muted">beneficio actual × split</div></div>
        ${monthly ? `<div class="kpi wide"><div class="l">Cuotas mensuales activas</div><div class="v neg">${money(monthly)}<span class="small muted"> / mes</span></div></div>` : ''}
      </div>

      <div class="card">
        <h3>Gasto vs ingreso (6 meses)</h3>
        ${monthChart()}
        <div class="legend"><span><i style="background:var(--red)"></i>Gasto</span><span><i style="background:var(--green)"></i>Ingreso</span></div>
      </div>

      ${firmTable()}

      <div class="section-title"><span>Últimos movimientos</span><button class="btn sm" data-go="money">Ver todo</button></div>
      <div class="card">${movementList(S.movements.slice().sort(byDateDesc).slice(0, 5)) || '<div class="muted small">Sin movimientos todavía.</div>'}</div>`;
  }

  function monthChart() {
    const months = [];
    const d = new Date(); d.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
    }
    const data = months.map((k) => totals(S.movements.filter((m) => monthKey(m.date || '') === k)));
    const max = Math.max(1, ...data.map((x) => Math.max(x.spent, x.earned)));
    const W = 320, H = 150, pad = 22, bw = 15, gw = (W - 10) / months.length;
    let bars = '';
    data.forEach((x, i) => {
      const cx = 10 + gw * i + gw / 2;
      const hs = ((H - pad - 14) * x.spent) / max, he = ((H - pad - 14) * x.earned) / max;
      bars += `<rect x="${cx - bw - 1}" y="${H - pad - hs}" width="${bw}" height="${hs}" rx="3" fill="var(--red)"><title>Gasto ${money(x.spent)}</title></rect>`;
      bars += `<rect x="${cx + 1}" y="${H - pad - he}" width="${bw}" height="${he}" rx="3" fill="var(--green)"><title>Ingreso ${money(x.earned)}</title></rect>`;
      bars += `<text x="${cx}" y="${H - 6}" fill="var(--muted)" font-size="10" text-anchor="middle">${monthName(months[i])}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}"><line x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line)"/>${bars}</svg>`;
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
      <div class="card"><h3>Por empresa de fondeo</h3>
        <table class="t"><thead><tr><th>Empresa</th><th class="r">Gasto</th><th class="r">Ingreso</th><th class="r">Neto</th></tr></thead><tbody>
        ${rows.map(([f, x]) => `<tr><td>${esc(f)} <span class="muted small">(${x.n})</span></td><td class="r neg">${kfmt(x.spent)}</td><td class="r pos">${kfmt(x.earned)}</td><td class="r ${x.earned - x.spent >= 0 ? 'pos' : 'neg'}">${kfmt(x.earned - x.spent)}</td></tr>`).join('')}
        </tbody></table></div>`;
  }

  // ---------------------------------------------------------------- CUENTAS
  function renderAccounts() {
    const filters = ['Activas', 'Evaluación', 'Fondeadas', 'Perdida', 'Retirada', 'Todas'];
    const q = ui.accQuery.toLowerCase();
    const list = S.accounts.filter((a) => {
      const f = ui.accFilter;
      const ok = f === 'Todas' || (f === 'Activas' && isActive(a)) || (f === 'Fondeadas' && isFunded(a)) || a.phase === f;
      return ok && (!q || `${a.firm} ${a.label} ${a.accountId} ${a.login} ${a.server} ${a.platform} ${a.feed}`.toLowerCase().includes(q));
    });
    return `
      <input class="search" id="accSearch" placeholder="Buscar empresa, ID de cuenta, usuario…" value="${esc(ui.accQuery)}">
      <div class="chips">${filters.map((f) => `<button class="chip ${ui.accFilter === f ? 'on' : ''}" data-accfilter="${f}">${f}</button>`).join('')}</div>
      ${list.length ? list.map(accountCard).join('') : `<div class="empty"><div class="big">🗂️</div>No hay cuentas en este filtro.<br><br><button class="btn primary" data-act="new-acc">Añadir cuenta</button></div>`}`;
  }

  function accountCard(a) {
    const st = accStats(a);
    const cred = (k, v, field, secret = false) => v ? `
      <div class="cred"><span class="k">${k}</span>
        <span class="val" ${secret ? `data-secret="${esc(a.id)}"` : ''}>${secret ? '••••••••' : esc(v)}</span>
        ${secret ? `<button class="icon-btn" data-reveal="${a.id}" aria-label="Mostrar">${ICON.eye}</button>` : ''}
        <button class="icon-btn" data-copy="${a.id}:${field}" aria-label="Copiar ${k}">${ICON.copy}</button>
      </div>` : '';
    const rules = [
      num(a.dailyLoss) && `Pérdida diaria máx. ${money(num(a.dailyLoss))}`,
      num(a.maxContracts) && `Máx. ${num(a.maxContracts)} contratos`,
      num(a.monthlyFee) && `Cuota ${money(num(a.monthlyFee))}/mes`,
    ].filter(Boolean).join(' · ');
    return `
      <div class="card">
        <div class="acc-head">
          <div><div class="acc-name">${esc(a.firm)} · ${kfmt(num(a.size))}</div>
            <div class="acc-meta">${[a.platform, a.feed, a.label].filter(Boolean).map(esc).join(' · ')}</div></div>
          <span class="badge ${phaseClass(a.phase)}">${esc(a.phase)}</span>
        </div>
        <div class="stats3">
          <div><div class="l">Balance</div><div class="v">${money(st.bal)}</div></div>
          <div><div class="l">P/L cuenta</div><div class="v ${st.profit >= 0 ? 'pos' : 'neg'}">${money(st.profit, true)}</div></div>
          <div><div class="l">Neto cobrado</div><div class="v ${st.net >= 0 ? 'pos' : 'neg'}">${money(st.net, true)}</div></div>
        </div>
        ${num(a.target) && isEval(a) ? `<div class="small muted">Objetivo ${money(num(a.target))} · ${pct(st.targetPct)} completado</div><div class="bar g"><i style="width:${st.targetPct}%"></i></div>` : ''}
        ${num(a.maxDD) ? `<div class="small muted" style="margin-top:6px">Balance mínimo <b class="minbal">${money(st.floor)}</b> · margen <b>${money(st.ddRoom)}</b> · ${esc(a.ddType || 'Drawdown')}</div><div class="bar ${st.ddPct < 30 ? 'r' : st.ddPct < 60 ? 'a' : ''}"><i style="width:${st.ddPct}%"></i></div>` : ''}
        ${daysLine(a)}
        ${rules ? `<div class="small muted" style="margin-top:6px">${rules}</div>` : ''}
        ${cred('ID cuenta', a.accountId, 'accountId')}${cred('Usuario', a.login, 'login')}${cred('Contraseña', a.password, 'password', true)}${cred('Sistema', a.server, 'server')}${cred('Gateway', a.gateway, 'gateway')}
        <div class="row" style="margin-top:10px">
          <button class="btn sm" data-edit="${a.id}">Editar</button>
          <button class="btn sm primary" data-closeday="${a.id}">Cierre de día</button>
          <button class="btn sm" data-history="${a.id}">Historial</button>
          <button class="btn sm" data-addmov="${a.id}:gasto">− Gasto</button>
          <button class="btn sm" data-addmov="${a.id}:ingreso">+ Payout</button>
          <button class="btn sm" data-copyall="${a.id}">Copiar datos</button>
        </div>
      </div>`;
  }

  function daysLine(a) {
    const d = accDays(a);
    const pctDays = d.minDays ? Math.min(100, (d.cycle / d.minDays) * 100) : 0;
    return `<div class="small muted" style="margin-top:8px">Días ${d.lastPayout ? 'desde el último retiro' : 'operados'}: <b>${d.cycle}${d.minDays ? ' / ' + d.minDays : ''}</b>${d.minDays && d.cycle >= d.minDays ? ' ✓' : ''}
        · Retiros: <b>${d.payouts}</b> (${money(d.withdrawn)})${d.lastClose ? ` · Último cierre ${esc(d.lastClose.date)} <span class="${num(d.lastClose.pnl) >= 0 ? 'pos' : 'neg'}">${money(num(d.lastClose.pnl), true)}</span>` : ''}</div>
      ${d.minDays ? `<div class="bar g"><i style="width:${pctDays}%"></i></div>` : ''}`;
  }

  function accountSheet(id, preset = {}) {
    const a = id ? accById(id) : { phase: 'Evaluación', platform: 'Quantower', feed: 'Rithmic', ddType: 'Trailing intradía', split: 90, ...preset };
    const opt = (arr, v) => arr.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const firms = [...new Set(['Apex', 'Topstep', 'Tradeify', 'Take Profit Trader', 'My Funded Futures', 'Lucid Trading', 'Alpha Futures', 'Bulenox', 'Elite Trader Funding', ...S.accounts.map((x) => x.firm)])];
    sheet(`
      <h2>${id ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
      <form id="accForm">
        <div class="grid2">
          <label class="f"><span>Empresa de fondeo</span><input name="firm" list="firmList" required value="${esc(a.firm)}" placeholder="Apex, Topstep…"></label>
          <label class="f"><span>Tamaño cuenta ($)</span><input name="size" inputmode="decimal" required value="${esc(a.size)}" placeholder="50000"></label>
          <label class="f"><span>Estado</span><select name="phase">${opt(PHASES, a.phase)}</select></label>
          <label class="f"><span>Etiqueta</span><input name="label" value="${esc(a.label)}" placeholder="NQ, #2…"></label>
          <label class="f"><span>Plataforma</span><select name="platform">${opt(PLATFORMS, a.platform)}</select></label>
          <label class="f"><span>Conexión / datos</span><select name="feed">${opt(FEEDS, a.feed)}</select></label>
        </div>
        <div class="section-title"><span>Acceso</span></div>
        <label class="f"><span>ID de cuenta</span><input name="accountId" value="${esc(a.accountId)}" autocomplete="off" placeholder="APEX-123456-01"></label>
        <div class="grid2">
          <label class="f"><span>Usuario</span><input name="login" value="${esc(a.login)}" autocomplete="off"></label>
          <label class="f"><span>Contraseña</span><input name="password" type="password" value="${esc(a.password)}" autocomplete="new-password"></label>
          <label class="f"><span>Sistema / servidor</span><input name="server" value="${esc(a.server)}" autocomplete="off" placeholder="Rithmic Paper Trading"></label>
          <label class="f"><span>Gateway</span><input name="gateway" value="${esc(a.gateway)}" autocomplete="off" placeholder="Chicago Area"></label>
        </div>
        <div class="section-title"><span>Reglas y balance ($)</span></div>
        <div class="grid2">
          <label class="f"><span>Balance actual</span><input name="balance" inputmode="decimal" value="${esc(a.balance)}" placeholder="= tamaño"></label>
          <label class="f"><span>Balance máximo (pico)</span><input name="peak" inputmode="decimal" value="${esc(a.peak)}" placeholder="auto"></label>
          <label class="f"><span>Objetivo de beneficio</span><input name="target" inputmode="decimal" value="${esc(a.target)}" placeholder="3000"></label>
          <label class="f"><span>Drawdown máximo</span><input name="maxDD" inputmode="decimal" value="${esc(a.maxDD)}" placeholder="2500"></label>
          <label class="f"><span>Tipo de drawdown</span><select name="ddType">${opt(DD_TYPES, a.ddType)}</select></label>
          <label class="f"><span>Trailing se detiene en</span><input name="lockAt" inputmode="decimal" value="${esc(a.lockAt)}" placeholder="50100"></label>
          <label class="f"><span>Pérdida diaria máx.</span><input name="dailyLoss" inputmode="decimal" value="${esc(a.dailyLoss)}"></label>
          <label class="f"><span>Máx. contratos</span><input name="maxContracts" inputmode="numeric" value="${esc(a.maxContracts)}"></label>
          <label class="f"><span>Profit split %</span><input name="split" inputmode="decimal" value="${esc(a.split)}"></label>
          <label class="f"><span>Cuota mensual</span><input name="monthlyFee" inputmode="decimal" value="${esc(a.monthlyFee)}" placeholder="0"></label>
          <label class="f"><span>Días mínimos (para retiro)</span><input name="minDays" inputmode="numeric" value="${esc(a.minDays)}" placeholder="8"></label>
          <label class="f"><span>Ganancia mín. para contar día</span><input name="minDayProfit" inputmode="decimal" value="${esc(a.minDayProfit)}" placeholder="0 = todos"></label>
        </div>
        ${id ? '' : `<label class="f"><span>Precio pagado ahora (se registra como gasto)</span><input name="cost" inputmode="decimal" placeholder="0"></label>`}
        <label class="f"><span>Notas</span><textarea name="notes" rows="2">${esc(a.notes)}</textarea></label>
        <datalist id="firmList">${firms.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
        <p class="small muted">Las contraseñas se guardan solo en este móvil. Revisa las reglas actuales de tu empresa: cambian a menudo.</p>
        <button class="btn primary block" type="submit">Guardar</button>
      </form>
      ${id ? `
        <div class="row" style="margin-top:10px">
          <button class="btn grow" data-dup="${id}">Duplicar cuenta</button>
          <button class="btn danger grow" data-del="${id}">Eliminar</button>
        </div>` : ''}`);

    $('#accForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const cost = num(f.cost); delete f.cost;
      if (f.balance !== '' && num(f.balance) > (num(f.peak) || num(f.size))) f.peak = f.balance;
      if (id) Object.assign(a, f, { updatedAt: Date.now() });
      else {
        const acc = { id: uid(), createdAt: Date.now(), ...f };
        S.accounts.push(acc);
        if (cost > 0) S.movements.push({ id: uid(), type: 'gasto', category: isFunded(acc) ? 'Activación PA' : 'Evaluación / suscripción', amount: cost, date: today(), accountId: acc.id, firm: acc.firm, note: '' });
      }
      save(); closeSheet(); render(); toast('Cuenta guardada');
    };
    const sh = $('.sheet');
    sh.querySelector('[data-del]')?.addEventListener('click', () => {
      if (!confirm('¿Eliminar esta cuenta? Sus movimientos se conservan.')) return;
      S.accounts = S.accounts.filter((x) => x.id !== id);
      S.days = S.days.filter((x) => x.accountId !== id);
      S.copyGroups.forEach((g) => { g.slaves = g.slaves.filter((s) => s.accountId !== id); if (g.masterId === id) g.masterId = ''; });
      save(); closeSheet(); render(); toast('Cuenta eliminada');
    });
    sh.querySelector('[data-dup]')?.addEventListener('click', () => {
      const { id: _i, accountId: _a, login: _l, password: _p, balance: _b, peak: _k, createdAt: _c, updatedAt: _u, ...rest } = a;
      closeSheet(); accountSheet(null, rest);
    });
  }

  // Cierre de día: guarda el balance de cierre, calcula el P/L del día y el nuevo balance mínimo.
  function closeDaySheet(id) {
    const a = accById(id);
    const intraday = a.ddType === 'Trailing intradía';
    const existing = S.days.find((d) => d.accountId === id && d.date === today());
    sheet(`
      <h2>Cierre de día · ${esc(accLabel(a))}</h2>
      <form id="dayForm">
        <div class="grid2">
          <label class="f"><span>Fecha</span><input name="date" type="date" required value="${esc(existing?.date || today())}"></label>
          <label class="f"><span>Balance de cierre ($)</span><input name="balance" inputmode="decimal" required value="${esc(existing?.balance ?? '')}" placeholder="${esc(accStats(a).bal)}"></label>
        </div>
        ${intraday ? `<label class="f"><span>Balance máximo del día (intradía, opcional)</span><input name="high" inputmode="decimal" value="${esc(existing?.high ?? '')}" placeholder="Si el trailing subió durante el día"></label>` : ''}
        <div class="grid2">
          <label class="f"><span>Estado</span><select name="phase">${PHASES.map((p) => `<option ${p === a.phase ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
          <label class="f"><span>Nota</span><input name="note" value="${esc(existing?.note ?? '')}"></label>
        </div>
        <button class="btn primary block" type="submit">Guardar cierre</button>
      </form>`);
    $('#dayForm [name=balance]').focus();
    $('#dayForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const before = S.days.filter((d) => d.accountId === id && d.date < f.date).sort((x, y) => x.date.localeCompare(y.date)).pop();
      const hasLater = S.days.some((d) => d.accountId === id && d.date > f.date);
      const same = S.days.find((d) => d.accountId === id && d.date === f.date);
      const prevBal = before ? num(before.balance) : same?.prev != null ? num(same.prev) : accStats(a).bal;
      const bal = num(f.balance);
      const day = same || (S.days.push({ id: uid(), accountId: id, date: f.date }), S.days[S.days.length - 1]);
      Object.assign(day, { balance: bal, prev: prevBal, pnl: Math.round((bal - prevBal) * 100) / 100, high: f.high || '', note: f.note || '' });
      if (!hasLater) a.balance = bal;
      a.phase = f.phase;
      a.peak = Math.max(num(a.peak) || num(a.size), bal, intraday ? num(f.high) : 0);
      save(); render();
      const st = accStats(a), dd = accDays(a);
      const summary = [
        `${accLabel(a)}${a.accountId ? ' [' + a.accountId + ']' : ''} · cierre ${f.date}`,
        `P/L del día: ${money(day.pnl, true)}`,
        `Balance: ${money(st.bal)}`,
        num(a.maxDD) ? `Balance mínimo nuevo: ${money(st.floor)} (margen ${money(st.ddRoom)})` : '',
        `Días: ${dd.cycle}${dd.minDays ? '/' + dd.minDays : ''}`,
      ].filter(Boolean);
      sheet(`
        <h2>Día cerrado ✓</h2>
        <div class="kpis">
          <div class="kpi"><div class="l">P/L del día</div><div class="v ${day.pnl >= 0 ? 'pos' : 'neg'}">${money(day.pnl, true)}</div></div>
          <div class="kpi"><div class="l">Balance</div><div class="v">${money(st.bal)}</div></div>
          ${num(a.maxDD) ? `<div class="kpi wide"><div class="l">Balance mínimo nuevo</div><div class="v" id="newMin">${money(st.floor)}</div><div class="small muted">Margen ${money(st.ddRoom)} · ${esc(a.ddType)}</div></div>` : ''}
          <div class="kpi wide"><div class="l">Días ${dd.lastPayout ? 'desde el último retiro' : 'operados'}</div><div class="v">${dd.cycle}${dd.minDays ? ' / ' + dd.minDays : ''}${dd.minDays && dd.cycle >= dd.minDays ? ' ✓' : ''}</div></div>
        </div>
        <div class="row"><button class="btn grow" id="copySummary">Copiar resumen</button><button class="btn primary grow" id="okClose">Listo</button></div>`);
      $('#copySummary').onclick = () => copyText(summary.join('\n'), 'Resumen copiado');
      $('#okClose').onclick = closeSheet;
    };
  }

  function historySheet(id) {
    const a = accById(id);
    const dd = accDays(a);
    const movs = S.movements.filter((m) => m.accountId === id).sort(byDateDesc);
    const t = totals(movs);
    sheet(`
      <h2>Historial · ${esc(accLabel(a))}</h2>
      <div class="kpis">
        <div class="kpi"><div class="l">Días operados</div><div class="v">${dd.total}</div><div class="small muted">${dd.cycle}${dd.minDays ? '/' + dd.minDays : ''} desde último retiro</div></div>
        <div class="kpi"><div class="l">Retirado</div><div class="v pos">${money(dd.withdrawn)}</div><div class="small muted">${dd.payouts} retiro(s)</div></div>
        <div class="kpi"><div class="l">Gastado</div><div class="v neg">${money(t.spent)}</div></div>
        <div class="kpi"><div class="l">Neto</div><div class="v ${t.net >= 0 ? 'pos' : 'neg'}">${money(t.net, true)}</div></div>
      </div>
      <div class="section-title"><span>Cierres diarios</span><span class="small">toca para borrar</span></div>
      <div class="card">${dd.closes.length ? dd.closes.slice().reverse().map((d) => `
        <div class="list-item" data-delday="${d.id}"><div><div class="t">${esc(d.date)}</div><div class="small muted">Balance ${money(num(d.balance))}${d.note ? ' · ' + esc(d.note) : ''}</div></div>
        <div class="amt ${num(d.pnl) >= 0 ? 'pos' : 'neg'}">${money(num(d.pnl), true)}</div></div>`).join('') : '<div class="small muted">Sin cierres todavía.</div>'}</div>
      <div class="section-title"><span>Retiros y gastos</span></div>
      <div class="card">${movementList(movs) || '<div class="small muted">Sin movimientos.</div>'}</div>`);
    $$('.sheet [data-delday]').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('¿Borrar este cierre?')) return;
      S.days = S.days.filter((x) => x.id !== el.dataset.delday);
      const last = S.days.filter((x) => x.accountId === id).sort((x, y) => x.date.localeCompare(y.date)).pop();
      if (last) a.balance = last.balance;
      save(); render(); historySheet(id);
    }));
  }

  // ---------------------------------------------------------------- FINANZAS
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.id > a.id ? 1 : -1);

  function movementList(movs) {
    return movs.map((m) => {
      const a = accById(m.accountId);
      const g = m.type === 'gasto';
      return `<div class="list-item" data-mov="${m.id}">
        <div><div class="t">${esc(m.category)}</div>
          <div class="small muted">${esc(m.date)} · ${esc(a ? accLabel(a) : m.firm || 'General')}${m.note ? ' · ' + esc(m.note) : ''}</div></div>
        <div class="amt ${g ? 'neg' : 'pos'}">${g ? '−' : '+'}${money(num(m.amount))}</div></div>`;
    }).join('');
  }

  function renderMoney() {
    const movs = S.movements.filter((m) => (ui.moneyType === 'all' || m.type === ui.moneyType) && inRange(m.date || '', ui.moneyRange)).sort(byDateDesc);
    const t = totals(S.movements.filter((m) => inRange(m.date || '', ui.moneyRange)));
    const fees = pendingFees();
    const groups = {};
    movs.forEach((m) => (groups[monthKey(m.date || '0000-00')] ??= []).push(m));
    const seg = (key, val, label) => `<button class="${ui[key] === val ? 'on' : ''}" data-ui="${key}:${val}">${label}</button>`;
    return `
      <div class="seg">${seg('moneyRange', 'month', 'Este mes')}${seg('moneyRange', 'year', 'Este año')}${seg('moneyRange', 'all', 'Todo')}</div>
      <div class="kpis">
        <div class="kpi"><div class="l">Gastado</div><div class="v neg">${money(t.spent)}</div></div>
        <div class="kpi"><div class="l">Cobrado</div><div class="v pos">${money(t.earned)}</div></div>
        <div class="kpi wide"><div class="l">Neto · ROI ${pct(t.roi)}</div><div class="v ${t.net >= 0 ? 'pos' : 'neg'}">${money(t.net, true)}</div></div>
      </div>
      ${fees.length ? `<div class="note" style="margin-bottom:12px">
        <div class="row between"><span>${fees.length} cuota(s) mensual(es) sin registrar este mes · ${money(fees.reduce((s, a) => s + num(a.monthlyFee), 0))}</span>
        <button class="btn sm primary" data-act="fees">Registrar</button></div></div>` : ''}
      <div class="row" style="margin-bottom:12px">
        <button class="btn grow" data-act="new-gasto">− Añadir gasto</button>
        <button class="btn grow" data-act="new-ingreso">+ Añadir payout</button>
      </div>
      <div class="seg">${seg('moneyType', 'all', 'Todos')}${seg('moneyType', 'gasto', 'Gastos')}${seg('moneyType', 'ingreso', 'Ingresos')}</div>
      ${movs.length ? Object.entries(groups).map(([k, ms]) => {
        const tt = totals(ms);
        return `<div class="section-title"><span>${k === '0000-00' ? 'Sin fecha' : monthName(k)}</span><span class="${tt.net >= 0 ? 'pos' : 'neg'}">${money(tt.net, true)}</span></div><div class="card">${movementList(ms)}</div>`;
      }).join('') : '<div class="empty"><div class="big">💸</div>No hay movimientos en este periodo.</div>'}
      ${S.movements.length ? '<button class="btn block" data-act="csv" style="margin-top:10px">Exportar CSV</button>' : ''}`;
  }

  function registerFees() {
    const list = pendingFees();
    for (const a of list) {
      S.movements.push({ id: uid(), type: 'gasto', category: isFunded(a) ? 'Cuota mensual PA' : 'Evaluación / suscripción', amount: num(a.monthlyFee), date: today(), accountId: a.id, firm: a.firm, note: FEE_NOTE });
    }
    save(); render(); toast(`${list.length} cuota(s) registrada(s)`);
  }

  function movementSheet(id, preset = {}) {
    const m = id ? S.movements.find((x) => x.id === id) : { type: 'gasto', date: today(), ...preset };
    const cats = (t) => (t === 'gasto' ? EXPENSE_CATS : INCOME_CATS);
    const accOpts = `<option value="">General / sin cuenta</option>` + S.accounts.map((a) => `<option value="${a.id}" ${a.id === m.accountId ? 'selected' : ''}>${esc(accLabel(a))}</option>`).join('');
    sheet(`
      <h2>${id ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
      <form id="movForm">
        <div class="seg" id="typeSeg">
          <button type="button" data-type="gasto" class="${m.type === 'gasto' ? 'on' : ''}">Gasto</button>
          <button type="button" data-type="ingreso" class="${m.type === 'ingreso' ? 'on' : ''}">Ingreso</button>
        </div>
        <input type="hidden" name="type" value="${m.type}">
        <div class="grid2">
          <label class="f"><span>Importe</span><input name="amount" inputmode="decimal" required value="${esc(m.amount)}" placeholder="0,00"></label>
          <label class="f"><span>Fecha</span><input name="date" type="date" required value="${esc(m.date)}"></label>
        </div>
        <label class="f"><span>Categoría</span><select name="category" id="catSel"></select></label>
        <label class="f"><span>Cuenta</span><select name="accountId">${accOpts}</select></label>
        <label class="f"><span>Empresa (si no hay cuenta)</span><input name="firm" list="firmList2" value="${esc(m.firm)}"></label>
        <datalist id="firmList2">${[...new Set(S.accounts.map((x) => x.firm))].map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
        <label class="f"><span>Nota</span><input name="note" value="${esc(m.note)}"></label>
        <button class="btn primary block" type="submit">Guardar</button>
      </form>
      ${id ? `<button class="btn danger block" id="delMov" style="margin-top:10px">Eliminar movimiento</button>` : ''}`);

    const fillCats = (t) => { $('#catSel').innerHTML = cats(t).map((c) => `<option ${c === m.category ? 'selected' : ''}>${c}</option>`).join(''); };
    fillCats(m.type);
    $$('#typeSeg button').forEach((b) => (b.onclick = () => {
      $$('#typeSeg button').forEach((x) => x.classList.toggle('on', x === b));
      $('#movForm [name=type]').value = b.dataset.type; fillCats(b.dataset.type);
    }));
    $('#movForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      f.amount = num(f.amount);
      if (f.accountId && !f.firm) f.firm = accById(f.accountId)?.firm || '';
      if (id) Object.assign(m, f); else S.movements.push({ id: uid(), ...f });
      save(); closeSheet(); render(); toast('Movimiento guardado');
    };
    $('#delMov')?.addEventListener('click', () => {
      if (!confirm('¿Eliminar este movimiento?')) return;
      S.movements = S.movements.filter((x) => x.id !== id);
      save(); closeSheet(); render();
    });
  }

  function exportCSV() {
    const rows = [['fecha', 'tipo', 'categoria', 'importe', 'empresa', 'cuenta', 'nota']];
    S.movements.slice().sort(byDateDesc).forEach((m) => rows.push([m.date, m.type, m.category, num(m.amount).toFixed(2), m.firm || accById(m.accountId)?.firm || '', accLabel(accById(m.accountId)), m.note || '']));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    download(`movimientos-${today()}.csv`, '﻿' + csv, 'text/csv');
  }

  // ---------------------------------------------------------------- COPIADOR
  function renderCopy() {
    const intro = `<div class="note" style="margin-bottom:12px">
      Define qué cuenta es la <b>líder</b> y qué cuentas la <b>siguen</b>, con su ratio y su límite de contratos.
      La calculadora te dice cuántos contratos abrir en cada una. La app no envía órdenes: la copia en tiempo real la hace
      el copiador de tu plataforma (Quantower, Tradovate, NinjaTrader…); desde aquí copias los IDs y ratios para configurarlo.</div>`;
    if (!S.copyGroups.length) return intro + `<div class="empty"><div class="big">🔁</div>Aún no tienes grupos de copia.<br><br><button class="btn primary" data-act="new-group">Crear grupo</button></div>`;
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
    if (Math.abs(q - whole) < 1e-9 || g.unit === 'micro') {
      const n = g.unit === 'micro' ? Math.floor(q + 1e-9) : whole;
      const u = g.unit === 'micro' ? 'micros' : 'contratos';
      return { text: `<b>${n}</b> ${u}${capped ? ' (máx.)' : ''}`, plain: `${n} ${u}${capped ? ' (máx.)' : ''}` };
    }
    const micros = Math.floor(q * 10 + 1e-9);
    return { text: `<b>${whole}</b> contratos <span class="muted">o ${micros} micros</span>${capped ? ' (máx.)' : ''}`, plain: `${whole} contratos o ${micros} micros${capped ? ' (máx.)' : ''}` };
  }

  function groupCard(g) {
    const master = accById(g.masterId);
    const lead = num(g.calcLot ?? 1);
    const unit = g.unit === 'micro' ? 'micros' : 'contratos';
    return `
      <div class="card copy-group">
        <div><div class="acc-name">${esc(g.name)}</div><div class="small muted">${g.mode === 'balance' ? 'Proporcional al tamaño × ratio' : 'Ratio fijo'} · en ${unit}</div></div>
        <div class="slave" style="border-color:var(--brand)"><span>👑 ${esc(accLabel(master))}${master?.accountId ? `<br><span class="small muted">${esc(master.accountId)}</span>` : ''}</span><span><b>${lead}</b> ${unit}</span></div>
        <div class="arrow">↓</div>
        ${g.slaves.map((s) => { const a = accById(s.accountId); return `<div class="slave"><span>${esc(accLabel(a))}${a?.accountId ? `<br><span class="small muted">${esc(a.accountId)}</span>` : ''}</span><span style="text-align:right">×${esc(s.multiplier)} → ${followerSize(g, s, lead).text}</span></div>`; }).join('') || '<div class="small muted">Sin cuentas seguidoras.</div>'}
        <div class="row" style="margin-top:10px">
          <span class="small muted">Contratos líder</span>
          <input class="search" style="width:80px;margin:0;padding:6px 8px" inputmode="numeric" data-calclot="${g.id}" value="${esc(g.calcLot ?? 1)}">
          <button class="btn sm" data-copylots="${g.id}">Copiar</button>
          <button class="btn sm" data-editgroup="${g.id}">Editar</button>
        </div>
      </div>`;
  }

  function groupSheet(id) {
    const g = id ? S.copyGroups.find((x) => x.id === id) : { name: '', masterId: '', mode: 'fixed', unit: 'mini', slaves: [] };
    if (S.accounts.filter(isActive).length < 2) { toast('Necesitas al menos 2 cuentas activas'); return; }
    const accOpts = (sel) => S.accounts.filter(isActive).map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(accLabel(a))}</option>`).join('');
    sheet(`
      <h2>${id ? 'Editar grupo de copia' : 'Nuevo grupo de copia'}</h2>
      <form id="grpForm">
        <label class="f"><span>Nombre</span><input name="name" required value="${esc(g.name)}" placeholder="NQ Apex"></label>
        <label class="f"><span>Cuenta líder</span><select name="masterId" required>${accOpts(g.masterId)}</select></label>
        <div class="grid2">
          <label class="f"><span>Cálculo</span><select name="mode">
            <option value="fixed" ${g.mode !== 'balance' ? 'selected' : ''}>Ratio fijo</option>
            <option value="balance" ${g.mode === 'balance' ? 'selected' : ''}>Proporcional al tamaño</option></select></label>
          <label class="f"><span>Unidad</span><select name="unit">
            <option value="mini" ${g.unit !== 'micro' ? 'selected' : ''}>Minis (NQ, ES…)</option>
            <option value="micro" ${g.unit === 'micro' ? 'selected' : ''}>Micros (MNQ, MES…)</option></select></label>
        </div>
        <div class="section-title"><span>Cuentas seguidoras · ratio</span></div>
        ${S.accounts.filter(isActive).map((a) => {
          const s = g.slaves.find((x) => x.accountId === a.id);
          return `<div class="slave"><label class="row grow"><input type="checkbox" name="sl_${a.id}" ${s ? 'checked' : ''}> ${esc(accLabel(a))}</label>
            <span class="row">×<input name="mul_${a.id}" inputmode="decimal" value="${esc(s?.multiplier ?? 1)}" style="width:56px;background:var(--card);border:1px solid var(--line);border-radius:7px;padding:4px 6px"></span></div>`;
        }).join('')}
        <button class="btn primary block" type="submit" style="margin-top:12px">Guardar</button>
      </form>
      ${id ? `<button class="btn danger block" id="delGrp" style="margin-top:10px">Eliminar grupo</button>` : ''}`);

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

  // ---------------------------------------------------------------- AJUSTES
  function renderSettings() {
    const s = S.settings;
    return `
      <div class="card"><h3>General</h3>
        <label class="f"><span>Moneda</span><select data-setting="currency">${['USD', 'EUR', 'GBP', 'MXN', 'COP', 'ARS', 'CLP'].map((c) => `<option ${c === s.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>

      <div class="card"><h3>☁ Sincronización automática (PC, móvil, tablet…)</h3>
        ${syncOn() ? `
          <p class="small ${sync.error ? 'neg' : 'pos'}">${sync.error ? '⚠ ' + esc(sync.error) : '✓ Activada'}${sync.last ? ` · última vez ${new Date(sync.last).toLocaleString('es-ES')}` : ''}</p>
          <p class="small muted">Cada cambio se guarda en este dispositivo y se sube cifrado a tu GitHub. Los demás dispositivos lo reciben al abrir la app.</p>
          <div class="row"><button class="btn primary grow" data-act="sync-now">Sincronizar ahora</button><button class="btn grow" data-act="sync-off">Desconectar este dispositivo</button></div>` : `
          <p class="small muted">Haz esto una vez en cada dispositivo con el <b>mismo token</b> y la <b>misma contraseña</b>:</p>
          <ol class="small muted" style="padding-left:18px;margin:6px 0 12px">
            <li><a href="https://github.com/settings/tokens/new?scopes=gist&description=Mesa%20Fondeo" target="_blank" rel="noopener" style="color:var(--brand)">Crea un token de GitHub</a> (permiso <b>gist</b> ya marcado, sin caducidad) y cópialo.</li>
            <li>Pégalo aquí y elige una contraseña de sincronización.</li>
          </ol>
          <label class="f"><span>Token de GitHub</span><input id="syncToken" type="password" autocomplete="off" placeholder="ghp_…"></label>
          <label class="f"><span>Contraseña de sincronización (cifra tus datos)</span><input id="syncPass" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>
          <button class="btn primary block" data-act="sync-on">Activar sincronización</button>`}
      </div>

      <div class="card"><h3>Pasar datos por archivo (sin nube)</h3>
        <p class="small muted">Todo se guarda automáticamente en este dispositivo. Para pasarlo a otro móvil, tablet u ordenador:</p>
        <ol class="small muted" style="padding-left:18px;margin:6px 0 12px">
          <li>Pulsa <b>Compartir datos</b> y envía el archivo (WhatsApp, AirDrop, correo, Drive…).</li>
          <li>En el otro dispositivo abre la app → Ajustes → <b>Recibir datos</b> y elige el archivo.</li>
          <li>Los datos se <b>combinan</b>: se añade lo nuevo, se actualiza lo más reciente y se aplican los borrados. No se pierde nada.</li>
        </ol>
        <label class="f"><span>Contraseña del archivo (recomendado: incluye tus credenciales)</span><input type="password" id="sharePass" autocomplete="new-password" placeholder="Mínimo 4 caracteres"></label>
        <div class="row">
          <button class="btn primary grow" data-act="share">Compartir datos</button>
          <label class="btn grow" style="justify-content:center">Recibir datos<input type="file" id="restore" hidden></label>
        </div>
        ${S.lastSync ? `<p class="small muted" style="margin:10px 0 0">Última combinación: ${new Date(S.lastSync).toLocaleString('es-ES')}</p>` : ''}
        <button class="btn danger block" data-act="wipe" style="margin-top:12px">Borrar todos los datos de este dispositivo</button>
      </div>

      <div class="card"><h3>Instalar en el móvil</h3>
        <p class="small muted"><b>iPhone:</b> abre la web en Safari → Compartir → “Añadir a pantalla de inicio”.<br>
        <b>Android:</b> abre en Chrome → menú ⋮ → “Instalar aplicación”.</p>
      </div>
      <div class="note warn">Las contraseñas se guardan sin cifrar en el almacenamiento del navegador de este dispositivo. No compartas tu móvil desbloqueado ni tus copias de seguridad.</div>`;
  }

  // ---------------------------------------------------------------- compartir
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  const keyCache = new Map();
  async function deriveKey(pass, salt) {
    const ck = pass + '|' + b64(salt);
    if (keyCache.has(ck)) return keyCache.get(ck);
    const k = await deriveKeyRaw(pass, salt);
    keyCache.set(ck, k);
    return k;
  }
  let lastSalt = null;
  async function deriveKeyRaw(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptData(obj, pass) {
    const salt = lastSalt?.pass === pass ? lastSalt.salt : crypto.getRandomValues(new Uint8Array(16));
    lastSalt = { pass, salt };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt), new TextEncoder().encode(JSON.stringify(obj)));
    return { app: 'mesa-fondeo', format: 1, enc: 'AES-GCM', salt: b64(salt), iv: b64(iv), data: b64(ct) };
  }
  async function decryptData(p, pass) {
    const salt = unb64(p.salt);
    const key = await deriveKey(pass, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, key, unb64(p.data));
    lastSalt = { pass, salt };
    return JSON.parse(new TextDecoder().decode(pt));
  }

  async function shareData() {
    const pass = $('#sharePass')?.value || '';
    if (pass && pass.length < 4) { toast('La contraseña debe tener al menos 4 caracteres'); return; }
    if (!pass && !confirm('Sin contraseña, el archivo lleva tus credenciales legibles. ¿Compartir igualmente?')) return;
    const { lastSync: _l, ...data } = S;
    const payload = pass ? await encryptData(data, pass) : { app: 'mesa-fondeo', format: 1, data };
    const name = `mesa-fondeo-${today()}.json`;
    const text = JSON.stringify(payload);
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Datos Mesa Fondeo' }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    download(name, text, 'application/json');
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
      const kept = [...map.values()].filter((x) => !isDel(x));
      r.removed += S[k].filter((x) => isDel(x)).length;
      S[k] = kept;
    }
    S.deleted = deleted;
    S.lastSync = Date.now();
    snapshot();
    persist();
    return r;
  }

  // ---------------------------------------------------------------- sincronización automática
  // Los datos se guardan cifrados (misma contraseña en todos los dispositivos) en un gist secreto de tu cuenta de GitHub.
  const SYNC_KEY = 'mesa-fondeo-sync';
  const GIST_DESC = 'mesa-fondeo-sync', GIST_FILE = 'mesa-fondeo.json';
  let sync = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; } })();
  let syncing = false, syncAgain = false, syncTimer = null;
  const saveSync = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch { /* no-op */ } };
  const syncOn = () => !!(sync.token && sync.pass);
  const shareable = () => { const { lastSync: _l, ...d } = S; return d; };
  const stateSig = (d) => JSON.stringify([LISTS.map((k) => (d[k] || []).map(sig).sort()), Object.keys(d.deleted || {}).sort()]);

  function scheduleSync() {
    if (!syncOn()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), 1500);
  }

  async function gh(path, opts = {}) {
    const res = await fetch('https://api.github.com' + path, {
      ...opts,
      headers: { Authorization: `Bearer ${sync.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (res.status === 401) throw new Error('El token de GitHub no es válido');
    if (res.status === 403 || res.status === 404) throw new Error('El token no tiene permiso de gists');
    if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
    return res.status === 204 ? null : res.json();
  }

  async function findGist() {
    for (let page = 1; page <= 5; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const g = list.find((x) => x.description === GIST_DESC && x.files?.[GIST_FILE]);
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
      if (!sync.gistId) sync.gistId = await findGist();
      let remote = null;
      if (sync.gistId) {
        const g = await gh(`/gists/${sync.gistId}`);
        const f = g.files?.[GIST_FILE];
        const content = f?.truncated ? await (await fetch(f.raw_url)).text() : f?.content;
        if (content) {
          try { remote = await decryptData(JSON.parse(content), sync.pass); } catch { throw new Error('La contraseña de sincronización no coincide'); }
        }
      }
      let changed = null;
      if (remote) {
        const before = stateSig(S);
        changed = mergeData(migrate({ ...blank(), ...remote }));
        if (stateSig(S) === before) changed = null;
      }
      if (!remote || stateSig(remote) !== stateSig(S)) {
        const body = { description: GIST_DESC, files: { [GIST_FILE]: { content: JSON.stringify(await encryptData(shareable(), sync.pass)) } } };
        if (sync.gistId) await gh(`/gists/${sync.gistId}`, { method: 'PATCH', body: JSON.stringify(body) });
        else sync.gistId = (await gh('/gists', { method: 'POST', body: JSON.stringify({ ...body, public: false }) })).id;
      }
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

  function syncBadge() {
    const el = $('#headerActions');
    if (!el) return;
    if (!syncOn()) { el.innerHTML = ''; return; }
    const st = syncing ? ['⟳', 'Sincronizando…', ''] : sync.error ? ['⚠', sync.error, 'neg'] : ['☁ ✓', 'Sincronizado', 'pos'];
    el.innerHTML = `<button class="btn sm ${st[2]}" data-act="sync-now" title="${esc(st[1])}">${st[0]}</button>`;
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

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function loadDemo() {
    const mk = (o) => ({ id: uid(), createdAt: Date.now(), platform: 'Quantower', feed: 'Rithmic', ddType: 'Trailing intradía', split: 90, ...o });
    const a1 = mk({ firm: 'Apex', size: 50000, phase: 'Fondeada (PA)', balance: 52850, peak: 53100, target: 3000, maxDD: 2500, lockAt: 50100, maxContracts: 10, monthlyFee: 85, accountId: 'APEX-123456-01', login: 'APEX-123456', password: 'demo', server: 'Apex', gateway: 'Chicago Area' });
    const a2 = mk({ firm: 'Apex', size: 50000, phase: 'Fondeada (PA)', balance: 51200, peak: 51900, target: 3000, maxDD: 2500, lockAt: 50100, maxContracts: 10, monthlyFee: 85, accountId: 'APEX-123456-02', login: 'APEX-123456', password: 'demo', server: 'Apex', gateway: 'Chicago Area' });
    const a3 = mk({ firm: 'Topstep', size: 150000, phase: 'Evaluación', platform: 'TradingView', feed: 'Tradovate', ddType: 'Trailing fin de día (EOD)', balance: 154300, peak: 154900, target: 9000, maxDD: 4500, dailyLoss: 3000, maxContracts: 15, monthlyFee: 149, accountId: 'S1OCT1234567', login: 'mi_usuario' });
    const a4 = mk({ firm: 'Tradeify', size: 100000, phase: 'Perdida', platform: 'NinjaTrader', feed: 'Tradovate', ddType: 'Trailing fin de día (EOD)', balance: 96400, target: 6000, maxDD: 3500, accountId: 'TDY100-7788' });
    S.accounts.push(a1, a2, a3, a4);
    const d = (m, day) => { const x = new Date(); x.setMonth(x.getMonth() - m, day); return x.toISOString().slice(0, 10); };
    const mv = (type, category, amount, date, acc, note = '') => S.movements.push({ id: uid(), type, category, amount, date, accountId: acc.id, firm: acc.firm, note });
    mv('gasto', 'Evaluación / suscripción', 167, d(5, 3), a1); mv('gasto', 'Evaluación / suscripción', 167, d(5, 3), a2);
    mv('gasto', 'Activación PA', 85, d(4, 12), a1); mv('gasto', 'Activación PA', 85, d(4, 14), a2);
    mv('gasto', 'Evaluación / suscripción', 359, d(3, 2), a4); mv('gasto', 'Reset', 99, d(3, 20), a4);
    mv('gasto', 'Licencia plataforma', 70, d(2, 1), a1, 'Quantower');
    mv('ingreso', 'Payout', 2000, d(2, 22), a1); mv('ingreso', 'Payout', 1500, d(1, 18), a2);
    mv('gasto', 'Evaluación / suscripción', 149, d(1, 2), a3);
    mv('ingreso', 'Payout', 2500, d(0, 6), a1);
    // Cierres de los últimos días laborables
    const closes = (acc, pnls) => {
      let bal = num(acc.size) + 1000;
      const dates = [];
      for (let i = 1, x = new Date(); dates.length < pnls.length; i++) { x = new Date(); x.setDate(x.getDate() - i); if (x.getDay() % 6) dates.unshift(x.toISOString().slice(0, 10)); }
      pnls.forEach((p, i) => { const prev = bal; bal += p; S.days.push({ id: uid(), accountId: acc.id, date: dates[i], balance: bal, prev, pnl: p, note: '' }); });
      acc.balance = bal; acc.peak = Math.max(num(acc.peak), bal);
    };
    a1.minDays = 8; a2.minDays = 8; a3.minDays = 5; a3.minDayProfit = 150;
    closes(a1, [420, -180, 650, 310, 220, -90, 380]);
    closes(a2, [250, 300, -400, 180]);
    closes(a3, [900, 150, -300, 1200, 640, 410]);
    S.copyGroups.push({ id: uid(), name: 'NQ Apex', masterId: a1.id, mode: 'fixed', unit: 'mini', calcLot: 2, slaves: [{ accountId: a2.id, multiplier: 1 }, { accountId: a3.id, multiplier: 1.5 }] });
    save(); render(); toast('Datos de ejemplo cargados');
  }

  // ---------------------------------------------------------------- sheet
  function sheet(html) {
    closeSheet();
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
    bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() { $$('.sheet-bg').forEach((x) => x.remove()); document.body.style.overflow = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // ---------------------------------------------------------------- eventos
  function bindView() {
    const v = $('#view');
    $('#accSearch')?.addEventListener('input', (e) => {
      ui.accQuery = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const s = $('#accSearch'); s.focus(); s.setSelectionRange(pos, pos);
    });
    $('#restore')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) receiveData(file);
    });
    $$('[data-setting]', v).forEach((el) => el.addEventListener('change', () => {
      S.settings[el.dataset.setting] = el.value.trim(); save(); render(); toast('Ajuste guardado');
    }));
    $$('[data-calclot]', v).forEach((el) => el.addEventListener('change', () => {
      const g = S.copyGroups.find((x) => x.id === el.dataset.calclot); g.calcLot = num(el.value) || 0; save(); render();
    }));
  }

  const CRED_NAMES = { accountId: 'ID de cuenta', login: 'Usuario', password: 'Contraseña', server: 'Sistema', gateway: 'Gateway' };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-mov]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) return go(d.tab);
    if (d.go) return go(d.go);
    if (d.accfilter) { ui.accFilter = d.accfilter; return render(); }
    if (d.ui) { const [k, val] = d.ui.split(':'); ui[k] = val; return render(); }
    if (d.edit) return accountSheet(d.edit);
    if (d.closeday) return closeDaySheet(d.closeday);
    if (d.history) return historySheet(d.history);
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
    if (d.copyall) {
      const a = accById(d.copyall);
      return copyText([
        `${a.firm} ${kfmt(num(a.size))} (${a.phase})`,
        `Plataforma: ${a.platform}${a.feed ? ' · ' + a.feed : ''}`,
        ...Object.entries(CRED_NAMES).filter(([k]) => a[k]).map(([k, n]) => `${n}: ${a[k]}`),
      ].join('\n'), 'Datos de la cuenta copiados');
    }
    if (d.copylots) {
      const g = S.copyGroups.find((x) => x.id === d.copylots);
      const lead = num(g.calcLot ?? 1);
      const m = accById(g.masterId);
      return copyText([
        `${g.name}`,
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
        if (confirm(`¿Borrar TODAS las cuentas, movimientos y grupos de este dispositivo?${syncOn() ? ' También se desconectará la sincronización (los demás dispositivos y la nube no se tocan).' : ''}`)) {
          sync = {}; saveSync(); syncBadge();
          S = blank(); snapshot(); persist(); render(); toast('Datos borrados');
        }
        return;
    }
  });

  // ---------------------------------------------------------------- inicio
  try { const t = sessionStorage.getItem('tab'); if (t && VIEWS[t]) ui.tab = t; } catch { /* no-op */ }
  render();
  syncBadge();
  syncNow();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
