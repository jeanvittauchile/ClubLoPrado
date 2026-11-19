import React, { useState, useMemo } from 'react';
import { DB } from '../lib/db.js';
import {
  Icon, Avatar, useStore, useToast, Button, Empty,
  MONTHS, WD_SHORT, todayISO,
} from './components.jsx';


/* ============================================================
   attendance.jsx — Panel de asistencia mensual
   Natación y preparación física en la misma grilla: cada nadador
   tiene una fila por actividad.
   ============================================================ */
const ACT_UI = {
  natacion: { short: 'Natación', tag: 'att-act att-act-nat', box: '', trCell: 'tr-nat' },
  fisica: { short: 'P. física', tag: 'att-act att-act-pf', box: 'pf', trCell: 'tr-pf' },
};

function AttendanceView() {
  const st = useStore();
  const toast = useToast();
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const [group, setGroup] = useState('G1');

  const [yy, mm] = ym.split('-').map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const todayStr = todayISO();

  const swimmers = useMemo(() =>
    st.swimmers.filter(s => s.group === group).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [st.swimmers, group]);

  // Días con entrenamiento programado, por actividad
  const trainingDays = useMemo(() => {
    const res = { natacion: new Set(), fisica: new Set() };
    st.trainings.forEach(t => {
      if (t.fecha.startsWith(ym)) res[DB.actividadOf(t)]?.add(parseInt(t.fecha.slice(8), 10));
    });
    return res;
  }, [st.trainings, ym]);

  const shiftMonth = (d) => {
    const dt = new Date(yy, mm - 1 + d, 1);
    setYm(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };

  const cellKey = (day) => `${ym}-${String(day).padStart(2, '0')}`;
  const isPresent = (act, sid, day) => { const m = DB.attMap(st, act); return !!(m[sid] && m[sid][cellKey(day)]); };
  const swimmerTotal = (act, sid) => days.reduce((n, d) => n + (isPresent(act, sid, d) ? 1 : 0), 0);
  const dayTotal = (act, day) => swimmers.reduce((n, s) => n + (isPresent(act, s.id, day) ? 1 : 0), 0);
  const grandTotal = (act) => swimmers.reduce((n, s) => n + swimmerTotal(act, s.id), 0);

  const statsN = DB.monthAttendance(st, swimmers, ym, 'natacion');
  const statsF = DB.monthAttendance(st, swimmers, ym, 'fisica');

  const markColumn = (act, day) => {
    const val = dayTotal(act, day) < swimmers.length;
    swimmers.forEach(s => DB.setAttendance(s.id, cellKey(day), val, act));
    toast(`${ACT_UI[act].short} · día ${day} ${val ? 'marcado presente para todos' : 'desmarcado'}`);
  };

  const statCard = (label, value, icon, bg, fg, sub) => (
    <div className="stat">
      <div className="label"><span className="ico" style={{ background: bg, color: fg }}><Icon name={icon} style={{ width: 16, height: 16 }} /></span>{label}</div>
      <div className="value">{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const pctValue = (p) => <>{p}<span style={{ fontSize: 20, color: 'var(--slate-400)' }}>%</span></>;

  return (
    <div>
      <div className="toolbar">
        <div className="tabs">
          <button className={`tab ${group === 'G1' ? 'active' : ''}`} onClick={() => setGroup('G1')}>Grupo 1</button>
          <button className={`tab ${group === 'G2' ? 'active' : ''}`} onClick={() => setGroup('G2')}>Grupo 2</button>
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
        {statCard('Tasa · Natación', pctValue(statsN.pct), 'wave', 'var(--cyan-050)', 'var(--cyan-700)', `${statsN.present} de ${statsN.possible} posibles`)}
        {statCard('Tasa · Prep. física', pctValue(statsF.pct), 'trend', '#efeafb', '#7B5BD6', `${statsF.present} de ${statsF.possible} posibles`)}
        {statCard('Asistencias del mes', statsN.present + statsF.present, 'checkSquare', 'var(--green-bg)', 'var(--green)', `Natación ${statsN.present} · P. física ${statsF.present}`)}
        {statCard('Días con entrenamiento', new Set([...trainingDays.natacion, ...trainingDays.fisica]).size, 'calendar', 'var(--amber-bg)', 'var(--amber)', `Natación ${trainingDays.natacion.size} · P. física ${trainingDays.fisica.size}`)}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="ico"><Icon name="checkSquare" /></div>
          <div style={{ flex: 1 }}>
            <h3>Asistencia diaria · {DB.groupLabel(group)}</h3>
            <div style={{ fontSize: 12.5, color: 'var(--slate-500)' }}>Cada nadador tiene una fila de natación y otra de preparación física. Para marcar a todos en un día, toca el total de ese día abajo.</div>
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
                    const trN = trainingDays.natacion.has(d);
                    const trF = trainingDays.fisica.has(d);
                    const title = trN && trF ? 'Natación y preparación física programadas'
                      : trN ? 'Natación programada' : trF ? 'Preparación física programada' : '';
                    return (
                      <th key={d} className={`att-day ${trN || trF ? 'is-training' : ''} ${isToday ? 'is-today' : ''}`} style={{ cursor: 'default' }} title={title}>
                        <span className="wd">{WD_SHORT[dt.getDay()][0]}</span>
                        <span className="dd">{d}</span>
                      </th>
                    );
                  })}
                  <th className="att-total-col">Total</th>
                </tr>
              </thead>
              <tbody>
                {swimmers.map(s => DB.ACTIVIDADES.map((a, idx) => {
                  const ui = ACT_UI[a.id];
                  return (
                    <tr key={`${s.id}-${a.id}`} className={idx === 0 ? 'att-row-nat' : 'att-row-pf'}>
                      <td className="att-name-col">
                        {idx === 0 ? (
                          <div className="name-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <Avatar name={s.nombre} size={30} />
                              <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13.5, whiteSpace: 'nowrap' }}>{s.nombre.split(' ').slice(0, 2).join(' ')}</div>
                            </div>
                            <span className={ui.tag}>{ui.short}</span>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'right' }}><span className={ui.tag}>{ui.short}</span></div>
                        )}
                      </td>
                      {days.map(d => {
                        const on = isPresent(a.id, s.id, d);
                        const isToday = cellKey(d) === todayStr;
                        const isTr = trainingDays[a.id].has(d);
                        const off = !DB.isScheduled(group, a.id, cellKey(d));
                        return (
                          <td key={d} className={`att-cell ${isTr && !off ? ui.trCell : ''} ${off ? 'off-sched' : ''} ${isToday ? 'is-today' : ''}`}>
                            <button className={`att-box ${ui.box} ${on ? 'on' : ''}`} onClick={() => DB.toggleAttendance(s.id, cellKey(d), a.id)} aria-label={`${a.label} · día ${d}`} title={`${a.label} · día ${d}`}>
                              {on && <Icon name="check" />}
                            </button>
                          </td>
                        );
                      })}
                      <td className="att-total-col"><span className={`badge ${a.id === 'fisica' ? 'badge-navy' : 'badge-cyan'}`}>{swimmerTotal(a.id, s.id)}</span></td>
                    </tr>
                  );
                }))}
                {DB.ACTIVIDADES.map((a, idx) => (
                  <tr key={`foot-${a.id}`} className="att-foot-row">
                    <td className="att-name-col" style={{ fontWeight: 700, color: 'var(--slate-500)', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>{idx === 0 ? 'Por día' : ''}</span>
                        <span className={ACT_UI[a.id].tag}>{ACT_UI[a.id].short}</span>
                      </div>
                    </td>
                    {days.map(d => (
                      <td key={d} className="att-cell clickable" style={{ fontWeight: 700, color: 'var(--slate-500)', fontSize: 12.5 }}
                        title={`Clic para marcar / desmarcar a todos · ${a.label} · día ${d}`}
                        onClick={() => markColumn(a.id, d)}>
                        {dayTotal(a.id, d) || '·'}
                      </td>
                    ))}
                    <td className="att-total-col" style={{ fontWeight: 800, color: 'var(--navy)' }}>{grandTotal(a.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--slate-400)', marginTop: 14, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--cyan)', display: 'inline-block' }} /> Natación presente</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: '#7B5BD6', display: 'inline-block' }} /> P. física presente</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid var(--line)', display: 'inline-block' }} /> Ausente</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--cyan-050)', border: '1px solid var(--cyan-100)', display: 'inline-block' }} /> Natación programada</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: '#f5f1fd', border: '1px solid #e2d9f7', display: 'inline-block' }} /> P. física programada</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px dashed var(--line)', opacity: .5, display: 'inline-block' }} /> Fuera del calendario del grupo (no cuenta para el %)</span>
      </p>
      <p style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 6 }}>
        Calendario: Grupo 1 entrena martes, jueves y sábado. Grupo 2 entrena de lunes a sábado; el lunes solo P. física, miércoles y sábado solo natación.
      </p>
    </div>
  );
}

export { AttendanceView };
