import React, { useState, useMemo } from 'react';
import { DB } from '../lib/db.js';
import {
  Icon, Avatar, useStore, useToast, Button, Empty,
  MONTHS, WD_SHORT, todayISO,
} from './components.jsx';


/* ============================================================
   attendance.jsx — Panel de asistencia mensual
   Natación y preparación física se registran por separado.
   ============================================================ */
function AttendanceView() {
  const st = useStore();
  const toast = useToast();
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const [group, setGroup] = useState('G1');
  const [act, setAct] = useState('natacion');

  const [yy, mm] = ym.split('-').map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const todayStr = todayISO();

  const swimmers = useMemo(() =>
    st.swimmers.filter(s => s.group === group).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [st.swimmers, group]);

  // Días con entrenamiento programado de la actividad elegida (columnas resaltadas)
  const trainingDays = useMemo(() => {
    const set = new Set();
    st.trainings.forEach(t => {
      if (t.fecha.startsWith(ym) && DB.actividadOf(t) === act) set.add(parseInt(t.fecha.slice(8), 10));
    });
    return set;
  }, [st.trainings, ym, act]);

  const shiftMonth = (d) => {
    const dt = new Date(yy, mm - 1 + d, 1);
    setYm(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };

  const map = DB.attMap(st, act);
  const cellKey = (day) => `${ym}-${String(day).padStart(2, '0')}`;
  const isPresent = (sid, day) => !!(map[sid] && map[sid][cellKey(day)]);

  const swimmerTotal = (sid) => days.reduce((n, d) => n + (isPresent(sid, d) ? 1 : 0), 0);
  const dayTotal = (day) => swimmers.reduce((n, s) => n + (isPresent(s.id, day) ? 1 : 0), 0);

  // Estadística del grupo para ambas actividades
  const statsN = DB.monthAttendance(st, swimmers, ym, 'natacion');
  const statsF = DB.monthAttendance(st, swimmers, ym, 'fisica');
  const cur = act === 'fisica' ? statsF : statsN;
  const actLabel = DB.actividadLabel(act);

  const markColumn = (day, val) => {
    swimmers.forEach(s => DB.setAttendance(s.id, cellKey(day), val, act));
    toast(val ? `Día ${day} marcado presente · ${actLabel}` : `Día ${day} desmarcado · ${actLabel}`);
  };

  const statCard = (label, value, icon, bg, fg, sub) => (
    <div className="stat">
      <div className="label"><span className="ico" style={{ background: bg, color: fg }}><Icon name={icon} style={{ width: 16, height: 16 }} /></span>{label}</div>
      <div className="value">{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="toolbar">
        <div className="tabs">
          <button className={`tab ${group === 'G1' ? 'active' : ''}`} onClick={() => setGroup('G1')}>Grupo 1</button>
          <button className={`tab ${group === 'G2' ? 'active' : ''}`} onClick={() => setGroup('G2')}>Grupo 2</button>
        </div>
        <div className="tabs">
          {DB.ACTIVIDADES.map(a => (
            <button key={a.id} className={`tab ${act === a.id ? 'active' : ''}`} onClick={() => setAct(a.id)}>{a.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 4 }}>
          <button className="btn-icon" onClick={() => shiftMonth(-1)}><Icon name="chevL" /></button>
          <div style={{ minWidth: 156, textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-head)', fontSize: 14.5 }}>{MONTHS[mm - 1]} {yy}</div>
          <button className="btn-icon" onClick={() => shiftMonth(1)}><Icon name="chevR" /></button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setYm(todayISO().slice(0, 7))}>Hoy</Button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {statCard(`Asistencias · ${actLabel}`, cur.present, 'checkSquare', 'var(--cyan-050)', 'var(--cyan-700)', `${cur.activeDays.length} días con actividad`)}
        {statCard('Tasa · Natación', <>{statsN.pct}<span style={{ fontSize: 20, color: 'var(--slate-400)' }}>%</span></>, 'wave', 'var(--green-bg)', 'var(--green)', `${statsN.present} de ${statsN.possible} posibles`)}
        {statCard('Tasa · Prep. física', <>{statsF.pct}<span style={{ fontSize: 20, color: 'var(--slate-400)' }}>%</span></>, 'trend', '#efeafb', '#7B5BD6', `${statsF.present} de ${statsF.possible} posibles`)}
        {statCard('Días con entrenamiento', trainingDays.size, 'calendar', 'var(--amber-bg)', 'var(--amber)', `programados · ${actLabel}`)}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="ico"><Icon name="checkSquare" /></div>
          <div style={{ flex: 1 }}>
            <h3>Asistencia diaria · {actLabel} · {DB.groupLabel(group)}</h3>
            <div style={{ fontSize: 12.5, color: 'var(--slate-500)' }}>Marca cada día. Las columnas turquesa tienen entrenamiento de {actLabel.toLowerCase()} programado. Cambia de actividad con las pestañas de arriba.</div>
          </div>
        </div>
        {swimmers.length === 0 ? (
          <Empty icon="users" title="Sin nadadores en este grupo" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="att-tbl">
              <thead>
                <tr>
                  <th className="att-name-col">Nadador</th>
                  {days.map(d => {
                    const dt = new Date(yy, mm - 1, d);
                    const isToday = cellKey(d) === todayStr;
                    const isTr = trainingDays.has(d);
                    return (
                      <th key={d} className={`att-day ${isTr ? 'is-training' : ''} ${isToday ? 'is-today' : ''}`} title={isTr ? 'Entrenamiento programado · clic para marcar a todos' : 'Clic para marcar a todos'}
                        onClick={() => markColumn(d, dayTotal(d) < swimmers.length)}>
                        <span className="wd">{WD_SHORT[dt.getDay()][0]}</span>
                        <span className="dd">{d}</span>
                      </th>
                    );
                  })}
                  <th className="att-total-col">Total</th>
                </tr>
              </thead>
              <tbody>
                {swimmers.map(s => {
                  const tot = swimmerTotal(s.id);
                  return (
                    <tr key={s.id}>
                      <td className="att-name-col">
                        <div className="name-cell">
                          <Avatar name={s.nombre} size={30} />
                          <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13.5, whiteSpace: 'nowrap' }}>{s.nombre.split(' ').slice(0, 2).join(' ')}</div>
                        </div>
                      </td>
                      {days.map(d => {
                        const on = isPresent(s.id, d);
                        const isToday = cellKey(d) === todayStr;
                        return (
                          <td key={d} className={`att-cell ${isToday ? 'is-today' : ''}`}>
                            <button className={`att-box ${on ? 'on' : ''}`} onClick={() => DB.toggleAttendance(s.id, cellKey(d), act)} aria-label={`Día ${d} · ${actLabel}`}>
                              {on && <Icon name="check" />}
                            </button>
                          </td>
                        );
                      })}
                      <td className="att-total-col"><span className="badge badge-navy">{tot}</span></td>
                    </tr>
                  );
                })}
                <tr className="att-foot-row">
                  <td className="att-name-col" style={{ fontWeight: 700, color: 'var(--slate-500)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>Por día</td>
                  {days.map(d => <td key={d} className="att-cell" style={{ fontWeight: 700, color: 'var(--slate-500)', fontSize: 12.5 }}>{dayTotal(d) || ''}</td>)}
                  <td className="att-total-col" style={{ fontWeight: 800, color: 'var(--navy)' }}>{swimmers.reduce((n, s) => n + swimmerTotal(s.id), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--slate-400)', marginTop: 14, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--cyan)', display: 'inline-block' }} /> Presente</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid var(--line)', display: 'inline-block' }} /> Ausente</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--cyan-050)', border: '1px solid var(--cyan-100)', display: 'inline-block' }} /> Día con entrenamiento de {actLabel.toLowerCase()}</span>
      </p>
    </div>
  );
}

export { AttendanceView };
