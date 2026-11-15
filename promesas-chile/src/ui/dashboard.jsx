import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DB } from '../lib/db.js';
import {
  Icon, Avatar, avatarColor, getInitials,
  useStore, useToast, Button, Modal, Field, Empty, Confirm,
  MONTHS, WD_SHORT, fmtDate, fmtDateLong, todayISO, fmtTime, parseTime, TR_TYPE_COLOR,
} from './components.jsx';


/* ============================================================
   dashboard.jsx — Inicio
   ============================================================ */
function Dashboard({ go }) {
  const st = useStore();
  const today = todayISO();
  const ym = today.slice(0, 7);

  const nadadores = st.swimmers.slice();
  const g1 = st.swimmers.filter(s => s.group === 'G1');
  const g2 = st.swimmers.filter(s => s.group === 'G2');
  const todayTrainings = st.trainings.filter(t => t.fecha === today).sort((a, b) => a.titulo.localeCompare(b.titulo));

  // asistencia de hoy: sólo los grupos que entrenan hoy (sin entrenamiento → todos)
  const isPresentIn = (s, act) => { const m = DB.attMap(st, act); return !!(m[s.id] && m[s.id][today]); };
  const isPresent = (s) => isPresentIn(s, 'natacion') || isPresentIn(s, 'fisica');
  const groupsToday = new Set(todayTrainings.map(t => t.grupo));
  const allToday = groupsToday.size === 0 || groupsToday.has('TODOS');
  const todayList = nadadores
    .filter(s => allToday || groupsToday.has(s.group) || isPresent(s))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const todayLabel = groupsToday.size === 0
    ? 'Sin entrenamiento hoy · todos los nadadores'
    : allToday ? 'Entrenan todos los grupos'
    : `Entrena hoy: ${[...groupsToday].sort().map(g => DB.groupLabel(g)).join(' y ')}`;
  const presentToday = todayList.filter(isPresent).length;

  // tasa de asistencia del mes por actividad
  const statsN = DB.monthAttendance(st, nadadores, ym, 'natacion');
  const statsF = DB.monthAttendance(st, nadadores, ym, 'fisica');
  const presN = todayList.filter(s => isPresentIn(s, 'natacion')).length;
  const presF = todayList.filter(s => isPresentIn(s, 'fisica')).length;

  const monthEvals = st.evaluations.filter(e => e.fecha.startsWith(ym));
  const recentEvals = st.evaluations.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);
  const upcoming = st.trainings.filter(t => t.fecha > today).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 3);

  const proto = (id) => DB.PROTOCOLS.find(p => p.id === id);
  const mm = (m) => DB.METRIC_TYPES[m];

  const stats = [
    { label: 'Nadadores', value: nadadores.length, icon: 'users', bg: 'var(--cyan-050)', fg: 'var(--cyan-700)', sub: `${g1.length} Grupo 1 · ${g2.length} Grupo 2` },
    { label: 'Asistencia del mes · Natación', value: statsN.pct + '%', icon: 'wave', bg: 'var(--green-bg)', fg: 'var(--green)', sub: `${statsN.present} asistencias` },
    { label: 'Asistencia del mes · P. física', value: statsF.pct + '%', icon: 'trend', bg: '#efeafb', fg: '#7B5BD6', sub: `${statsF.present} asistencias` },
    { label: 'Presentes hoy', value: `${presentToday}/${todayList.length}`, icon: 'checkSquare', bg: 'var(--amber-bg)', fg: 'var(--amber)', sub: `Natación ${presN} · P. física ${presF}` },
  ];

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 22 }}>
        {stats.map((s, i) => (
          <div className="stat" key={i}>
            <div className="label"><span className="ico" style={{ background: s.bg, color: s.fg }}><Icon name={s.icon} style={{ width: 16, height: 16 }} /></span>{s.label}</div>
            <div className="value">{s.value}</div>
            <div className="delta" style={{ color: 'var(--slate-400)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 22, alignItems: 'start' }} className="dash-grid">
        {/* Today's training */}
        <div>
          <div className="card">
            <div className="card-head">
              <div className="ico"><Icon name="calendar" /></div>
              <div style={{ flex: 1 }}><h3>Entrenamiento de hoy</h3><div style={{ fontSize: 12.5, color: 'var(--slate-500)' }}>{fmtDateLong(today)}</div></div>
              <Button variant="ghost" size="sm" onClick={() => go('trainings')}>Ver calendario</Button>
            </div>
            <div className="card-pad">
              {todayTrainings.length === 0 ? (
                <Empty icon="calendar" title="Sin entrenamiento hoy" action={<Button size="sm" icon="plus" onClick={() => go('trainings')}>Programar</Button>}>No hay sesión programada para hoy.</Empty>
              ) : todayTrainings.map(t => (
                <div key={t.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span className={`badge ${DB.actividadOf(t) === 'fisica' ? 'badge-navy' : 'badge-cyan'}`}>{DB.actividadLabel(DB.actividadOf(t))}</span>
                    <span className={`badge badge-${TR_TYPE_COLOR[t.tipo] || 'cyan'}`}>{t.tipo}</span>
                    <span className="badge badge-slate">{DB.groupLabel(t.grupo)}</span>
                    <span className="badge badge-slate">{t.duracion} min</span>
                  </div>
                  <h3 style={{ fontSize: 17, marginBottom: 10 }}>{t.titulo}</h3>
                  {t.contenido && <pre style={{ margin: 0, padding: '14px 16px', background: 'var(--surface-2)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.7, color: 'var(--slate-700)', whiteSpace: 'pre-wrap' }}>{t.contenido}</pre>}
                </div>
              ))}
            </div>
          </div>

          {/* Quick attendance */}
          <div className="card" style={{ marginTop: 22 }}>
            <div className="card-head">
              <div className="ico"><Icon name="checkSquare" /></div>
              <div style={{ flex: 1 }}><h3>Asistencia de hoy</h3><div style={{ fontSize: 12.5, color: 'var(--slate-500)' }}>{todayLabel} — marca natación, preparación física o ambas</div></div>
              <Button variant="ghost" size="sm" onClick={() => go('attendance')}>Panel mensual</Button>
            </div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todayList.map(s => {
                const on = isPresent(s);
                return (
                  <div key={s.id} className="quick-att" data-on={!!on} style={{ cursor: 'default' }}>
                    <Avatar name={s.nombre} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{s.nombre}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--slate-400)' }}>{DB.categoryFor(s.fechaNacimiento)} · {DB.groupLabel(s.group)}</div>
                    </div>
                    {DB.ACTIVIDADES.map(a => {
                      const onA = isPresentIn(s, a.id);
                      return (
                        <button key={a.id} type="button" onClick={() => DB.toggleAttendance(s.id, today, a.id)}
                          title={`${a.label}: ${onA ? 'presente' : 'ausente'}`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>
                          <span className={`att-box ${onA ? 'on' : ''}`}>{onA && <Icon name="check" />}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate-400)', whiteSpace: 'nowrap' }}>{a.short}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card">
            <div className="card-head"><div className="ico"><Icon name="award" /></div><h3>Evaluaciones recientes</h3></div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentEvals.length === 0 ? <Empty icon="award" title="Sin evaluaciones" /> : recentEvals.map(e => {
                const p = proto(e.protocolo); const m = mm(e.metrica);
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span className="mp-ico" style={{ background: m.color + '1a', color: m.color, width: 36, height: 36, flex: '0 0 36px' }}><Icon name={m.icon === 'timer' ? 'timer' : m.icon === 'arm' ? 'arm' : 'wave'} style={{ width: 18, height: 18 }} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{m.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>{p.nombre} · {e.swimmerIds.length} nad.</div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--slate-400)', fontWeight: 600 }}>{fmtDate(e.fecha)}</span>
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" icon="plus" onClick={() => go('evaluations')} className="no-print" style={{ marginTop: 4 }}>Nueva evaluación</Button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="ico"><Icon name="clock" /></div><h3>Próximos entrenamientos</h3></div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.length === 0 ? <Empty icon="calendar" title="Nada programado" /> : upcoming.map(t => {
                const d = new Date(t.fecha + 'T00:00:00');
                const valid = !isNaN(d.getTime());
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ textAlign: 'center', flex: '0 0 44px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '6px 0' }}>
                      <div style={{ fontSize: 16, fontFamily: 'var(--font-head)', fontWeight: 700, lineHeight: 1, color: 'var(--navy)' }}>{valid ? d.getDate() : '—'}</div>
                      <div style={{ fontSize: 9.5, color: 'var(--slate-400)', textTransform: 'uppercase' }}>{valid ? MONTHS[d.getMonth()].slice(0, 3) : ''}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{t.titulo}</div>
                      <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>{t.tipo} · {t.duracion} min</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Dashboard };
