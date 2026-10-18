-- MarmoLab · tablas de Supabase (pegar en SQL Editor → New query → Run)

-- 1) Datos de cada empresa (trabajos, documentos, clientes…). Cada cuenta solo ve los suyos.
create table if not exists public.datos (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  coleccion text not null,
  id text not null,
  valor jsonb,
  modificado bigint not null default 0,
  borrado boolean not null default false,
  actualizado timestamptz not null default now(),
  primary key (user_id, coleccion, id)
);
alter table public.datos enable row level security;
drop policy if exists "cada uno sus datos" on public.datos;
create policy "cada uno sus datos" on public.datos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.tocar_actualizado() returns trigger language plpgsql as $$
begin new.actualizado = now(); return new; end $$;
drop trigger if exists datos_actualizado on public.datos;
create trigger datos_actualizado before insert or update on public.datos for each row execute function public.tocar_actualizado();

-- 2) Licencias: hasta cuándo tiene pagado cada cuenta. El cliente solo puede LEER la suya;
--    la escriben PayPal (función paypal-webhook) y tú desde la app (función admin-licencias, para Bizum).
create table if not exists public.licencias (
  user_id uuid primary key references auth.users on delete cascade,
  email text,
  estado text not null default 'pendiente',       -- pendiente | activa | cancelada | suspendida | admin
  activa_hasta timestamptz not null,
  metodo text,                                    -- paypal | bizum
  paypal_suscripcion text,
  actualizado timestamptz not null default now()
);
alter table public.licencias enable row level security;
drop policy if exists "ver mi licencia" on public.licencias;
create policy "ver mi licencia" on public.licencias for select using (auth.uid() = user_id);

-- 3) Al crear una cuenta queda pendiente de pago (sin días gratis): entra al pagar el primer mes
create or replace function public.licencia_de_prueba() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.licencias (user_id, email, estado, activa_hasta)
  values (new.id, new.email, 'pendiente', now())
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists al_crear_cuenta on auth.users;
create trigger al_crear_cuenta after insert on auth.users for each row execute function public.licencia_de_prueba();

-- (Opcional) Dar acceso gratis a alguien a mano:
-- update public.licencias set estado = 'activa', activa_hasta = now() + interval '1 year' where email = 'cliente@correo.es';
