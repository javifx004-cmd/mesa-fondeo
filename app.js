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
    settings: { currency: 'USD' },
  });

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
    return d;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('No se pudo guardar en este dispositivo'); }
  }

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
      <img src="icons/icon.svg" alt="FundedLab">
      <div><div class="brand-name">Mesa Fondeo</div><div class="brand-by">by Javier Carbonell</div></div>
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
        ${num(a.maxDD) ? `<div class="small muted" style="margin-top:6px">${esc(a.ddType || 'Drawdown')}: liquidación en ${money(st.floor)} · margen <b>${money(st.ddRoom)}</b></div><div class="bar ${st.ddPct < 30 ? 'r' : st.ddPct < 60 ? 'a' : ''}"><i style="width:${st.ddPct}%"></i></div>` : ''}
        ${rules ? `<div class="small muted" style="margin-top:6px">${rules}</div>` : ''}
        ${cred('ID cuenta', a.accountId, 'accountId')}${cred('Usuario', a.login, 'login')}${cred('Contraseña', a.password, 'password', true)}${cred('Sistema', a.server, 'server')}${cred('Gateway', a.gateway, 'gateway')}
        <div class="row" style="margin-top:10px">
          <button class="btn sm" data-edit="${a.id}">Editar</button>
          <button class="btn sm" data-balance="${a.id}">Balance</button>
          <button class="btn sm" data-addmov="${a.id}:gasto">− Gasto</button>
          <button class="btn sm" data-addmov="${a.id}:ingreso">+ Payout</button>
          <button class="btn sm" data-copyall="${a.id}">Copiar datos</button>
        </div>
      </div>`;
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
      S.copyGroups.forEach((g) => { g.slaves = g.slaves.filter((s) => s.accountId !== id); if (g.masterId === id) g.masterId = ''; });
      save(); closeSheet(); render(); toast('Cuenta eliminada');
    });
    sh.querySelector('[data-dup]')?.addEventListener('click', () => {
      const { id: _i, accountId: _a, login: _l, password: _p, balance: _b, peak: _k, createdAt: _c, updatedAt: _u, ...rest } = a;
      closeSheet(); accountSheet(null, rest);
    });
  }

  // Actualización rápida del balance diario
  function balanceSheet(id) {
    const a = accById(id);
    const st = accStats(a);
    sheet(`
      <h2>Balance · ${esc(accLabel(a))}</h2>
      <form id="balForm">
        <label class="f"><span>Balance actual ($)</span><input name="balance" inputmode="decimal" required value="${esc(a.balance ?? '')}" placeholder="${esc(st.bal)}"></label>
        <p class="small muted">Pico registrado: ${money(st.peak)}. Si el nuevo balance lo supera, se actualiza solo.</p>
        <label class="f"><span>Estado</span><select name="phase">${PHASES.map((p) => `<option ${p === a.phase ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <button class="btn primary block" type="submit">Guardar</button>
      </form>`);
    $('#balForm [name=balance]').focus();
    $('#balForm').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      a.balance = f.balance; a.phase = f.phase; a.updatedAt = Date.now();
      if (num(a.balance) > st.peak) a.peak = a.balance;
      save(); closeSheet(); render(); toast('Balance actualizado');
    };
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
    $('#restore')?.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!Array.isArray(d.accounts) || !Array.isArray(d.movements)) throw new Error();
        if (!confirm('Esto reemplazará los datos actuales. ¿Continuar?')) return;
        S = migrate({ ...blank(), ...d, settings: { currency: d.settings?.currency || 'USD' } });
        save(); render(); toast('Copia restaurada');
      } catch { toast('Archivo no válido'); }
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
    if (d.balance) return balanceSheet(d.balance);
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
      case 'backup': return download(`mesa-fondeo-${today()}.json`, JSON.stringify(S, null, 2), 'application/json');
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
