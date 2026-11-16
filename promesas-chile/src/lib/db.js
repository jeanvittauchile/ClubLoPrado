/* ============================================================
   db.js — capa de datos offline-first respaldada por Supabase.

   Expone `DB` con la MISMA interfaz del prototipo (get/subscribe +
   mutaciones síncronas optimistas), de modo que los componentes
   portados funcionan sin cambios. Cada mutación:
     1) actualiza el estado local en memoria (optimista),
     2) lo persiste en caché (localStorage) para uso offline,
     3) notifica a los suscriptores (re-render),
     4) encola la escritura remota a Supabase y la sincroniza.

   Si faltan las credenciales de Supabase, funciona 100% local.
   ============================================================ */
import { supabase, hasSupabaseConfig } from './supabase.js';
import {
  PROTOCOLS, METRIC_TYPES, CAT_BY_YEAR,
  categoryFor, ageFor, levelFor, parseVolume, volumenFor, volPct, VOL_CATS, VOL_KEYS, uid,
  PRUEBAS, EVENT_KEY, GOLD_CATS, DEFAULT_GOLD_TIMES,
  parseSwimTime, goldTimeFor as _goldTimeFor, proximityPct,
  emptyState, seed, GROUPS, groupLabel, normalizeGroup, normalizeGroups,
  ACTIVIDADES, actividadOf, actividadLabel, attMap, monthAttendance,
} from './domain.js';

const cacheKey = (userId) => `pcn_cache_v1:${userId || 'local'}`;

let state = emptyState();
let userId = null;
let ready = false;
const subs = new Set();
const queue = [];          // operaciones remotas pendientes
let flushing = false;
let hydrateTimer = null;
let channel = null;

/* ---------- núcleo ---------- */
function emit() { subs.forEach(fn => fn()); }
function persistCache() {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(state)); } catch (e) { /* cuota */ }
}
function commit() { persistCache(); emit(); }

function loadCache() {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (raw) { state = normalizeGroups(JSON.parse(raw)); return true; }
  } catch (e) { /* ignore */ }
  return false;
}

/* ---------- sincronización remota ---------- */
function enqueue(op) { queue.push(op); flush(); }

async function flush() {
  if (flushing || !hasSupabaseConfig || !supabase || !userId || !navigator.onLine) return;
  flushing = true;
  try {
    while (queue.length) {
      const op = queue[0];
      const ok = await runOp(op);
      if (!ok) break;          // reintentar más tarde (online/timer)
      queue.shift();
    }
  } finally {
    flushing = false;
  }
}

/* Registra el error de Supabase. Si la sesión pertenece a una cuenta que ya
   no existe (FK owner → auth.users), se cierra la sesión para volver a entrar. */
function check(error, op) {
  if (!error) return true;
  console.warn('[sync] Supabase rechazó la operación, se reintentará:', op.type, op.table || '', error.code, error.message);
  if (error.code === '23503' && /owner_fkey/.test(error.message || '')) {
    console.warn('[sync] la sesión es de una cuenta eliminada; cerrando sesión');
    supabase.auth.signOut({ scope: 'local' });
  }
  return false;
}

