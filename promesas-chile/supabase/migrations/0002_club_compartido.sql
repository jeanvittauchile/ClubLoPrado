-- ============================================================
-- Club Natación Lo Prado — datos compartidos entre entrenadores
--
-- Antes: cada usuario veía sólo sus propias filas (owner = auth.uid()).
-- Ahora: todos los miembros del club (tabla club_members) ven y editan
-- los mismos nadadores, entrenamientos, asistencia, evaluaciones,
-- bajas e informes. El perfil del técnico (tabla coach) sigue siendo
-- personal de cada usuario.
--
-- La columna owner se mantiene como "último usuario que guardó".
-- ============================================================

-- ---------- Miembros autorizados ----------
create table if not exists public.club_members (
  email      text primary key,
  nombre     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.club_members enable row level security;

-- ¿El usuario de la sesión es miembro del club? (no anónimo + correo en la lista)
create or replace function public.is_club_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (
       select 1 from public.club_members m
       where lower(m.email) = lower(auth.jwt() ->> 'email')
     );
$$;

-- Los miembros pueden ver la lista; se agregan desde el panel de Supabase.
drop policy if exists club_members_read on public.club_members;
create policy club_members_read on public.club_members
  for select to authenticated
  using (public.is_club_member());

-- ---------- Claves primarias compartidas ----------
-- Asistencia: una fila por nadador y día (ya no por usuario).
delete from public.attendance a
  using public.attendance b
  where a.swimmer_id = b.swimmer_id and a.day = b.day and a.ctid < b.ctid;
alter table public.attendance drop constraint if exists attendance_pkey;
alter table public.attendance add primary key (swimmer_id, day);

-- Informes: uno por mes (ya no por usuario).
delete from public.reports a
  using public.reports b
  where a.ym = b.ym and a.ctid < b.ctid;
alter table public.reports drop constraint if exists reports_pkey;
alter table public.reports add primary key (ym);

-- ---------- Políticas: miembros del club ----------
do $$
declare t text;
begin
  foreach t in array array['swimmers','trainings','evaluations','bajas','attendance','reports']
  loop
    execute format('drop policy if exists %I_owner_all on public.%I;', t, t);
    execute format('drop policy if exists %I_club_all on public.%I;', t, t);
    execute format($f$
      create policy %I_club_all on public.%I
        for all to authenticated
        using (public.is_club_member())
        with check (public.is_club_member());
    $f$, t, t);
  end loop;
end$$;

-- Perfil del técnico: personal, pero sólo para miembros.
drop policy if exists coach_owner_all on public.coach;
create policy coach_owner_all on public.coach
  for all to authenticated
  using (owner = auth.uid() and public.is_club_member())
  with check (owner = auth.uid() and public.is_club_member());

-- ============================================================
-- Agregar entrenadores (ejecutar una vez por persona, con su correo):
--
--   insert into public.club_members (email, nombre)
--   values ('correo@ejemplo.com', 'Nombre Apellido');
-- ============================================================
