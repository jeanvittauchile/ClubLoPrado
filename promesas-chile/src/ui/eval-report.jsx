import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DB } from '../lib/db.js';
import {
  Icon, Avatar, avatarColor, getInitials,
  useStore, useToast, Button, Modal, Field, Empty, Confirm,
  MONTHS, WD_SHORT, fmtDate, fmtDateLong, todayISO, fmtTime, parseTime,
} from './components.jsx';


/* ============================================================
   eval-report.jsx — Informe de Resultados de Evaluaciones (A4)
   ============================================================ */
const ER = {
  proto: (id) => DB.PROTOCOLS.find(p => p.id === id),
  metric: (m) => DB.METRIC_TYPES[m],
  sw: (st, id) => st.swimmers.find(s => s.id === id),
};
const POS_COLORS = ['#C6962B', '#9AA7B0', '#B97A3E'];

/* ---------- Horizontal comparative bars ---------- */
function CompareBars({ rows, unit, lowerBetter, color = '#00C0E2', note }) {
  if (!rows.length) return <p className="rp-empty">Sin datos suficientes.</p>;
  const vals = rows.map(r => r.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  return (
    <>
      <div className="chart-bars">
        {rows.map((r, i) => {
          const norm = lowerBetter ? (max - r.value) / span : (r.value - min) / span;
          const w = 30 + norm * 70;
          const isBest = lowerBetter ? r.value === min : r.value === max;
          return (
            <div className="chart-bar-row" key={i}>
              <div className="cb-label" title={r.label}>{r.label}</div>
              <div className="cb-track"><div className="cb-fill" style={{ width: w + '%', background: isBest ? '#1FA971' : color }} /></div>
              <div className="cb-val">{r.display}</div>
            </div>
          );
        })}
      </div>
      {note && <p className="chart-note">{note}</p>}
    </>
  );
}

/* ---------- Ranking list with medals ---------- */
function RankList({ rows }) {
  if (!rows.length) return <p className="rp-empty">Sin datos suficientes.</p>;
  return (
    <div className="rank-list">
      {rows.map((r, i) => (
        <div className="rank-item" key={r.id}>
          <div className="rank-pos" style={{ background: i < 3 ? POS_COLORS[i] : 'var(--line-soft)', color: i < 3 ? '#fff' : 'var(--slate-500)' }}>{i + 1}</div>
          <div className="rank-av" style={{ background: avatarColor(r.label) }}>{getInitials(r.label)}</div>
          <div className="rank-meta">
            <div className="rank-name">{r.label}</div>
            <div className="rank-sub">{r.subtext}</div>
          </div>
          <div className="rank-val">{r.display}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Main evaluation report — A4 multi-page ---------- */
function EvalReport({ st, ym }) {
  const [yy, mm] = ym.split('-').map(Number);
  const evals = st.evaluations.filter(e => e.fecha.startsWith(ym)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const coach = st.coach;
  const logoUrl = '/logo.png';

  const swName = (id) => { const s = ER.sw(st, id); return s ? s.nombre : '—'; };

  /* ---- Cronómetro series ---- */
  // EvalRecorder (protocolos de 1 sola serie) guarda tiempos en d.laps;
  // IntervalRecorder (protocolos de repeticiones) los guarda en d.reps[].nado.
  const splitValues = (d) => d.reps ? d.reps.map(r => r.nado).filter(v => v != null) : (d.laps || []).filter(v => v != null);
  const cronoSeries = evals.filter(e => e.metrica === 'cronometro');
  const seriesProtos = [...new Set(cronoSeries.map(e => e.protocolo))];

  function rankSeries(protoId) {
    const evs = cronoSeries.filter(e => e.protocolo === protoId);
    const byS = {};
    evs.forEach(e => Object.entries(e.data).filter(([id]) => e.swimmerIds.includes(id)).forEach(([id, d]) => {
      const vals = splitValues(d);
      if (!vals.length) return;
      (byS[id] = byS[id] || []).push(...vals);
    }));
    return Object.entries(byS).filter(([, laps]) => laps.length > 0).map(([id, laps]) => {
      const avg = laps.reduce((a, b) => a + b, 0) / laps.length;
      const best = Math.min(...laps);
      const worst = Math.max(...laps);
      return { id, label: swName(id), value: avg, best, worst, count: laps.length };
    }).sort((a, b) => a.value - b.value);
  }

  /* ---- Compuesta ---- */
  const compEvals = evals.filter(e => e.metrica === 'compuesta');
  const compProtos = [...new Set(compEvals.map(e => e.protocolo))];
  function rankComp(protoId) {
    const proto = ER.proto(protoId);
    const evs = compEvals.filter(e => e.protocolo === protoId);
    const byS = {};
    evs.forEach(e => Object.entries(e.data).filter(([id]) => e.swimmerIds.includes(id)).forEach(([id, d]) => {
      (d.intentos || []).forEach(it => {
        if (it.tiempo == null) return;
        const s = (byS[id] = byS[id] || { times: [], metrics: {} });
        s.times.push(it.tiempo);
        (proto.metricas || []).forEach(m => { if (it[m] != null) (s.metrics[m] = s.metrics[m] || []).push(it[m]); });
      });
    }));
    return Object.entries(byS).map(([id, s]) => {
      const metrics = {};
      (proto.metricas || []).forEach(m => {
        const arr = s.metrics[m];
        metrics[m] = arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      });
      return { id, label: swName(id), value: Math.min(...s.times), worst: Math.max(...s.times), avg: s.times.reduce((a, b) => a + b, 0) / s.times.length, total: s.times.reduce((a, b) => a + b, 0), count: s.times.length, metrics };
    }).sort((a, b) => a.value - b.value);
  }

  /* ---- Counts ---- */
  function rankCount(metric) {
    const evs = evals.filter(e => e.metrica === metric);
    const byS = {};
    evs.forEach(e => Object.entries(e.data).filter(([id]) => e.swimmerIds.includes(id)).forEach(([id, d]) => {
      if (!d.tramos || !d.tramos.length) return;
      (byS[id] = byS[id] || []).push(...d.tramos.filter(v => v != null));
    }));
    return Object.entries(byS).filter(([, t]) => t.length > 0).map(([id, t]) => ({ id, label: swName(id), value: t.reduce((a, b) => a + b, 0) / t.length, count: t.length }))
      .sort((a, b) => a.value - b.value);
  }
  const brazadasRank = rankCount('brazadas');
  const subRank = rankCount('subacuatico');

  /* ---- Totales ---- */
  const swimmersEvaluated = new Set();
  evals.forEach(e => e.swimmerIds.forEach(id => swimmersEvaluated.add(id)));
  const byMetric = { cronometro: 0, brazadas: 0, subacuatico: 0, compuesta: 0 };
  evals.forEach(e => { byMetric[e.metrica] = (byMetric[e.metrica] || 0) + 1; });

  const empty = evals.length === 0;
  const hasPage2Content = !empty && (compProtos.length > 0 || brazadasRank.length > 0 || subRank.length > 0 || evals.length > 0);

  return (
    <div className="report-viewer">

      {/* ══════════════ PÁGINA 1: Encabezado + Métricas + Rankings ══════════════ */}
      <div className="report-page">
        {/* Cabecera */}
        <div className="rp-header">
          <div className="rp-brand">
            <img src={logoUrl} alt="Promesas Chile" />
            <div>
              <div className="rp-program">Promesas Chile · Natación</div>
              <div className="rp-doctype">Informe de Resultados de Evaluaciones</div>
            </div>
          </div>
          <div className="rp-period">
            <div className="rp-period-label">Periodo</div>
            <div className="rp-period-val">{MONTHS[mm - 1]} {yy}</div>
          </div>
        </div>

        {/* Técnico */}
        <div className="rp-coach">
          <div><span className="rp-k">Técnico</span><span className="rp-v">{coach.nombre}</span></div>
          <div><span className="rp-k">Evaluaciones</span><span className="rp-v">{evals.length}</span></div>
          <div><span className="rp-k">Deportistas evaluados</span><span className="rp-v">{swimmersEvaluated.size}</span></div>
          <div><span className="rp-k">Región</span><span className="rp-v">{coach.region}</span></div>
        </div>

        {empty ? (
          <>
            <div className="rp-section">
              <p className="rp-empty" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                No se registraron evaluaciones en este periodo. Realiza evaluaciones en el módulo correspondiente para generar este informe.
              </p>
            </div>
            <div className="rp-spacer" />
            <div className="rp-foot">
              <div>{coach.programa} — Generado el {fmtDateLong(todayISO())}</div>
              <div className="rp-sign"><span className="rp-sign-line" />{coach.nombre} · {coach.rol}</div>
            </div>
          </>
        ) : (
          <>
            {/* Distribución por tipo de métrica */}
            <div className="rp-section">
              <h2 className="rp-h">Evaluaciones por tipo de métrica</h2>
              <div className="rp-stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                <div className="rp-stat">
                  <div className="rp-stat-v" style={{ color: '#00A6C6' }}>{byMetric.cronometro}</div>
                  <div className="rp-stat-l">Cronómetro</div>
                </div>
                <div className="rp-stat">
                  <div className="rp-stat-v" style={{ color: '#1FA971' }}>{byMetric.brazadas}</div>
                  <div className="rp-stat-l">Brazadas</div>
                </div>
                <div className="rp-stat">
                  <div className="rp-stat-v" style={{ color: '#7B5BD6' }}>{byMetric.subacuatico}</div>
                  <div className="rp-stat-l">Mov. subacuáticos</div>
                </div>
                <div className="rp-stat">
                  <div className="rp-stat-v" style={{ color: '#159B8C' }}>{byMetric.compuesta}</div>
                  <div className="rp-stat-l">Salida / Viraje</div>
                </div>
              </div>
            </div>

            {/* Rankings por protocolo cronómetro */}
            {seriesProtos.map(pid => {
              const proto = ER.proto(pid);
              const rank = rankSeries(pid);
              const rankRows = rank.map(r => {
                const lvl = proto.niveles ? DB.levelFor(proto, r.value) : null;
                const lvlTxt = proto.niveles ? ` · ${lvl ? `Nivel ${lvl}` : 'Sin nivel'}` : '';
                return { id: r.id, label: r.label, display: fmtTime(r.value), subtext: `Mejor ${proto.distancia}m: ${fmtTime(r.best)} · Peor: ${fmtTime(r.worst)} · ${r.count} reps${lvlTxt}` };
              });
              const barRows = rank.map(r => ({ label: r.label.split(' ').slice(0, 2).join(' '), value: r.value, display: fmtTime(r.value) }));
              return (
                <div className="rp-section rp-twocol" key={pid}>
                  <div>
                    <h2 className="rp-h">Ranking · {proto.nombre}</h2>
                    <RankList rows={rankRows} />
                  </div>
                  <div>
                    <h2 className="rp-h">Comparativa promedio {proto.distancia}m</h2>
                    <CompareBars rows={barRows} lowerBetter unit="time" note={`Barra más larga = más rápido (mejor promedio por ${proto.distancia}m).`} />
                  </div>
                </div>
              );
            })}

            <div className="rp-spacer" />
            {hasPage2Content && <div className="rp-page-num">Página 1 de 2 · {coach.programa}</div>}
          </>
        )}
      </div>

      {/* ══════════════ PÁGINA 2: Compuesta + Counts + Detalle ══════════════ */}
      {hasPage2Content && (
        <div className="report-page">
          {/* Cabecera de continuación */}
          <div className="rp-cont-header">
            <span className="rp-cont-title">Promesas Chile · Natación — Resultados de Evaluaciones</span>
            <span className="rp-cont-meta">{MONTHS[mm - 1]} {yy}</span>
          </div>

          {/* Ranking compuesta */}
          {compProtos.map(pid => {
            const proto = ER.proto(pid);
            const rank = rankComp(pid);
            const rankRows = rank.map(r => {
              const metricParts = (proto.metricas || []).map(m => `${ER.metric(m).label}: ${r.metrics[m] != null ? r.metrics[m].toFixed(1) : '—'}`);
              return { id: r.id, label: r.label, display: fmtTime(r.value), subtext: `Promedio: ${fmtTime(r.avg)} · Peor: ${fmtTime(r.worst)} · Total: ${fmtTime(r.total)} · ${r.count} intentos${metricParts.length ? ' · ' + metricParts.join(' · ') : ''}` };
            });
            const barRows = rank.map(r => ({ label: r.label.split(' ').slice(0, 2).join(' '), value: r.value, display: fmtTime(r.value) }));
            return (
              <div className="rp-section rp-twocol" key={pid}>
                <div>
                  <h2 className="rp-h">Ranking · {proto.nombre}</h2>
                  <RankList rows={rankRows} />
                </div>
                <div>
                  <h2 className="rp-h">Mejores tiempos</h2>
                  <CompareBars rows={barRows} lowerBetter color="#159B8C" note="Tiempo más bajo = mejor salida/viraje." />
                </div>
              </div>
            );
          })}

          {/* Counts comparativas */}
          {(brazadasRank.length > 0 || subRank.length > 0) && (
            <div className="rp-section rp-twocol">
              {brazadasRank.length > 0 && (
                <div>
                  <h2 className="rp-h">Promedio de brazadas por tramo</h2>
                  <CompareBars
                    rows={brazadasRank.map(r => ({ label: r.label.split(' ').slice(0, 2).join(' '), value: r.value, display: r.value.toFixed(1) }))}
                    color="#1FA971"
                    note="Menos brazadas = mayor eficiencia técnica."
                  />
                </div>
              )}
              {subRank.length > 0 && (
                <div>
                  <h2 className="rp-h">Promedio de mov. subacuáticos</h2>
                  <CompareBars
                    rows={subRank.map(r => ({ label: r.label.split(' ').slice(0, 2).join(' '), value: r.value, display: r.value.toFixed(1) }))}
                    color="#7B5BD6"
                  />
                </div>
              )}
            </div>
          )}

          {/* Detalle log */}
          <div className="rp-section">
            <h2 className="rp-h">Detalle de evaluaciones del periodo</h2>
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Métrica</th>
                  <th>Protocolo</th>
                  <th className="num">Nadadores</th>
                  <th>Técnico</th>
                </tr>
              </thead>
              <tbody>
                {evals.map(e => {
                  const m = ER.metric(e.metrica);
                  const p = ER.proto(e.protocolo);
                  return (
                    <tr key={e.id}>
                      <td>{fmtDate(e.fecha)}</td>
                      <td><span className="rp-tag" style={{ color: m.color, borderColor: m.color }}>{m.label}</span></td>
                      <td>{p.nombre}</td>
                      <td className="num">{e.swimmerIds.length}</td>
                      <td>{e.tecnico}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
      )}
    </div>
  );
}

export { EvalReport };
