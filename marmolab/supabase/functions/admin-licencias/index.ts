// Panel del administrador: ver los clientes y sumar meses pagados a mano (Bizum o PayPal.me).
// La clave es la misma contraseña de administrador de la app: se comprueba con su huella (PBKDF2, la de config.js).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const respuesta = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Huella de la contraseña de administrador (la misma que `admin` en config.js; no es la contraseña)
const ADMIN = { sal: 'f9487cfb5c9dc8366572385dde1eaf67', huella: '4e3109362eb33862958e3ac45d0bc176d2386ac7ebcb5accbafba4fd3056d12d', vueltas: 200000 };
async function claveBuena(clave: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const sal = new Uint8Array(ADMIN.sal.match(/../g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ADMIN.vueltas }, k, 256);
  const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  let d = 0;   // comparación que tarda lo mismo acierte o no
  for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ ADMIN.huella.charCodeAt(i);
  return d === 0 && hex.length === ADMIN.huella.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let p;
  try { p = await req.json(); } catch { return respuesta({ error: 'Petición no válida' }, 400); }
  if (!p.clave || !(await claveBuena(String(p.clave)))) {
    await new Promise((r) => setTimeout(r, 800));
    return respuesta({ error: 'Clave de administrador incorrecta' }, 401);
  }

  if (p.accion === 'listar') {
    const { data, error } = await db.from('licencias').select('email, estado, activa_hasta, metodo').order('activa_hasta', { ascending: true });
    if (error) return respuesta({ error: error.message }, 500);
    return respuesta({ clientes: data });
  }

  if (p.accion === 'sumar') {
    const meses = Math.max(1, Math.min(24, Number(p.meses) || 1));
    const { data: fila, error } = await db.from('licencias').select('user_id, activa_hasta').eq('email', String(p.email || '')).maybeSingle();
    if (error) return respuesta({ error: error.message }, 500);
    if (!fila) return respuesta({ error: 'No hay ninguna cuenta con ese correo' }, 404);
    // se suma desde hoy o desde lo que ya tenía pagado, lo que sea más tarde
    const desde = new Date(Math.max(Date.now(), new Date(fila.activa_hasta).getTime()));
    desde.setMonth(desde.getMonth() + meses);
    const { error: e2 } = await db.from('licencias')
      .update({ estado: 'activa', metodo: 'manual', activa_hasta: desde.toISOString(), actualizado: new Date().toISOString() })
      .eq('user_id', fila.user_id);
    if (e2) return respuesta({ error: e2.message }, 500);
    return respuesta({ ok: true, activa_hasta: desde.toISOString() });
  }

  return respuesta({ error: 'Acción desconocida' }, 400);
});
