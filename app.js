/* Mesa Fondeo – gestor de cuentas de fondeo (PWA, datos locales) */
(() => {
  'use strict';

  // ---------------------------------------------------------------- estado
  const KEY = 'mesa-fondeo-v1';
  const PHASES = ['Fase 1', 'Fase 2', 'Fondeada', 'Perdida', 'Retirada'];
  const PLATFORMS = ['MT5', 'MT4', 'cTrader', 'DXtrade', 'Match-Trader', 'TradeLocker', 'Tradovate', 'Rithmic', 'NinjaTrader', 'Otra'];
  const EXPENSE_CATS = ['Challenge', 'Reset', 'Activación', 'Suscripción', 'VPS / Software', 'Datos / Plataforma', 'Otro gasto'];
  const INCOME_CATS = ['Payout', 'Reembolso challenge', 'Otro ingreso'];

  const blank = () => ({
    accounts: [],
    movements: [],
    copyGroups: [],
    settings: { currency: 'USD', metaapiToken: '', metaapiRegion: 'new-york' },
  });

  let S = load();
  let ui = { tab: 'home', accFilter: 'Activas', accQuery: '', moneyType: 'all', moneyRange: 'all' };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const d = JSON.parse(raw);
      const b = blank();
      return { ...b, ...d, settings: { ...b.settings, ...(d.settings || {}) } };
    } catch { return blank(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('No se pudo guardar en este dispositivo'); }
    MetaApi.configure(S.settings);
  }
  MetaApi.configure(S.settings);

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
  const accLabel = (a) => (a ? `${a.firm} ${kfmt(a.size)}${a.label ? ' · ' + a.label : ''}` : '—');
  const isActive = (a) => !['Perdida', 'Retirada'].includes(a.phase);
  const phaseClass = (p) => (p === 'Fondeada' ? 'b-funded' : p.startsWith('Fase') ? 'b-eval' : p === 'Perdida' ? 'b-lost' : 'b-other');
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

  function accStats(a) {
    const size = num(a.size), bal = a.balance === '' || a.balance == null ? size : num(a.balance);
    const profit = bal - size;
    const targetAmt = size * num(a.target) / 100;
    const floor = size * (1 - num(a.maxDD) / 100);
    const ddRoom = bal - floor;
    const ddTotal = size - floor;
    const movs = S.movements.filter((m) => m.accountId === a.id);
    return {
      bal, profit,
      targetPct: targetAmt > 0 ? Math.max(0, Math.min(100, (profit / targetAmt) * 100)) : 0,
      targetAmt, ddRoom, ddPct: ddTotal > 0 ? Math.max(0, Math.min(100, (ddRoom / ddTotal) * 100)) : 100,
      ...totals(movs),
    };
  }

  function inRange(date, range) {
    if (range === 'all') return true;
    const now = new Date();
    if (range === 'month') return date.startsWith(now.toISOString().slice(0, 7));
    if (range === 'year') return date.startsWith(String(now.getFullYear()));
    return true;
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
    $('#headerActions').innerHTML = '';
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
  function renderHome() {
    const t = totals();
    const active = S.accounts.filter(isActive);
    const funded = active.filter((a) => a.phase === 'Fondeada');
    const evals = active.filter((a) => a.phase.startsWith('Fase'));
    const fundedCap = funded.reduce((s, a) => s + num(a.size), 0);
    const pending = funded.reduce((s, a) => { const st = accStats(a); return s + Math.max(0, st.profit) * num(a.split || 80) / 100; }, 0);

    if (!S.accounts.length && !S.movements.length) {
      return `
        <div class="empty"><div class="big">📊</div>
          <h3>Bienvenido a Mesa Fondeo</h3>
          <p>Registra tus cuentas de fondeo, lo que gastas en challenges y lo que cobras en payouts.</p>
          <div class="row" style="justify-content:center">
            <button class="btn primary" data-act="new-acc">Añadir cuenta</button>
            <button class="btn" data-act="demo">Cargar ejemplo</button>
          </div>
        </div>`;
    }

    return `
      <div class="kpis">
        <div class="kpi"><div class="l">Gastado</div><div class="v neg">${money(t.spent)}</div></div>
        <div class="kpi"><div class="l">Cobrado</div><div class="v pos">${money(t.earned)}</div></div>
        <div class="kpi"><div class="l">Beneficio neto</div><div class="v ${t.net >= 0 ? 'pos' : 'neg'}">${money(t.net, true)}</div></div>
        <div class="kpi"><div class="l">ROI</div><div class="v ${t.roi >= 0 ? 'pos' : 'neg'}">${pct(t.roi)}</div></div>
        <div class="kpi"><div class="l">Capital fondeado</div><div class="v">${money(fundedCap)}</div><div class="small muted">${funded.length} fondeada(s) · ${evals.length} en evaluación</div></div>
        <div class="kpi"><div class="l">Payout potencial</div><div class="v">${money(pending)}</div><div class="small muted">beneficio actual × split</div></div>
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
    const data = months.map((k) => totals(S.movements.filter((m) => monthKey(m.date) === k)));
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
    const filters = ['Activas', 'Fondeada', 'Evaluación', 'Perdida', 'Retirada', 'Todas'];
    const q = ui.accQuery.toLowerCase();
    const list = S.accounts.filter((a) => {
      const f = ui.accFilter;
      const ok = f === 'Todas' || (f === 'Activas' && isActive(a)) || (f === 'Evaluación' && a.phase.startsWith('Fase')) || a.phase === f;
      return ok && (!q || `${a.firm} ${a.label} ${a.login} ${a.server}`.toLowerCase().includes(q));
    });
    return `
      <input class="search" id="accSearch" placeholder="Buscar empresa, login, servidor…" value="${esc(ui.accQuery)}">
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
    return `
      <div class="card">
        <div class="acc-head">
          <div><div class="acc-name">${esc(a.firm)} · ${kfmt(num(a.size))}</div>
            <div class="acc-meta">${esc(a.platform)}${a.label ? ' · ' + esc(a.label) : ''}${a.metaapiId ? ' · 🔗 conectada' : ''}</div></div>
          <span class="badge ${phaseClass(a.phase)}">${esc(a.phase)}</span>
        </div>
        <div class="stats3">
          <div><div class="l">Balance</div><div class="v">${money(st.bal)}</div></div>
          <div><div class="l">P/L cuenta</div><div class="v ${st.profit >= 0 ? 'pos' : 'neg'}">${money(st.profit, true)}</div></div>
          <div><div class="l">Neto cobrado</div><div class="v ${st.net >= 0 ? 'pos' : 'neg'}">${money(st.net, true)}</div></div>
        </div>
        ${num(a.target) && a.phase.startsWith('Fase') ? `<div class="small muted">Objetivo ${pct(num(a.target))} · ${pct(st.targetPct)} completado</div><div class="bar g"><i style="width:${st.targetPct}%"></i></div>` : ''}
        ${num(a.maxDD) ? `<div class="small muted" style="margin-top:6px">Margen hasta drawdown máx.: ${money(st.ddRoom)}</div><div class="bar ${st.ddPct < 30 ? 'r' : st.ddPct < 60 ? 'a' : ''}"><i style="width:${st.ddPct}%"></i></div>` : ''}
        ${cred('Login', a.login, 'login')}${cred('Servidor', a.server, 'server')}${cred('Contraseña', a.password, 'password', true)}
        <div class="row" style="margin-top:10px">
          <button class="btn sm" data-edit="${a.id}">Editar</button>
          <button class="btn sm" data-addmov="${a.id}:gasto">− Gasto</button>
          <button class="btn sm" data-addmov="${a.id}:ingreso">+ Payout</button>
          <button class="btn sm" data-copyall="${a.id}">Copiar datos</button>
          ${a.metaapiId ? `<button class="btn sm" data-sync="${a.id}">↻ Sincronizar</button>` : ''}
        </div>
      </div>`;
  }

  function accountSheet(id, preset = {}) {
    const a = id ? accById(id) : { phase: 'Fase 1', platform: 'MT5', target: 10, maxDD: 10, dailyDD: 5, split: 80, ...preset };
    const opt = (arr, v) => arr.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const firms = [...new Set(S.accounts.map((x) => x.firm))];
    sheet(`
      <h2>${id ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
      <form id="accForm">
        <div class="grid2">
          <label class="f"><span>Empresa de fondeo</span><input name="firm" list="firmList" required value="${esc(a.firm)}" placeholder="FTMO, FundedNext…"></label>
          <label class="f"><span>Tamaño cuenta</span><input name="size" inputmode="decimal" required value="${esc(a.size)}" placeholder="100000"></label>
          <label class="f"><span>Fase</span><select name="phase">${opt(PHASES, a.phase)}</select></label>
          <label class="f"><span>Plataforma</span><select name="platform">${opt(PLATFORMS, a.platform)}</select></label>
          <label class="f"><span>Login / ID</span><input name="login" value="${esc(a.login)}" autocomplete="off"></label>
          <label class="f"><span>Servidor</span><input name="server" value="${esc(a.server)}" autocomplete="off"></label>
        </div>
        <label class="f"><span>Contraseña (se guarda solo en este móvil)</span><input name="password" type="password" value="${esc(a.password)}" autocomplete="new-password"></label>
        <div class="grid2">
          <label class="f"><span>Balance actual</span><input name="balance" inputmode="decimal" value="${esc(a.balance)}" placeholder="= tamaño"></label>
          <label class="f"><span>Etiqueta</span><input name="label" value="${esc(a.label)}" placeholder="Swing, #2…"></label>
          <label class="f"><span>Objetivo %</span><input name="target" inputmode="decimal" value="${esc(a.target)}"></label>
          <label class="f"><span>DD máximo %</span><input name="maxDD" inputmode="decimal" value="${esc(a.maxDD)}"></label>
          <label class="f"><span>DD diario %</span><input name="dailyDD" inputmode="decimal" value="${esc(a.dailyDD)}"></label>
          <label class="f"><span>Profit split %</span><input name="split" inputmode="decimal" value="${esc(a.split)}"></label>
        </div>
        ${id ? '' : `<label class="f"><span>Precio del challenge (se registra como gasto)</span><input name="cost" inputmode="decimal" placeholder="0"></label>`}
        <label class="f"><span>Notas</span><textarea name="notes" rows="2">${esc(a.notes)}</textarea></label>
        <datalist id="firmList">${firms.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
        <button class="btn primary block" type="submit">Guardar</button>
      </form>
      ${id ? `
        <div class="row" style="margin-top:10px">
          <button class="btn grow" data-dup="${id}">Duplicar cuenta</button>
          ${a.metaapiId ? '' : `<button class="btn grow" data-connect="${id}">🔗 Conectar MetaApi</button>`}
          <button class="btn danger grow" data-del="${id}">Eliminar</button>
        </div>` : ''}`);

    $('#accForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const cost = num(f.cost); delete f.cost;
      if (id) Object.assign(a, f, { updatedAt: Date.now() });
      else {
        const acc = { id: uid(), createdAt: Date.now(), ...f };
        S.accounts.push(acc);
        if (cost > 0) S.movements.push({ id: uid(), type: 'gasto', category: 'Challenge', amount: cost, date: today(), accountId: acc.id, firm: acc.firm, note: `Challenge ${kfmt(num(acc.size))}` });
      }
      save(); closeSheet(); render(); toast('Cuenta guardada');
    };
    const sh = $('.sheet');
    sh.querySelector('[data-del]')?.addEventListener('click', () => {
      if (!confirm('¿Eliminar esta cuenta? Sus movimientos se conservan.')) return;
      S.accounts = S.accounts.filter((x) => x.id !== id);
      S.copyGroups.forEach((g) => { g.slaves = g.slaves.filter((s) => s.accountId !== id); if (g.masterId === id) g.masterId = ''; });
      save(); closeSheet(); render(); toast('Cuenta eliminada');
    });
    sh.querySelector('[data-dup]')?.addEventListener('click', () => {
      const { id: _i, login: _l, password: _p, metaapiId: _m, balance: _b, createdAt: _c, ...rest } = a;
      closeSheet(); accountSheet(null, { ...rest, phase: 'Fase 1' });
    });
    sh.querySelector('[data-connect]')?.addEventListener('click', () => connectMetaApi(id));
  }

  async function connectMetaApi(id) {
    const a = accById(id);
    if (!MetaApi.enabled()) { toast('Añade tu token de MetaApi en Ajustes'); return; }
    if (!['MT4', 'MT5'].includes(a.platform)) { toast('MetaApi solo admite MT4 / MT5'); return; }
    if (!a.login || !a.password || !a.server) { toast('Rellena login, contraseña y servidor'); return; }
    try {
      toast('Conectando con MetaApi…');
      a.metaapiId = await MetaApi.createAccount({ name: accLabel(a), login: a.login, password: a.password, server: a.server, platform: a.platform });
      try { await MetaApi.deploy(a.metaapiId); } catch { /* ya desplegada */ }
      save(); closeSheet(); render(); toast('Cuenta conectada. Sincroniza en 1-2 min.');
    } catch (err) { toast(err.message); }
  }

  async function syncAccount(id, quiet = false) {
    const a = accById(id);
    try {
      const info = await MetaApi.accountInfo(a.metaapiId);
      a.balance = info.balance; a.equity = info.equity; a.lastSync = Date.now();
      save(); if (!quiet) { render(); toast(`Balance ${money(info.balance)} · Equity ${money(info.equity)}`); }
      return true;
    } catch (err) { if (!quiet) toast(err.message); return false; }
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
      <div class="row" style="margin-bottom:12px">
        <button class="btn grow" data-act="new-gasto">− Añadir gasto</button>
        <button class="btn grow" data-act="new-ingreso">+ Añadir ingreso</button>
      </div>
      <div class="seg">${seg('moneyType', 'all', 'Todos')}${seg('moneyType', 'gasto', 'Gastos')}${seg('moneyType', 'ingreso', 'Ingresos')}</div>
      ${movs.length ? Object.entries(groups).map(([k, ms]) => {
        const tt = totals(ms);
        return `<div class="section-title"><span>${k === '0000-00' ? 'Sin fecha' : monthName(k)}</span><span class="${tt.net >= 0 ? 'pos' : 'neg'}">${money(tt.net, true)}</span></div><div class="card">${movementList(ms)}</div>`;
      }).join('') : '<div class="empty"><div class="big">💸</div>No hay movimientos en este periodo.</div>'}
      ${S.movements.length ? '<button class="btn block" data-act="csv" style="margin-top:10px">Exportar CSV</button>' : ''}`;
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
      Agrupa una <b>cuenta maestra</b> y varias <b>esclavas</b> con su multiplicador. Usa la calculadora para saber qué lote abrir en cada cuenta
      o, si tus cuentas MT4/MT5 están conectadas con MetaApi, activa la <b>copia automática</b> (CopyFactory).</div>`;
    if (!S.copyGroups.length) return intro + `<div class="empty"><div class="big">🔁</div>Aún no tienes grupos de copia.<br><br><button class="btn primary" data-act="new-group">Crear grupo</button></div>`;
    return intro + S.copyGroups.map(groupCard).join('');
  }

  function slaveLot(g, s, masterLot) {
    const master = accById(g.masterId), slave = accById(s.accountId);
    if (!slave) return 0;
    let lot = masterLot * num(s.multiplier || 1);
    if (g.mode === 'balance' && master) lot = masterLot * (num(slave.size) / (num(master.size) || 1)) * num(s.multiplier || 1);
    return Math.max(0, Math.floor(lot * 100) / 100);
  }

  function groupCard(g) {
    const master = accById(g.masterId);
    const lot = num(g.calcLot || 1);
    return `
      <div class="card copy-group">
        <div class="row between">
          <div><div class="acc-name">${esc(g.name)}</div><div class="small muted">${g.mode === 'balance' ? 'Proporcional al tamaño' : 'Multiplicador fijo'}${g.strategyId ? ' · CopyFactory ' + esc(g.strategyId) : ''}</div></div>
          <label class="switch" title="Copia automática MetaApi"><input type="checkbox" data-auto="${g.id}" ${g.active ? 'checked' : ''}><i></i></label>
        </div>
        <div class="slave" style="border-color:var(--brand)"><span>👑 ${esc(accLabel(master))}</span><span class="muted">maestra</span></div>
        <div class="arrow">↓</div>
        ${g.slaves.map((s) => `<div class="slave"><span>${esc(accLabel(accById(s.accountId)))}</span><span>×${esc(s.multiplier)} → <b>${slaveLot(g, s, lot).toFixed(2)}</b> lotes</span></div>`).join('') || '<div class="small muted">Sin cuentas esclavas.</div>'}
        <div class="row" style="margin-top:10px">
          <span class="small muted">Lote maestra</span>
          <input class="search" style="width:90px;margin:0;padding:6px 8px" inputmode="decimal" data-calclot="${g.id}" value="${esc(g.calcLot ?? 1)}">
          <button class="btn sm" data-copylots="${g.id}">Copiar lotes</button>
          <button class="btn sm" data-editgroup="${g.id}">Editar</button>
        </div>
      </div>`;
  }

  function groupSheet(id) {
    const g = id ? S.copyGroups.find((x) => x.id === id) : { name: '', masterId: '', mode: 'balance', slaves: [] };
    if (S.accounts.length < 2) { toast('Necesitas al menos 2 cuentas'); return; }
    const accOpts = (sel) => S.accounts.filter(isActive).map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(accLabel(a))}</option>`).join('');
    sheet(`
      <h2>${id ? 'Editar grupo de copia' : 'Nuevo grupo de copia'}</h2>
      <form id="grpForm">
        <label class="f"><span>Nombre</span><input name="name" required value="${esc(g.name)}" placeholder="Estrategia NASDAQ"></label>
        <label class="f"><span>Cuenta maestra</span><select name="masterId" required>${accOpts(g.masterId)}</select></label>
        <label class="f"><span>Cálculo de lotes</span><select name="mode">
          <option value="balance" ${g.mode === 'balance' ? 'selected' : ''}>Proporcional al tamaño × multiplicador</option>
          <option value="fixed" ${g.mode === 'fixed' ? 'selected' : ''}>Lote maestra × multiplicador</option></select></label>
        <div class="section-title"><span>Cuentas esclavas</span></div>
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
      const data = { name: f.name, masterId: f.masterId, mode: f.mode, slaves };
      if (id) Object.assign(g, data); else S.copyGroups.push({ id: uid(), active: false, calcLot: 1, ...data });
      save(); closeSheet(); render(); toast('Grupo guardado');
      if (id && g.active) applyCopyFactory(g);
    };
    $('#delGrp')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este grupo?')) return;
      if (g.active) await disableCopyFactory(g);
      S.copyGroups = S.copyGroups.filter((x) => x.id !== id);
      save(); closeSheet(); render();
    });
  }

  async function applyCopyFactory(g) {
    const master = accById(g.masterId);
    const missing = [master, ...g.slaves.map((s) => accById(s.accountId))].filter((a) => !a?.metaapiId);
    if (!MetaApi.enabled()) throw new Error('Añade tu token de MetaApi en Ajustes');
    if (missing.length) throw new Error(`Conecta con MetaApi: ${missing.map(accLabel).join(', ')}`);
    g.strategyId = await MetaApi.upsertStrategy(g.strategyId, { name: g.name, masterMetaId: master.metaapiId });
    for (const s of g.slaves) {
      const a = accById(s.accountId);
      let mult = num(s.multiplier || 1);
      if (g.mode === 'balance') mult *= num(a.size) / (num(master.size) || 1);
      await MetaApi.upsertSubscriber(a.metaapiId, { name: accLabel(a), strategyId: g.strategyId, multiplier: Math.round(mult * 1000) / 1000 });
    }
    save();
  }

  async function disableCopyFactory(g) {
    for (const s of g.slaves) {
      const a = accById(s.accountId);
      if (a?.metaapiId) { try { await MetaApi.removeSubscriber(a.metaapiId); } catch { /* ya eliminado */ } }
    }
  }

  // ---------------------------------------------------------------- AJUSTES
  function renderSettings() {
    const s = S.settings;
    const regions = ['new-york', 'london', 'singapore', 'vint-hill'];
    return `
      <div class="card"><h3>General</h3>
        <label class="f"><span>Moneda</span><select data-setting="currency">${['USD', 'EUR', 'GBP', 'MXN', 'COP', 'ARS', 'CLP'].map((c) => `<option ${c === s.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>

      <div class="card"><h3>Conexión MetaApi (MT4 / MT5)</h3>
        <p class="small muted">Opcional. Con un token de <b>metaapi.cloud</b> puedes conectar tus cuentas, leer el balance en vivo y copiar operaciones automáticamente entre ellas.</p>
        <label class="f"><span>Token API</span><input type="password" data-setting="metaapiToken" value="${esc(s.metaapiToken)}" placeholder="eyJhbGciOi…" autocomplete="off"></label>
        <label class="f"><span>Región</span><select data-setting="metaapiRegion">${regions.map((r) => `<option ${r === s.metaapiRegion ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <div class="row">
          <button class="btn grow" data-act="meta-import">Importar cuentas de MetaApi</button>
          <button class="btn grow" data-act="meta-syncall">↻ Sincronizar todas</button>
        </div>
      </div>

      <div class="card"><h3>Copia de seguridad</h3>
        <p class="small muted">Tus datos se guardan solo en este dispositivo. Exporta una copia para pasarla a otro móvil.</p>
        <div class="row">
          <button class="btn grow" data-act="backup">Exportar copia</button>
          <label class="btn grow" style="justify-content:center">Importar copia<input type="file" accept="application/json,.json" id="restore" hidden></label>
        </div>
        <button class="btn danger block" data-act="wipe" style="margin-top:10px">Borrar todos los datos</button>
      </div>

      <div class="card"><h3>Instalar en el móvil</h3>
        <p class="small muted"><b>iPhone:</b> abre la web en Safari → Compartir → “Añadir a pantalla de inicio”.<br>
        <b>Android:</b> abre en Chrome → menú ⋮ → “Instalar aplicación”.</p>
      </div>
      <div class="note warn">Las contraseñas se guardan sin cifrar en el almacenamiento del navegador de este dispositivo. No compartas tu móvil desbloqueado ni tus copias de seguridad.</div>`;
  }

  async function metaImport() {
    try {
      toast('Leyendo cuentas de MetaApi…');
      const list = await MetaApi.listAccounts();
      let n = 0;
      for (const m of list) {
        if (S.accounts.some((a) => a.metaapiId === m._id || (a.login && String(a.login) === String(m.login) && a.server === m.server))) {
          const a = S.accounts.find((x) => String(x.login) === String(m.login) && x.server === m.server);
          if (a && !a.metaapiId) a.metaapiId = m._id;
          continue;
        }
        S.accounts.push({ id: uid(), createdAt: Date.now(), firm: m.name || 'MetaApi', size: '', phase: 'Fondeada', platform: (m.platform || 'mt5').toUpperCase(), login: m.login, server: m.server, password: '', metaapiId: m._id, target: 10, maxDD: 10, dailyDD: 5, split: 80 });
        n++;
      }
      save(); toast(`${n} cuenta(s) importada(s)`);
    } catch (err) { toast(err.message); }
  }

  async function syncAll() {
    const conn = S.accounts.filter((a) => a.metaapiId);
    if (!conn.length) { toast('No hay cuentas conectadas'); return; }
    toast(`Sincronizando ${conn.length} cuenta(s)…`);
    let ok = 0;
    for (const a of conn) if (await syncAccount(a.id, true)) ok++;
    render(); toast(`${ok}/${conn.length} sincronizadas`);
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function loadDemo() {
    const mk = (o) => ({ id: uid(), createdAt: Date.now(), target: 10, maxDD: 10, dailyDD: 5, split: 80, platform: 'MT5', ...o });
    const a1 = mk({ firm: 'FTMO', size: 100000, phase: 'Fondeada', balance: 104250, login: '5102345', server: 'FTMO-Server3', password: 'demo', split: 90 });
    const a2 = mk({ firm: 'FundedNext', size: 50000, phase: 'Fase 2', balance: 51800, login: '880122', server: 'FundedNext-Server', target: 5 });
    const a3 = mk({ firm: 'The5ers', size: 20000, phase: 'Fondeada', balance: 20640, login: '310998', server: 'FivePercentOnline-Real' });
    const a4 = mk({ firm: 'FTMO', size: 25000, phase: 'Perdida', balance: 22400, login: '5100001', server: 'FTMO-Server2' });
    S.accounts.push(a1, a2, a3, a4);
    const d = (m, day) => { const x = new Date(); x.setMonth(x.getMonth() - m, day); return x.toISOString().slice(0, 10); };
    const mv = (type, category, amount, date, acc, note = '') => S.movements.push({ id: uid(), type, category, amount, date, accountId: acc.id, firm: acc.firm, note });
    mv('gasto', 'Challenge', 540, d(5, 3), a1); mv('gasto', 'Challenge', 250, d(4, 10), a4);
    mv('gasto', 'Challenge', 299, d(3, 2), a2); mv('gasto', 'Challenge', 165, d(3, 15), a3);
    mv('ingreso', 'Payout', 1820, d(2, 20), a1); mv('ingreso', 'Reembolso challenge', 540, d(2, 20), a1);
    mv('gasto', 'VPS / Software', 30, d(1, 1), a1, 'VPS mensual'); mv('ingreso', 'Payout', 960, d(1, 18), a3);
    mv('ingreso', 'Payout', 2410, d(0, 5), a1); mv('gasto', 'Reset', 99, d(0, 8), a2);
    S.copyGroups.push({ id: uid(), name: 'Índices USA', masterId: a1.id, mode: 'balance', active: false, calcLot: 1, slaves: [{ accountId: a2.id, multiplier: 1 }, { accountId: a3.id, multiplier: 1 }] });
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
    $('#restore')?.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!Array.isArray(d.accounts) || !Array.isArray(d.movements)) throw new Error();
        if (!confirm('Esto reemplazará los datos actuales. ¿Continuar?')) return;
        S = { ...blank(), ...d, settings: { ...blank().settings, ...d.settings } };
        save(); render(); toast('Copia restaurada');
      } catch { toast('Archivo no válido'); }
    });
    $$('[data-setting]', v).forEach((el) => el.addEventListener('change', () => {
      S.settings[el.dataset.setting] = el.value.trim(); save(); render(); toast('Ajuste guardado');
    }));
    $$('[data-calclot]', v).forEach((el) => el.addEventListener('change', () => {
      const g = S.copyGroups.find((x) => x.id === el.dataset.calclot); g.calcLot = num(el.value) || 0; save(); render();
    }));
    $$('[data-auto]', v).forEach((el) => el.addEventListener('change', async () => {
      const g = S.copyGroups.find((x) => x.id === el.dataset.auto);
      try {
        if (el.checked) { toast('Activando copia en MetaApi…'); await applyCopyFactory(g); g.active = true; toast('Copia automática activa ✓'); }
        else { await disableCopyFactory(g); g.active = false; toast('Copia automática desactivada'); }
      } catch (err) { el.checked = !el.checked; toast(err.message); }
      save(); render();
    }));
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-mov]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) return go(d.tab);
    if (d.go) return go(d.go);
    if (d.accfilter) { ui.accFilter = d.accfilter; return render(); }
    if (d.ui) { const [k, val] = d.ui.split(':'); ui[k] = val; return render(); }
    if (d.edit) return accountSheet(d.edit);
    if (d.editgroup) return groupSheet(d.editgroup);
    if (d.mov) return movementSheet(d.mov);
    if (d.sync) { toast('Sincronizando…'); return syncAccount(d.sync); }
    if (d.addmov) {
      const [id, type] = d.addmov.split(':');
      return movementSheet(null, { type, accountId: id, category: type === 'gasto' ? 'Reset' : 'Payout' });
    }
    if (d.copy) {
      const [id, field] = d.copy.split(':');
      return copyText(String(accById(id)?.[field] ?? ''), { login: 'Login', server: 'Servidor', password: 'Contraseña' }[field]);
    }
    if (d.reveal) {
      const el = $(`[data-secret="${d.reveal}"]`);
      el.textContent = el.textContent.startsWith('•') ? accById(d.reveal).password : '••••••••';
      return;
    }
    if (d.copyall) {
      const a = accById(d.copyall);
      return copyText([`${a.firm} ${kfmt(num(a.size))} (${a.phase})`, `Plataforma: ${a.platform}`, a.login && `Login: ${a.login}`, a.password && `Contraseña: ${a.password}`, a.server && `Servidor: ${a.server}`].filter(Boolean).join('\n'), 'Datos de la cuenta copiados');
    }
    if (d.copylots) {
      const g = S.copyGroups.find((x) => x.id === d.copylots);
      const lot = num(g.calcLot || 1);
      return copyText([`${g.name} – maestra ${accLabel(accById(g.masterId))}: ${lot.toFixed(2)} lotes`, ...g.slaves.map((s) => `${accLabel(accById(s.accountId))}: ${slaveLot(g, s, lot).toFixed(2)} lotes`)].join('\n'), 'Lotes copiados');
    }
    switch (d.act) {
      case 'new-acc': return accountSheet();
      case 'new-group': return groupSheet();
      case 'new-gasto': return movementSheet(null, { type: 'gasto' });
      case 'new-ingreso': return movementSheet(null, { type: 'ingreso', category: 'Payout' });
      case 'demo': return loadDemo();
      case 'csv': return exportCSV();
      case 'backup': return download(`mesa-fondeo-${today()}.json`, JSON.stringify(S, null, 2), 'application/json');
      case 'meta-import': return metaImport();
      case 'meta-syncall': return syncAll();
      case 'wipe':
        if (confirm('¿Borrar TODAS las cuentas, movimientos y grupos de este dispositivo?')) { S = blank(); save(); render(); toast('Datos borrados'); }
        return;
    }
  });

  // ---------------------------------------------------------------- inicio
  try { const t = sessionStorage.getItem('tab'); if (t && VIEWS[t]) ui.tab = t; } catch { /* no-op */ }
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
