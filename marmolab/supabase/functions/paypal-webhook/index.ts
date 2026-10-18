// Avisos de PayPal: activa, renueva o corta la suscripción de cada cliente en la tabla «licencias».
// Secretos (Supabase → Edge Functions → Secrets): PAYPAL_CLIENTE_ID, PAYPAL_SECRETO, PAYPAL_WEBHOOK_ID
// y PAYPAL_MODO=pruebas mientras uses el modo de pruebas (sandbox) de PayPal.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const API = Deno.env.get('PAYPAL_MODO') === 'pruebas' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const GRACIA_DIAS = 2;   // margen por si el cobro de PayPal llega con algo de retraso

async function token(): Promise<string> {
  const r = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${Deno.env.get('PAYPAL_CLIENTE_ID')}:${Deno.env.get('PAYPAL_SECRETO')}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('PayPal no da acceso: ' + r.status);
  return (await r.json()).access_token;
}

async function paypal(ruta: string, opciones: RequestInit = {}) {
  const r = await fetch(API + ruta, {
    ...opciones,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  if (!r.ok) throw new Error(`PayPal ${ruta}: ${r.status}`);
  return r.json();
}

// El aviso tiene que venir firmado por PayPal
async function verificar(h: Headers, evento: unknown) {
  const r = await paypal('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: h.get('paypal-auth-algo'), cert_url: h.get('paypal-cert-url'),
      transmission_id: h.get('paypal-transmission-id'), transmission_sig: h.get('paypal-transmission-sig'),
      transmission_time: h.get('paypal-transmission-time'), webhook_id: Deno.env.get('PAYPAL_WEBHOOK_ID'),
      webhook_event: evento,
    }),
  });
  return r.verification_status === 'SUCCESS';
}

// deno-lint-ignore no-explicit-any
async function guardarSuscripcion(s: any) {
  if (!s || !s.custom_id) return;   // custom_id = id del usuario de MarmoLab (lo pone la app al pagar)
  const proximo = s.billing_info?.next_billing_time;
  const cambios: Record<string, unknown> = { metodo: 'paypal', paypal_suscripcion: s.id, actualizado: new Date().toISOString() };
  if (s.status === 'ACTIVE') {
    cambios.estado = 'activa';
    if (proximo) cambios.activa_hasta = new Date(new Date(proximo).getTime() + GRACIA_DIAS * 86400000).toISOString();
  }
  await db.from('licencias').update(cambios).eq('user_id', s.custom_id);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  let evento;
  try { evento = JSON.parse(await req.text()); } catch { return new Response('JSON no válido', { status: 400 }); }
  try {
    if (!(await verificar(req.headers, evento))) return new Response('firma no válida', { status: 400 });
    const r = evento.resource || {};
    switch (evento.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
      case 'BILLING.SUBSCRIPTION.UPDATED':
        await guardarSuscripcion(await paypal(`/v1/billing/subscriptions/${r.id}`));
        break;
      case 'PAYMENT.SALE.COMPLETED':   // cobro de cada mes
        if (r.billing_agreement_id) await guardarSuscripcion(await paypal(`/v1/billing/subscriptions/${r.billing_agreement_id}`));
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        // puede seguir usándola hasta el final de lo que ya pagó (activa_hasta no cambia)
        await db.from('licencias').update({ estado: 'cancelada', actualizado: new Date().toISOString() }).eq('paypal_suscripcion', r.id);
        break;
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await db.from('licencias').update({ estado: 'suspendida', actualizado: new Date().toISOString() }).eq('paypal_suscripcion', r.id);
        break;
    }
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 });   // PayPal lo reintenta más tarde
  }
});