async function runOp(op) {
  try {
    if (op.type === 'upsert') {
      const { error } = await supabase.from(op.table).upsert({ id: op.id, owner: userId, doc: op.doc });
      return check(error, op);
    }
    if (op.type === 'delete') {
      const { error } = await supabase.from(op.table).delete().eq('id', op.id);
      return check(error, op);
    }
    if (op.type === 'coach') {
      const { error } = await supabase.from('coach').upsert({ owner: userId, doc: op.doc });
      return check(error, op);
    }
    if (op.type === 'att-set') {
      const { error } = await supabase.from('attendance').upsert({ owner: userId, swimmer_id: op.swimmerId, day: op.day, actividad: op.act || 'natacion' });
      return check(error, op);
    }
    if (op.type === 'att-del') {
      const { error } = await supabase.from('attendance').delete().eq('swimmer_id', op.swimmerId).eq('day', op.day).eq('actividad', op.act || 'natacion');
      return check(error, op);
    }
    if (op.type === 'att-del-swimmer') {
      const { error } = await supabase.from('attendance').delete().eq('swimmer_id', op.swimmerId);
      return check(error, op);
    }
    if (op.type === 'report') {
      const { error } = await supabase.from('reports').upsert({ owner: userId, ym: op.ym, notas: op.notas, resultados: op.resultados });
      return check(error, op);
    }
    if (op.type === 'wipe') {
      for (const t of ['swimmers', 'trainings', 'evaluations', 'bajas']) {
        await supabase.from(t).delete().not('id', 'is', null);
      }
      await supabase.from('attendance').delete().not('swimmer_id', 'is', null);
      await supabase.from('reports').delete().not('ym', 'is', null);
      return true;
    }
    return true;
  } catch (e) {
    console.warn('[sync] operación falló, se reintentará:', op.type, e?.message);
    return false;
  }
}

/* ---------- hidratación desde Supabase ---------- */
async function hydrateFromCloud() {
  if (!hasSupabaseConfig || !supabase || !userId) return;
  try {
    const [sw, tr, ev, bj, att, rep, co] = await Promise.all([
      supabase.from('swimmers').select('doc'),
      supabase.from('trainings').select('doc'),
      supabase.from('evaluations').select('doc'),
      supabase.from('bajas').select('doc'),
      supabase.from('attendance').select('swimmer_id, day, actividad'),
      supabase.from('reports').select('ym, notas, resultados'),
      supabase.from('coach').select('doc').eq('owner', userId).maybeSingle(),
    ]);

    // Si alguna consulta falló (RLS, red, permisos), conservar caché local intacto.
    if ([sw, tr, ev, bj, att, rep, co].some(r => r.error)) {
      console.warn('[hydrate] errores de Supabase, se conserva el caché local');
      return;
    }

    const next = emptyState();
    next.swimmers = (sw.data || []).map(r => r.doc);
    next.trainings = (tr.data || []).map(r => r.doc);
    next.evaluations = (ev.data || []).map(r => r.doc);
    next.bajas = (bj.data || []).map(r => r.doc);

    const attendance = {};
    const attendancePF = {};
    (att.data || []).forEach(r => {
      const day = typeof r.day === 'string' ? r.day.slice(0, 10) : r.day;
      const target = r.actividad === 'fisica' ? attendancePF : attendance;
      (target[r.swimmer_id] = target[r.swimmer_id] || {})[day] = true;
    });
    next.attendance = attendance;
    next.attendancePF = attendancePF;

    const reports = {};
    (rep.data || []).forEach(r => { reports[r.ym] = { notas: r.notas || '', resultados: r.resultados || '' }; });
    next.reports = reports;

    if (co.data && co.data.doc) {
      const { goldTimes: cloudGoldTimes, ...coachData } = co.data.doc;
      next.coach = coachData;
      next.goldTimes = cloudGoldTimes || {};
    } else {
      next.coach = state.coach && state.coach.nombre ? state.coach : emptyState().coach;
      next.goldTimes = state.goldTimes || {};
      enqueue({ type: 'coach', doc: { ...next.coach, goldTimes: next.goldTimes } });
    }

    // Si la nube devuelve vacío pero tenemos datos locales, no sobreescribir.
    // Puede ocurrir cuando los datos aún no se sincronizaron (ingreso offline).
    const cloudEmpty = next.swimmers.length === 0 && next.trainings.length === 0 && next.evaluations.length === 0;
    const localHasData = state.swimmers.length > 0 || state.trainings.length > 0;
    if (cloudEmpty && localHasData) {
      flush(); // reintentar sincronizar datos locales a la nube
      return;
    }

    state = normalizeGroups(next);
    commit();
  } catch (e) {
    console.warn('[hydrate] no se pudo leer de la nube (se usa caché local):', e?.message);
  }
}

