// Panel del administrador: ver los clientes y sumar meses pagados por Bizum.
// Secreto (Supabase → Edge Functions → Secrets): ADMIN_CLAVE = la clave que escribes en «Clientes de MarmoLab».
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const respuesta = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// comparación que tarda lo mismo acierte o no
function iguales(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let p;
  try { p = await req.json(); } catch { return respuesta({ error: 'Petición no válida' }, 400); }
  const clave = Deno.env.get('ADMIN_CLAVE') || '';
  if (!clave || !iguales(String(p.clave || ''), clave)) {
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
      .update({ estado: 'activa', metodo: 'bizum', activa_hasta: desde.toISOString(), actualizado: new Date().toISOString() })
      .eq('user_id', fila.user_id);
    if (e2) return respuesta({ error: e2.message }, 500);
    return respuesta({ ok: true, activa_hasta: desde.toISOString() });
  }

  return respuesta({ error: 'Acción desconocida' }, 400);
});
