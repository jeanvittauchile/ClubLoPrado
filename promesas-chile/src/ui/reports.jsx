import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DB } from '../lib/db.js';
import {
  Icon, Avatar, avatarColor, getInitials,
  useStore, useToast, Button, Modal, Field, Empty, Confirm,
  MONTHS, WD_SHORT, fmtDate, fmtDateLong, todayISO, fmtTime, parseTime,
} from './components.jsx';
import { EvalReport } from './eval-report.jsx';
import { VolumeReport } from './vol-report.jsx';


/* ============================================================
   reports.jsx — Informes mensuales en PDF (A4 multi-página)
   ============================================================ */
function ReportsView() {
  const st = useStore();
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const [tipo, setTipo] = useState('mensual');
  const [yy, mm] = ym.split('-').map(Number);
  const meta = (st.reports && st.reports[ym]) || { notas: '', resultados: '' };
  const logoUrl = '/logo.png';

  const shiftMonth = (d) => { const dt = new Date(yy, mm - 1 + d, 1); setYm(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`); };

  const nadadores = useMemo(() => st.swimmers.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)), [st.swimmers]);

  // Asistencia por actividad
  const statsN = DB.monthAttendance(st, nadadores, ym, 'natacion');
  const statsF = DB.monthAttendance(st, nadadores, ym, 'fisica');
  const activeDaysCount = new Set([...statsN.activeDays, ...statsF.activeDays]).size;

  const monthEvals = st.evaluations.filter(e => e.fecha.startsWith(ym)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const monthTrainings = st.trainings.filter(t => t.fecha.startsWith(ym)).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const protoById = (id) => DB.PROTOCOLS.find(p => p.id === id);
  const metricMeta = (m) => DB.METRIC_TYPES[m];

  return (
    <div>
      <div className="toolbar no-print">
        <div className="tabs">
          <button className={`tab ${tipo === 'mensual' ? 'active' : ''}`} onClick={() => setTipo('mensual')}>Informe mensual</button>
          <button className={`tab ${tipo === 'evaluaciones' ? 'active' : ''}`} onClick={() => setTipo('evaluaciones')}>Resultados de evaluaciones</button>
          <button className={`tab ${tipo === 'volumen' ? 'active' : ''}`} onClick={() => setTipo('volumen')}>Volumen por set</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 4 }}>
          <button className="btn-icon" onClick={() => shiftMonth(-1)}><Icon name="chevL" /></button>
          <div style={{ minWidth: 156, textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-head)', fontSize: 14.5 }}>{MONTHS[mm - 1]} {yy}</div>
          <button className="btn-icon" onClick={() => shiftMonth(1)}><Icon name="chevR" /></button>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" icon="print" onClick={() => window.print()}>Imprimir</Button>
        <Button icon="download" onClick={() => window.print()}>Descargar PDF</Button>
      </div>

      {tipo === 'evaluaciones' ? (
        <EvalReport st={st} ym={ym} />
      ) : tipo === 'volumen' ? (
        <VolumeReport st={st} ym={ym} />
      ) : (
        <div className="report-grid" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 22, alignItems: 'start' }}>
          <div className="card card-pad no-print" style={{ position: 'sticky', top: 88 }}>
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Contenido editable</h3>
            <p style={{ fontSize: 12.5, color: 'var(--slate-500)', marginTop: 0, marginBottom: 16 }}>Se incluye en el PDF mensual que recibe el Head Coach y el Metodólogo.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Notas relevantes del mes">
                <textarea className="textarea" value={meta.notas} onChange={e => DB.setReportMeta(ym, { notas: e.target.value })} placeholder="Hitos, lesiones, observaciones del proceso…" style={{ minHeight: 120 }} />
              </Field>
              <Field label="Resultados competitivos">
                <textarea className="textarea" value={meta.resultados} onChange={e => DB.setReportMeta(ym, { resultados: e.target.value })} placeholder="Competencias, marcas, podios del mes…" style={{ minHeight: 120 }} />
              </Field>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <ReportPaper {...{ st, ym, yy, mm, nadadores, statsN, statsF, activeDaysCount, monthEvals, monthTrainings, meta, logoUrl, protoById, metricMeta }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── ReportPaper: 2 páginas A4 ── */
function ReportPaper({ st, ym, yy, mm, nadadores, statsN, statsF, activeDaysCount, monthEvals, monthTrainings, meta, logoUrl, protoById, metricMeta }) {
  const coach = st.coach;
  const trVols = monthTrainings.map(t => ({ t, v: DB.volumenFor(t) }));
  const monthVol = trVols.reduce((a, { v }) => {
    a.total += (+v.total || 0);
    DB.VOL_KEYS.forEach(k => { a[k] += (+v[k] || 0); }); return a;
  }, DB.VOL_KEYS.reduce((a, k) => { a[k] = 0; return a; }, { total: 0 }));
  const nM = (n) => (+n || 0).toLocaleString('es-CL');
  // Solo los sets con metros en el mes, para que la tabla quepa en A4.
  const usedCats = DB.VOL_CATS.filter(c => monthVol[c.k] > 0);

  return (
    <div className="report-viewer">

      {/* ══════════════ PÁGINA 1: Resumen + Asistencia ══════════════ */}
      <div className="report-page">
        {/* Cabecera */}
        <div className="rp-header">
          <div className="rp-brand">
            <img src={logoUrl} alt="Club Natación Lo Prado" />
            <div>
              <div className="rp-program">Club Natación Lo Prado</div>
              <div className="rp-doctype">Informe Mensual de Proceso</div>
            </div>
          </div>
          <div className="rp-period">
            <div className="rp-period-label">Periodo</div>
            <div className="rp-period-val">{MONTHS[mm - 1]} {yy}</div>
          </div>
        </div>

        {/* Técnico */}
        <div className="rp-coach">
          <div><span className="rp-k">Técnico responsable</span><span className="rp-v">{coach.nombre}</span></div>
          <div><span className="rp-k">Rol</span><span className="rp-v">{coach.rol}</span></div>
          <div><span className="rp-k">Región</span><span className="rp-v">{coach.region}</span></div>
          <div><span className="rp-k">Contacto</span><span className="rp-v">{coach.email}</span></div>
        </div>

        {/* Resumen estadístico */}
        <div className="rp-section">
          <h2 className="rp-h">Resumen del mes</h2>
          <div className="rp-stats">
            <div className="rp-stat">
              <div className="rp-stat-v">{nadadores.length}</div>
              <div className="rp-stat-l">Nadadores</div>
            </div>
            <div className="rp-stat">
              <div className="rp-stat-v">{monthTrainings.length}</div>
              <div className="rp-stat-l">Entrenamientos</div>
            </div>
            <div className="rp-stat">
              <div className="rp-stat-v">{activeDaysCount}</div>
              <div className="rp-stat-l">Días de actividad</div>
            </div>
            <div className="rp-stat rp-stat-hl">
              <div className="rp-stat-v">{statsN.pct}%</div>
              <div className="rp-stat-l">Asistencia natación ({statsN.present})</div>
            </div>
            <div className="rp-stat rp-stat-hl">
              <div className="rp-stat-v">{statsF.pct}%</div>
              <div className="rp-stat-l">Asistencia prep. física ({statsF.present})</div>
            </div>
            <div className="rp-stat">
              <div className="rp-stat-v">{monthEvals.length}</div>
              <div className="rp-stat-l">Evaluaciones</div>
            </div>
          </div>
        </div>

        {/* Asistencia por deportista y actividad */}
        <div className="rp-section">
          <h2 className="rp-h">Asistencia de deportistas</h2>
          <table className="rp-table">
            <thead>
              <tr>
                <th>Nadador</th>
                <th>Categoría</th>
                <th className="num">Natación</th>
                <th className="num">%</th>
                <th className="num">Prep. física</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {statsN.rows.map(({ s, present, possible, pct }, i) => {
                const f = statsF.rows[i];
                const color = (p) => (p >= 80 ? '#1FA971' : p >= 60 ? '#E0A93B' : '#E1543B');
                return (
                  <tr key={s.id}>
                    <td className="strong">{s.nombre}</td>
                    <td>{DB.categoryFor(s.fechaNacimiento)}</td>
                    <td className="num">{present}/{possible}</td>
                    <td className="num strong" style={{ color: possible ? color(pct) : undefined }}>{possible ? `${pct}%` : '—'}</td>
                    <td className="num">{f.present}/{f.possible}</td>
                    <td className="num strong" style={{ color: f.possible ? color(f.pct) : undefined }}>{f.possible ? `${f.pct}%` : '—'}</td>
                  </tr>
                );
              })}
              {statsN.rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#8A99A6', padding: '20px 10px' }}>Sin nadadores registrados.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong" colSpan={2}>Consolidado</td>
                <td className="num strong">{statsN.present}/{statsN.possible}</td>
                <td className="num strong">{statsN.pct}%</td>
                <td className="num strong">{statsF.present}/{statsF.possible}</td>
                <td className="num strong">{statsF.pct}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rp-spacer" />
        <div className="rp-page-num">Página 1 de 2 · {coach.programa}</div>
      </div>

      {/* ══════════════ PÁGINA 2: Evaluaciones + Entrenamientos + Notas ══════════════ */}
      <div className="report-page">
        {/* Cabecera de continuación */}
        <div className="rp-cont-header">
          <span className="rp-cont-title">Club Natación Lo Prado — Informe Mensual de Proceso</span>
          <span className="rp-cont-meta">{MONTHS[mm - 1]} {yy}</span>
        </div>

        {/* Volumen de entrenamiento */}
        <div className="rp-section">
          <h2 className="rp-h">Volumen de entrenamiento del mes</h2>
          <div className="rp-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="rp-stat rp-stat-hl">
              <div className="rp-stat-v">{nM(monthVol.total)}</div>
              <div className="rp-stat-l">Total (mts)</div>
            </div>
            {usedCats.map(c => (
              <div key={c.k} className="rp-stat" style={{ borderTop: `3px solid ${c.color}` }}>
                <div className="rp-stat-v">{nM(monthVol[c.k])}</div>
                <div className="rp-stat-l">{c.label} · {DB.volPct(monthVol, c.k).toLocaleString('es-CL')}%</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 10.5, color: 'var(--slate-500)', lineHeight: 1.5 }}>
            Metros consolidados de {monthTrainings.length} {monthTrainings.length === 1 ? 'sesión' : 'sesiones'}. El total es la suma de los bloques (SET) de cada entrenamiento; el porcentaje indica la participación de cada bloque en el volumen del mes.
          </p>
        </div>

        {/* Evaluaciones */}
        <div className="rp-section">
          <h2 className="rp-h">Evaluaciones realizadas</h2>
          {monthEvals.length === 0 ? (
            <p className="rp-empty">No se registraron evaluaciones en el periodo.</p>
          ) : (
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Métrica</th>
                  <th>Protocolo</th>
                  <th className="num">Nadadores</th>
                  <th>Resultado destacado</th>
                </tr>
              </thead>
              <tbody>
                {monthEvals.map(e => {
                  const proto = protoById(e.protocolo);
                  const m = metricMeta(e.metrica);
                  const activeData = e.swimmerIds.map(id => e.data[id]).filter(Boolean);
                  let res = '—';
                  if (e.metrica === 'cronometro') {
                    const totals = activeData.map(d => d.total != null ? d.total : d.totalNado).filter(v => v != null);
                    if (totals.length) res = `Mejor nado ${fmtTime(Math.min(...totals))}`;
                  } else if (e.metrica === 'compuesta') {
                    const times = [];
                    activeData.forEach(d => (d.intentos || []).forEach(it => { if (it.tiempo) times.push(it.tiempo); }));
                    if (times.length) res = `Mejor tiempo ${fmtTime(Math.min(...times))}`;
                  } else {
                    const avgs = activeData.map(d => d.tramos && d.tramos.length ? d.tramos.reduce((a, b) => a + b, 0) / d.tramos.length : null).filter(v => v != null);
                    if (avgs.length) res = `Prom. ${(avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(1)} por tramo`;
                  }
                  return (
                    <tr key={e.id}>
                      <td>{fmtDate(e.fecha)}</td>
                      <td><span className="rp-tag" style={{ color: m.color, borderColor: m.color }}>{m.label}</span></td>
                      <td>{proto.nombre} · {proto.set}</td>
                      <td className="num">{e.swimmerIds.length}</td>
                      <td>{res}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Entrenamientos */}
        <div className="rp-section">
          <h2 className="rp-h">Entrenamientos del periodo</h2>
          {monthTrainings.length === 0 ? (
            <p className="rp-empty">No se registraron entrenamientos.</p>
          ) : (
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Sesión</th>
                  <th>Ritmo</th>
                  <th className="num">Min</th>
                  <th className="num">Total</th>
                  {usedCats.map(c => <th key={c.k} className="num">{c.short}</th>)}
                </tr>
              </thead>
              <tbody>
                {trVols.map(({ t, v }) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.fecha)}</td>
                    <td className="strong">{t.titulo}</td>
                    <td>{t.tipo}</td>
                    <td className="num">{t.duracion}</td>
                    <td className="num strong">{nM(v.total)}</td>
                    {usedCats.map(c => <td key={c.k} className="num">{nM(v[c.k])}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="strong" colSpan={4}>Consolidado del mes</td>
                  <td className="num strong">{nM(monthVol.total)}</td>
                  {usedCats.map(c => <td key={c.k} className="num strong">{nM(monthVol[c.k])}</td>)}
                </tr>
                <tr>
                  <td colSpan={4}>% del volumen del mes</td>
                  <td className="num">100%</td>
                  {usedCats.map(c => <td key={c.k} className="num">{DB.volPct(monthVol, c.k).toLocaleString('es-CL')}%</td>)}
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Notas y resultados competitivos */}
        <div className="rp-section rp-notes-grid">
          <div>
            <h2 className="rp-h">Notas relevantes</h2>
            <div className="rp-note">
              {meta.notas ? meta.notas : <span className="rp-empty">Sin notas registradas.</span>}
            </div>
          </div>
          <div>
            <h2 className="rp-h">Resultados competitivos</h2>
            <div className="rp-note">
              {meta.resultados ? meta.resultados : <span className="rp-empty">Sin resultados registrados.</span>}
            </div>
          </div>
        </div>

        <div className="rp-spacer" />

        {/* Pie con firma */}
        <div className="rp-foot">
          <div>{coach.programa} — Generado el {fmtDateLong(todayISO())}</div>
          <div className="rp-sign">
            <span className="rp-sign-line" />
            {coach.nombre} · {coach.rol}
          </div>
        </div>
      </div>
    </div>
  );
}

export { ReportsView };