function scheduleHydrate() {
  if (hydrateTimer) clearTimeout(hydrateTimer);
  hydrateTimer = setTimeout(() => { if (queue.length === 0) hydrateFromCloud(); }, 400);
}

function subscribeRealtime() {
  if (!hasSupabaseConfig || !supabase || !userId) return;
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel(`pcn:${userId}`);
  ['swimmers', 'trainings', 'evaluations', 'bajas', 'attendance', 'reports', 'coach'].forEach(table => {
    // datos del club: cambios de cualquier entrenador; perfil (coach): sólo el propio
    const opts = { event: '*', schema: 'public', table };
    if (table === 'coach') opts.filter = `owner=eq.${userId}`;
    channel.on('postgres_changes', opts, scheduleHydrate);
  });
  channel.subscribe();
}

/* ---------- migración de datos guardados sólo en este navegador ----------
   Versiones anteriores podían funcionar en "modo local" (sin cuenta) o con
   una sesión anónima; esos datos quedaron en localStorage bajo otra clave.
   Al iniciar sesión con una cuenta real se suben a la nube (una vez confirmada
   la subida, la copia local se archiva).
   La copia original se conserva renombrada como respaldo. */
const LEGACY_DONE_PREFIX = 'pcn_legacy_migrated_v1:';

function migrateLegacyCaches() {
  // Sólo el caché del "modo local" (sin cuenta). Los cachés de otras cuentas
  // reales en este dispositivo no se tocan.
  const k = cacheKey(null); // 'pcn_cache_v1:local'
  let old = null;
  try { old = normalizeGroups(JSON.parse(localStorage.getItem(k) || 'null')); } catch (e) { old = null; }
  if (!old) return 0;

  // Todo se vuelve a enviar en cada intento (upsert = sin duplicados) hasta
  // confirmar que la nube lo recibió; sólo entonces se archiva la copia local.
  let count = 0;
  const mergeList = (key, table) => {
    (old[key] || []).forEach(item => {
      if (!item || !item.id) return;
      if (!(state[key] || []).some(x => x.id === item.id)) state[key] = [...(state[key] || []), item];
      enqueue({ type: 'upsert', table, id: item.id, doc: item });
      count++;
    });
  };
  mergeList('swimmers', 'swimmers');
  mergeList('trainings', 'trainings');
  mergeList('evaluations', 'evaluations');
  mergeList('bajas', 'bajas');

  Object.entries(old.attendance || {}).forEach(([sid, days]) => {
    Object.keys(days || {}).forEach(day => {
      if (!days[day]) return;
      if (!state.attendance[sid]) state.attendance[sid] = {};
      state.attendance[sid][day] = true;
      enqueue({ type: 'att-set', swimmerId: sid, day });
    });
  });
  Object.entries(old.reports || {}).forEach(([ym, r]) => {
    if (!r) return;
    if (!state.reports[ym]) state.reports[ym] = { notas: r.notas || '', resultados: r.resultados || '' };
    const cur = state.reports[ym];
    enqueue({ type: 'report', ym, notas: cur.notas || '', resultados: cur.resultados || '' });
  });
  if (!state.coach?.nombre && old.coach?.nombre) {
    state.coach = { ...state.coach, ...old.coach };
    enqueue({ type: 'coach', doc: { ...state.coach, goldTimes: state.goldTimes } });
  }
  commit();
  if (count) console.info(`[migración] subiendo ${count} registros guardados en este navegador`);

  // Archivar la copia local cuando la cola de subida quede vacía.
  const started = Date.now();
  const timer = setInterval(() => {
    if (queue.length === 0) {
      clearInterval(timer);
      try {
        localStorage.setItem(LEGACY_DONE_PREFIX + k, localStorage.getItem(k) || '');
        localStorage.removeItem(k);
      } catch (e) { /* ignore */ }
      console.info('[migración] datos locales subidos a la nube');
    } else if (Date.now() - started > 120000) {
      clearInterval(timer); // se reintentará en el próximo inicio de sesión
    }
  }, 1000);
  return count;
}

