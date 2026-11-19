import React, { useState, useMemo } from 'react';
import { DB } from '../lib/db.js';
import { MONTHS, fmtDateLong, todayISO } from './components.jsx';


/* ============================================================
   vol-report.jsx — Volumen por set: gráficos de barras de los
   metros y del % que representa cada set en el mes (A4).
   ============================================================ */
const nM = (n) => (+n || 0).toLocaleString('es-CL');
const nP = (n) => `${(+n || 0).toLocaleString('es-CL')}%`;
const setName = (c) => c.label.replace(/^Set\s+/i, '');

/* Barras horizontales de una sola serie: el color de la barra es uno solo
   (la magnitud), el cuadrito junto al nombre identifica el set. */
function SetBars({ rows, valueOf, display, tip }) {
  const max = Math.max(0, ...rows.map(valueOf));
  return (
    <div className="chart-bars vr-bars" role="list">
      {rows.map(r => {
        const v = valueOf(r);
        const w = max ? (v / max) * 100 : 0;
        return (
          <div className="chart-bar-row vr-row" key={r.c.k} role="listitem" title={tip(r)}>
            <div className="cb-label vr-label">
              <span className="vr-swatch" style={{ background: r.c.color }} />
              {setName(r.c)}
            </div>
            <div className="cb-track vr-track">
              {v > 0 && <div className="cb-fill vr-fill" style={{ width: `${Math.max(w, 1.5)}%` }} />}
            </div>
            <div className={`cb-val${v ? '' : ' vr-zero'}`}>{display(r)}</div>
          </div>
        );
      })}
    </div>
  );
}

function VolumeReport({ st, ym }) {
  const [yy, mm] = ym.split('-').map(Number);
  const [grupo, setGrupo] = useState('all');
  const coach = st.coach;
  const logoUrl = '/logo.png';

  const trainings = useMemo(() => st.trainings
    .filter(t => t.fecha.startsWith(ym) && t.actividad !== 'fisica')
    .filter(t => grupo === 'all' || t.grupo === grupo || t.grupo === 'TODOS'),
  [st.trainings, ym, grupo]);

  const { vol, sesiones } = useMemo(() => {
    const vol = DB.VOL_KEYS.reduce((a, k) => { a[k] = 0; return a; }, { total: 0 });
    const sesiones = DB.VOL_KEYS.reduce((a, k) => { a[k] = 0; return a; }, {});
    trainings.forEach(t => {
      const v = DB.volumenFor(t);
      vol.total += +v.total || 0;
      DB.VOL_KEYS.forEach(k => { vol[k] += +v[k] || 0; if (+v[k] > 0) sesiones[k]++; });
    });
    return { vol, sesiones };
  }, [trainings]);

  const rows = DB.VOL_CATS.map(c => ({ c, m: vol[c.k], pct: DB.volPct(vol, c.k), n: sesiones[c.k] }));
  const usados = rows.filter(r => r.m > 0).length;
  const tip = (r) => `${r.c.label}: ${nM(r.m)} m · ${nP(r.pct)} del volumen · ${r.n} ${r.n === 1 ? 'sesión' : 'sesiones'}`;
  const grupoTxt = grupo === 'all' ? 'Todos los grupos' : DB.groupLabel(grupo);

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--slate-500)' }}>Grupo</span>
        <div className="tabs">
          <button className={`tab ${grupo === 'all' ? 'active' : ''}`} onClick={() => setGrupo('all')}>Todos</button>
          {DB.GROUPS.map(g => (
            <button key={g.id} className={`tab ${grupo === g.id ? 'active' : ''}`} onClick={() => setGrupo(g.id)}>{g.label}</button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div className="report-viewer">
          <div className="report-page">
            <div className="rp-header">
              <div className="rp-brand">
                <img src={logoUrl} alt="Club Natación Lo Prado" />
                <div>
                  <div className="rp-program">Club Natación Lo Prado</div>
                  <div className="rp-doctype">Volumen de Entrenamiento por Set</div>
                </div>
              </div>
              <div className="rp-period">
                <div className="rp-period-label">Periodo</div>
                <div className="rp-period-val">{MONTHS[mm - 1]} {yy}</div>
              </div>
            </div>

            <div className="rp-coach">
              <div><span className="rp-k">Técnico</span><span className="rp-v">{coach.nombre}</span></div>
              <div><span className="rp-k">Grupo</span><span className="rp-v">{grupoTxt}</span></div>
              <div><span className="rp-k">Sesiones de natación</span><span className="rp-v">{trainings.length}</span></div>
              <div><span className="rp-k">Volumen total</span><span className="rp-v">{nM(vol.total)} m</span></div>
            </div>

            {vol.total === 0 ? (
              <div className="rp-section">
                <p className="rp-empty" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                  No hay metros registrados en este periodo. El volumen se calcula desde los títulos de cada set en el contenido de los entrenamientos (por ejemplo <code>SET HIPOXIA : 400m</code>).
                </p>
              </div>
            ) : (
              <>
                <div className="rp-section">
                  <h2 className="rp-h">% del volumen por set</h2>
                  <SetBars rows={rows} valueOf={r => r.pct} display={r => nP(r.pct)} tip={tip} />
                </div>

                <div className="rp-section">
                  <h2 className="rp-h">Metros realizados por set</h2>
                  <SetBars rows={rows} valueOf={r => r.m} display={r => `${nM(r.m)} m`} tip={tip} />
                </div>

                <div className="rp-section">
                  <h2 className="rp-h">Detalle</h2>
                  <table className="rp-table">
                    <thead>
                      <tr>
                        <th>Set</th>
                        <th className="num">Metros</th>
                        <th className="num">% del volumen</th>
                        <th className="num">Sesiones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.c.k}>
                          <td className="strong">{r.c.label}</td>
                          <td className="num">{nM(r.m)}</td>
                          <td className="num">{nP(r.pct)}</td>
                          <td className="num">{r.n}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="strong">Total ({usados} {usados === 1 ? 'set utilizado' : 'sets utilizados'})</td>
                        <td className="num strong">{nM(vol.total)}</td>
                        <td className="num strong">100%</td>
                        <td className="num strong">{trainings.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

            <div className="rp-spacer" />
            <div className="rp-foot">
              <div>{coach.programa} — Generado el {fmtDateLong(todayISO())}</div>
              <div className="rp-sign"><span className="rp-sign-line" />{coach.nombre} · {coach.rol}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { VolumeReport };
