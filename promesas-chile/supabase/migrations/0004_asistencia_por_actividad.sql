-- ============================================================
-- Club Natación Lo Prado — asistencia por actividad
--
-- Cada asistencia indica la actividad: 'natacion' o 'fisica'
-- (preparación física). Un nadador puede asistir a una, a otra o a
-- ambas el mismo día. Las asistencias existentes quedan como natación.
-- ============================================================
alter table public.attendance
  add column if not exists actividad text not null default 'natacion';

alter table public.attendance drop constraint if exists attendance_actividad_check;
alter table public.attendance
  add constraint attendance_actividad_check check (actividad in ('natacion', 'fisica'));

alter table public.attendance drop constraint if exists attendance_pkey;
alter table public.attendance add primary key (swimmer_id, day, actividad);