/* ---------- inicialización / sesión ---------- */
async function init(id) {
  userId = id || null;
  loadCache();
  emit();
  if (hasSupabaseConfig && supabase && userId && userId !== 'local') {
    await hydrateFromCloud();
    migrateLegacyCaches();
    subscribeRealtime();
    window.addEventListener('online', flush);
    flush();
  }
  ready = true;
  return state;
}

function teardown() {
  if (channel && supabase) { supabase.removeChannel(channel); channel = null; }
  window.removeEventListener('online', flush);
  userId = null;
  state = emptyState();
  queue.length = 0;
  emit();
}

/* ---------- API pública (idéntica al prototipo) ---------- */
export const DB = {
  PROTOCOLS, METRIC_TYPES, CAT_BY_YEAR, PRUEBAS, EVENT_KEY, GOLD_CATS, DEFAULT_GOLD_TIMES, GROUPS, groupLabel, normalizeGroup,
  ACTIVIDADES, actividadOf, actividadLabel, attMap, monthAttendance,
  categoryFor, ageFor, levelFor, parseVolume, volumenFor, volPct, VOL_CATS, VOL_KEYS, uid, parseSwimTime, proximityPct,
  goldTimeFor(prueba, genero, fechaNac) { return _goldTimeFor(prueba, genero, fechaNac, state.goldTimes); },
  updateGoldTime(cat, genero, key, time) {
    if (!state.goldTimes[cat]) state.goldTimes[cat] = {};
    if (!state.goldTimes[cat][genero]) state.goldTimes[cat][genero] = {};
    if (time == null) delete state.goldTimes[cat][genero][key];
    else state.goldTimes[cat][genero][key] = time;
    commit();
    enqueue({ type: 'coach', doc: { ...state.coach, goldTimes: state.goldTimes } });
  },
  resetGoldTimes(cat) {
    if (cat) delete state.goldTimes[cat];
    else state.goldTimes = {};
    commit();
    enqueue({ type: 'coach', doc: { ...state.coach, goldTimes: state.goldTimes } });
  },
  get: () => state,
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  isReady: () => ready,
  init, teardown,

  // Técnico
  updateCoach(patch) {
    state.coach = { ...state.coach, ...patch };
    commit();
    enqueue({ type: 'coach', doc: { ...state.coach, goldTimes: state.goldTimes } });
  },

  // Nadadores
  addSwimmer(data) {
    const s = { id: uid(), activo: true, justificacion: '', creado: new Date().toISOString().slice(0, 10), ...data };
    state.swimmers.push(s);
    commit();
    enqueue({ type: 'upsert', table: 'swimmers', id: s.id, doc: s });
  },
  updateSwimmer(id, patch) {
    const prev = state.swimmers.find(x => x.id === id);
    if (!prev) return;
    const s = { ...prev, ...patch };
    // nueva referencia de arreglo para que las vistas memorizadas se recalculen
    state.swimmers = state.swimmers.map(x => (x.id === id ? s : x));
    commit();
    enqueue({ type: 'upsert', table: 'swimmers', id, doc: s });
  },
  removeSwimmer(id, justificacion) {
    const s = state.swimmers.find(x => x.id === id);
    if (s) {
      const baja = { id: uid(), swimmerId: id, nombre: s.nombre, group: s.group, justificacion: justificacion || '', fecha: new Date().toISOString().slice(0, 10) };
      state.bajas.push(baja);
      state.swimmers = state.swimmers.filter(x => x.id !== id);
      delete state.attendance[id];
      if (state.attendancePF) delete state.attendancePF[id];
      commit();
      enqueue({ type: 'upsert', table: 'bajas', id: baja.id, doc: baja });
      enqueue({ type: 'delete', table: 'swimmers', id });
      enqueue({ type: 'att-del-swimmer', swimmerId: id });
    }
  },

  // Entrenamientos
  addTraining(data) {
    const t = { id: uid(), ...data };
    state.trainings.push(t);
    commit();
    enqueue({ type: 'upsert', table: 'trainings', id: t.id, doc: t });
  },
  updateTraining(id, patch) {
    const t = state.trainings.find(x => x.id === id);
    if (t) { Object.assign(t, patch); commit(); enqueue({ type: 'upsert', table: 'trainings', id, doc: t }); }
  },
  removeTraining(id) {
    state.trainings = state.trainings.filter(x => x.id !== id);
    commit();
    enqueue({ type: 'delete', table: 'trainings', id });
  },

  // Asistencia
  // act: 'natacion' (por defecto) | 'fisica'
  toggleAttendance(swimmerId, day, act = 'natacion') {
    const key = act === 'fisica' ? 'attendancePF' : 'attendance';
    // nuevas referencias para que las vistas memorizadas se recalculen
    const map = { ...(state[key] || {}) };
    const days = { ...(map[swimmerId] || {}) };
    const on = !days[day];
    if (on) days[day] = true; else delete days[day];
    map[swimmerId] = days;
    state[key] = map;
    commit();
    enqueue({ type: on ? 'att-set' : 'att-del', swimmerId, day, act });
  },
  setAttendance(swimmerId, day, val, act = 'natacion') {
    const key = act === 'fisica' ? 'attendancePF' : 'attendance';
    const map = { ...(state[key] || {}) };
    const days = { ...(map[swimmerId] || {}) };
    if (val) days[day] = true; else delete days[day];
    map[swimmerId] = days;
    state[key] = map;
    commit();
    enqueue({ type: val ? 'att-set' : 'att-del', swimmerId, day, act });
  },

  // Evaluaciones
  addEvaluation(data) {
    const e = { id: uid(), ...data };
    state.evaluations.push(e);
    commit();
    enqueue({ type: 'upsert', table: 'evaluations', id: e.id, doc: e });
  },
  updateEvaluation(id, patch) {
    const e = state.evaluations.find(x => x.id === id);
    if (e) { Object.assign(e, patch); commit(); enqueue({ type: 'upsert', table: 'evaluations', id, doc: e }); }
  },
  removeEvaluation(id) {
    state.evaluations = state.evaluations.filter(x => x.id !== id);
    commit();
    enqueue({ type: 'delete', table: 'evaluations', id });
  },

  // Informes
  setReportMeta(ym, patch) {
    if (!state.reports) state.reports = {};
    state.reports[ym] = { ...(state.reports[ym] || { notas: '', resultados: '' }), ...patch };
    commit();
    const r = state.reports[ym];
    enqueue({ type: 'report', ym, notas: r.notas || '', resultados: r.resultados || '' });
  },

  // Datos
  async loadDemoData() {
    const data = seed();
    state = data;
    commit();
    enqueue({ type: 'wipe' });
    enqueue({ type: 'coach', doc: data.coach });
    data.swimmers.forEach(s => enqueue({ type: 'upsert', table: 'swimmers', id: s.id, doc: s }));
    data.trainings.forEach(t => enqueue({ type: 'upsert', table: 'trainings', id: t.id, doc: t }));
    data.evaluations.forEach(e => enqueue({ type: 'upsert', table: 'evaluations', id: e.id, doc: e }));
    Object.entries(data.attendance).forEach(([sid, days]) => {
      Object.keys(days).forEach(day => { if (days[day]) enqueue({ type: 'att-set', swimmerId: sid, day }); });
    });
  },
  resetAll() {
    const blank = emptyState();
    blank.coach = state.coach;     // conserva el perfil del técnico
    state = blank;
    commit();
    enqueue({ type: 'wipe' });
  },
};

export default DB;
