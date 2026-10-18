// MarmoPro · Webhook de Stripe → tabla licencias
// Despliegue: supabase functions deploy stripe-webhook --no-verify-jwt
// Secretos:   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase)
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// versión fija de la API (en ella la suscripción trae current_period_end)
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cripto = Stripe.createSubtleCryptoProvider();

const fecha = (segundos: number) => new Date(segundos * 1000).toISOString();
const estadoDe = (s: Stripe.Subscription) =>
  s.status === 'active' || s.status === 'trialing' ? (s.cancel_at_period_end ? 'cancelada' : 'activa')
    : s.status === 'past_due' || s.status === 'unpaid' ? 'impagada' : 'cancelada';

async function guardarSuscripcion(s: Stripe.Subscription, userId?: string) {
  const cambios = {
    estado: estadoDe(s),
    // impagada: unos días de margen mientras Stripe reintenta el cobro
    activa_hasta: fecha(s.status === 'past_due' ? s.current_period_end + 3 * 86400 : s.current_period_end),
    stripe_cliente: String(s.customer),
    stripe_suscripcion: s.id,
    actualizado: new Date().toISOString(),
  };
  const filtro = userId ? { user_id: userId } : { stripe_cliente: String(s.customer) };
  const { error } = await db.from('licencias').update(cambios).match(filtro);
  if (error) throw error;
}

Deno.serve(async (req) => {
  const firma = req.headers.get('stripe-signature');
  const cuerpo = await req.text();
  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(cuerpo, firma!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, cripto);
  } catch (e) {
    return new Response(`Firma no válida: ${(e as Error).message}`, { status: 400 });
  }
  try {
    switch (evento.type) {
      case 'checkout.session.completed': {
        // el enlace de pago lleva client_reference_id = id de la cuenta de MarmoPro
        const sesion = evento.data.object as Stripe.Checkout.Session;
        if (sesion.subscription && sesion.client_reference_id) {
          const s = await stripe.subscriptions.retrieve(String(sesion.subscription));
          await guardarSuscripcion(s, sesion.client_reference_id);
        }
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const factura = evento.data.object as Stripe.Invoice;
        if (factura.subscription) await guardarSuscripcion(await stripe.subscriptions.retrieve(String(factura.subscription)));
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // se vuelve a pedir con la versión fija de la API
        await guardarSuscripcion(await stripe.subscriptions.retrieve((evento.data.object as Stripe.Subscription).id));
        break;
    }
    return new Response('ok');
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }
});
