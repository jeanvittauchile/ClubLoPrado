-- ============================================================
-- Club Natación Lo Prado — no borrar datos del club al eliminar una cuenta
--
-- Con datos compartidos, "owner" sólo indica quién guardó por última vez.
-- Antes: on delete cascade → al eliminar la cuenta de un entrenador se
-- borraban todos los registros que había guardado.
-- Ahora: on delete set null → los registros se conservan.
-- (La tabla coach —perfil personal— mantiene el borrado en cascada.)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['swimmers','trainings','evaluations','bajas','attendance','reports']
  loop
    execute format('alter table public.%I alter column owner drop not null;', t);
    execute format('alter table public.%I drop constraint if exists %I;', t, t || '_owner_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (owner) references auth.users(id) on delete set null;',
      t, t || '_owner_fkey');
  end loop;
end$$;
