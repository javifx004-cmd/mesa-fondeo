/*
 * Conector opcional con MetaApi (metaapi.cloud) para cuentas MT4/MT5.
 * - Provisioning API: conectar cuentas (login/servidor/contraseña) y desplegarlas.
 * - Client API: leer balance, equity y posiciones.
 * - CopyFactory API: copiar operaciones de una cuenta maestra a varias esclavas.
 * El token se guarda solo en este dispositivo.
 */
const MetaApi = (() => {
  const DEFAULTS = {
    provisioning: 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai',
    client: 'https://mt-client-api-v1.{region}.agiliumtrade.ai',
    copyfactory: 'https://copyfactory-api-v1.{region}.agiliumtrade.ai',
  };

  let cfg = { token: '', region: 'new-york' };

  function configure(settings) {
    cfg = { token: settings.metaapiToken || '', region: settings.metaapiRegion || 'new-york' };
  }

  const enabled = () => !!cfg.token;
  const url = (kind, region) => DEFAULTS[kind].replace('{region}', region || cfg.region);

  async function req(base, path, opts = {}) {
    if (!cfg.token) throw new Error('Falta el token de MetaApi (Ajustes)');
    const res = await fetch(base + path, {
      method: opts.method || 'GET',
      headers: { 'auth-token': cfg.token, 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || res.statusText;
      throw new Error(`MetaApi ${res.status}: ${msg}`);
    }
    return data;
  }

  // --- Provisioning -------------------------------------------------------
  const listAccounts = () => req(url('provisioning'), '/users/current/accounts');
  const getAccount = (id) => req(url('provisioning'), `/users/current/accounts/${id}`);

  async function createAccount({ name, login, password, server, platform }) {
    const r = await req(url('provisioning'), '/users/current/accounts', {
      method: 'POST',
      body: {
        name, login: String(login), password, server,
        platform: platform === 'MT4' ? 'mt4' : 'mt5',
        magic: 0,
        region: cfg.region,
        copyFactoryRoles: ['PROVIDER', 'SUBSCRIBER'],
      },
    });
    return r.id;
  }

  const deploy = (id) => req(url('provisioning'), `/users/current/accounts/${id}/deploy`, { method: 'POST' });
  const undeploy = (id) => req(url('provisioning'), `/users/current/accounts/${id}/undeploy`, { method: 'POST' });

  // --- Client (datos en vivo) --------------------------------------------
  async function accountInfo(id) {
    const acc = await getAccount(id);
    const region = acc.region || cfg.region;
    const info = await req(url('client', region), `/users/current/accounts/${id}/account-information`);
    return { ...info, state: acc.state, connectionStatus: acc.connectionStatus };
  }

  async function positions(id) {
    const acc = await getAccount(id);
    return req(url('client', acc.region || cfg.region), `/users/current/accounts/${id}/positions`);
  }

  // --- CopyFactory --------------------------------------------------------
  const cf = (path, opts) => req(url('copyfactory'), path, opts);

  async function upsertStrategy(strategyId, { name, masterMetaId }) {
    if (!strategyId) strategyId = (await cf('/users/current/configuration/unused-strategy-id')).id;
    await cf(`/users/current/configuration/strategies/${strategyId}`, {
      method: 'PUT',
      body: { name, description: `Mesa Fondeo – ${name}`, accountId: masterMetaId },
    });
    return strategyId;
  }

  const upsertSubscriber = (slaveMetaId, { name, strategyId, multiplier }) =>
    cf(`/users/current/configuration/subscribers/${slaveMetaId}`, {
      method: 'PUT',
      body: { name, subscriptions: [{ strategyId, multiplier: Number(multiplier) || 1 }] },
    });

  const removeSubscriber = (slaveMetaId) =>
    cf(`/users/current/configuration/subscribers/${slaveMetaId}`, { method: 'DELETE' });

  const removeStrategy = (strategyId) =>
    cf(`/users/current/configuration/strategies/${strategyId}`, { method: 'DELETE' });

  return {
    configure, enabled, listAccounts, getAccount, createAccount, deploy, undeploy,
    accountInfo, positions, upsertStrategy, upsertSubscriber, removeSubscriber, removeStrategy,
  };
})();
