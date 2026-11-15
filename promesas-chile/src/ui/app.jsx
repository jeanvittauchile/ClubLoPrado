/* ============================================================
   app.jsx — autenticación (Supabase) + shell + ajustes
   ============================================================ */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DB } from '../lib/db.js';
import { supabase, hasSupabaseConfig } from '../lib/supabase.js';
import {
  Icon, getInitials, useStore, useToast, ToastProvider, Button, Modal, Field,
} from './components.jsx';
import { Dashboard } from './dashboard.jsx';
import { SwimmersView } from './swimmers.jsx';
import { AttendanceView } from './attendance.jsx';
import { TrainingsView } from './trainings.jsx';
import { EvaluationsView } from './evaluations.jsx';
import { ReportsView } from './reports.jsx';
import { GoldTimesView } from './goldtimes.jsx';

const LOGO = '/logo.png';


/* ============================================================
   Ajustes
   ============================================================ */
function Settings({ onClose }) {
  const st = useStore();
  const toast = useToast();
  const [c, setC] = useState(st.coach);
  const set = (k) => (e) => setC(s => ({ ...s, [k]: e.target.value }));
  const [confirmReset, setConfirmReset] = useState(false);

  const saveCoach = () => { DB.updateCoach(c); toast('Datos del técnico guardados'); };

  const [accountEmail, setAccountEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  useEffect(() => {
    if (supabase) supabase.auth.getSession().then(({ data }) => setAccountEmail(data.session?.user?.email || ''));
  }, []);
  const changePassword = async () => {
    if (newPass.length < 8) { toast('La contraseña debe tener al menos 8 caracteres'); return; }
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) toast('No se pudo cambiar la contraseña'); else { toast('Contraseña actualizada'); setNewPass(''); }
  };

  return (
    <Modal title="Ajustes" sub="Perfil del técnico y datos" onClose={onClose} maxWidth={560}
      foot={<><div style={{ flex: 1 }} /><Button onClick={onClose}>Listo</Button></>}>
      <div className="section-title" style={{ marginTop: 0 }}><h2>Técnico responsable</h2><div className="line" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field-grid">
          <Field label="Nombre"><input className="input" value={c.nombre || ''} onChange={set('nombre')} /></Field>
          <Field label="Rol"><input className="input" value={c.rol || ''} onChange={set('rol')} /></Field>
        </div>
        <div className="field-grid">
          <Field label="Región"><input className="input" value={c.region || ''} onChange={set('region')} /></Field>
          <Field label="Correo"><input className="input" value={c.email || ''} onChange={set('email')} /></Field>
        </div>
        <div><Button size="sm" icon="check" onClick={saveCoach}>Guardar perfil</Button></div>
      </div>

      {accountEmail && (
        <>
          <div className="divider" />
          <div className="section-title"><h2>Cuenta</h2><div className="line" /></div>
          <p style={{ fontSize: 13, color: 'var(--slate-500)', marginTop: 0 }}>Sesión iniciada como <strong>{accountEmail}</strong></p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
            <Field label="Nueva contraseña"><PasswordInput autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 8 caracteres" /></Field>
            <Button size="sm" variant="ghost" icon="lock" onClick={changePassword}>Cambiar contraseña</Button>
          </div>
          <Button size="sm" variant="ghost" icon="logout" onClick={() => { onClose(); supabase.auth.signOut(); }}>Cerrar sesión</Button>
        </>
      )}

      <div className="divider" />
      <div className="section-title"><h2>Datos</h2><div className="line" /></div>
      <p style={{ fontSize: 13, color: 'var(--slate-500)', marginTop: 0 }}>
        Los datos son compartidos por todos los entrenadores del club. Se sincronizan con la nube cuando hay conexión y quedan disponibles offline en este dispositivo.
      </p>
      {!confirmReset ? <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>Borrar todos los datos del club</Button>
        : <div>
            <p style={{ fontSize: 13, color: 'var(--red)', margin: '0 0 8px' }}>Esto borra nadadores, asistencia, entrenamientos, evaluaciones e informes <strong>para todos los entrenadores</strong>. No se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="danger" onClick={() => { DB.resetAll(); toast('Datos borrados'); setConfirmReset(false); }}>Confirmar borrado</Button><Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Cancelar</Button></div>
          </div>}
    </Modal>
  );
}

/* ---------- Indicador de conexión ---------- */
function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(navigator.onLine);
    window.addEventListener('online', u); window.addEventListener('offline', u);
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', u); };
  }, []);
  return on;
}

/* ============================================================
   Shell
   ============================================================ */
const NAV = [
  { id: 'dashboard', label: 'Inicio', icon: 'home' },
  { id: 'swimmers', label: 'Nadadores', icon: 'users' },
  { id: 'attendance', label: 'Asistencia', icon: 'checkSquare' },
  { id: 'trainings', label: 'Entrenamientos', icon: 'calendar' },
  { id: 'evaluations', label: 'Evaluaciones', icon: 'timer' },
  { id: 'reports', label: 'Informes', icon: 'doc' },
  { id: 'goldtimes', label: 'Oro Sudamericano', icon: 'award' },
];
const TITLES = {
  dashboard: ['Inicio', 'Resumen general del programa'],
  swimmers: ['Nadadores', 'Gestión de fichas — Grupo 1 y Grupo 2'],
  attendance: ['Asistencia', 'Panel mensual de asistencia'],
  trainings: ['Entrenamientos', 'Calendario y planificación de sesiones'],
  evaluations: ['Evaluaciones', 'Cronómetro, brazadas y movimientos subacuáticos'],
  reports: ['Informes', 'Generación de informe mensual en PDF'],
  goldtimes: ['Oro Sudamericano', 'Tiempos de referencia por prueba y categoría'],
};

function Shell() {
  const st = useStore();
  const online = useOnline();
  const [route, setRoute] = useState('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const go = (r) => { setRoute(r); setNavOpen(false); };
  const [title, sub] = TITLES[route];

  return (
    <div className="app">
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="logo-wrap"><img src={LOGO} alt="Club Natación Lo Prado" /></div>
        <div className="nav-group-label">Programa</div>
        {NAV.map(n => (
          <button key={n.id} className={`nav-item ${route === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} /><span>{n.label}</span>
          </button>
        ))}
        <div className="sidebar-foot">
          <button className="coach-chip" style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => setSettings(true)}>
            <div className="avatar">{getInitials(st.coach.nombre || 'Técnico')}</div>
            <div className="meta"><strong>{st.coach.nombre || 'Técnico'}</strong><span>{st.coach.rol || 'Entrenador'}</span></div>
            <Icon name="cog" style={{ width: 17, height: 17, stroke: 'rgba(255,255,255,.5)', marginLeft: 'auto' }} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar no-print">
          <button className="hamburger" onClick={() => setNavOpen(true)}><Icon name="menu" /></button>
          <div>
            <h1>{title}</h1>
            <div className="sub">{sub}</div>
          </div>
          <div className="topbar-spacer" />
          <div className={`conn-pill ${online ? 'conn-on' : 'conn-off'}`} title={online ? 'Conectado — los cambios se sincronizan' : 'Sin conexión — trabajando en modo offline'}>
            <span className="dot" />{online ? 'En línea · sincronizado' : 'Offline · guardado local'}
          </div>
        </header>
        <div className="content" data-screen-label={title}>
          {route === 'dashboard' && <Dashboard go={go} />}
          {route === 'swimmers' && <SwimmersView />}
          {route === 'attendance' && <AttendanceView />}
          {route === 'trainings' && <TrainingsView />}
          {route === 'evaluations' && <EvaluationsView />}
          {route === 'reports' && <ReportsView />}
          {route === 'goldtimes' && <GoldTimesView />}
        </div>
      </main>

      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}

/* ---------- Red de seguridad ante errores inesperados ---------- */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <img src={LOGO} alt="" style={{ width: 100, opacity: .9, marginBottom: 16 }} />
          <h2 style={{ marginBottom: 8 }}>Algo salió mal</h2>
          <p style={{ color: 'var(--slate-500)', marginBottom: 18 }}>
            Ocurrió un error inesperado al mostrar esta pantalla. Tus datos están a salvo — intenta recargar.
          </p>
          <Button onClick={() => window.location.reload()}>Recargar</Button>
        </div>
      </div>
    );
  }
}

/* ---------- Cargando ---------- */
function Splash({ text = 'Cargando…' }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <img src={LOGO} alt="" style={{ width: 120, opacity: .9, marginBottom: 16 }} />
        <div style={{ color: 'var(--slate-500)', fontWeight: 600 }}>{text}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Raíz: gestiona sesión Supabase → init DB → Shell

   Cada entrenador entra con su propia cuenta (correo + contraseña).
   Sólo los correos registrados en la tabla club_members pueden ver
   los datos, que son compartidos por todo el club.
   ============================================================ */

// Se lee al cargar el módulo, antes de que Supabase limpie la URL.
let mustSetPassword = /type=(recovery|invite)/.test(window.location.hash + window.location.search);

function AuthCard({ title, sub, children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 16 }}>
      <div className="card card-pad" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src={LOGO} alt="Club Natación Lo Prado" style={{ width: 110, borderRadius: 12, marginBottom: 14 }} />
          <h2 style={{ margin: '0 0 4px' }}>{title}</h2>
          {sub && <div style={{ fontSize: 13, color: 'var(--slate-500)' }}>{sub}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/* Campo de contraseña con botón para mostrar / ocultar */
function PasswordInput({ value, onChange, autoComplete = 'current-password', ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" type={show ? 'text' : 'password'} autoComplete={autoComplete}
        value={value} onChange={onChange} style={{ paddingRight: 44, width: '100%' }} {...rest} />
      <button type="button" onClick={() => setShow(s => !s)}
        title={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}>
        <Icon name={show ? 'eyeOff' : 'eye'} style={{ width: 18, height: 18 }} />
      </button>
    </div>
  );
}

const AUTH_ERRORS = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de entrar.',
};
const authMsg = (e) => AUTH_ERRORS[e?.message] || e?.message || 'No se pudo completar la operación.';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'error' | 'ok', text }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg({ type: 'error', text: authMsg(error) });
  };
  const forgot = async () => {
    if (!email.trim()) { setMsg({ type: 'error', text: 'Escribe tu correo y vuelve a presionar "¿Olvidaste tu contraseña?".' }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    setMsg(error ? { type: 'error', text: authMsg(error) } : { type: 'ok', text: 'Te enviamos un correo con un enlace para crear una nueva contraseña.' });
  };

  return (
    <AuthCard title="Club Natación Lo Prado" sub="Ingresa con tu cuenta de entrenador">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Correo"><input className="input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
        <Field label="Contraseña"><PasswordInput value={password} onChange={e => setPassword(e.target.value)} required /></Field>
        {msg && <div style={{ fontSize: 13, color: msg.type === 'error' ? 'var(--red)' : 'var(--green)' }}>{msg.text}</div>}
        <Button type="submit" disabled={busy}>{busy ? 'Ingresando…' : 'Entrar'}</Button>
        <button type="button" onClick={forgot} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--cyan-700)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          ¿Olvidaste tu contraseña?
        </button>
      </form>
    </AuthCard>
  );
}

function SetPassword({ onDone }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (p1.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (p1 !== p2) { setErr('Las contraseñas no coinciden.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) setErr(authMsg(error)); else onDone();
  };
  return (
    <AuthCard title="Crea tu contraseña" sub="La usarás para entrar a la plataforma">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nueva contraseña"><PasswordInput autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} required /></Field>
        <Field label="Repite la contraseña"><PasswordInput autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} required /></Field>
        {err && <div style={{ fontSize: 13, color: 'var(--red)' }}>{err}</div>}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</Button>
      </form>
    </AuthCard>
  );
}

function NotMember({ email, detail }) {
  return (
    <AuthCard title="Cuenta sin acceso" sub={email}>
      <p style={{ fontSize: 13.5, color: 'var(--slate-500)', lineHeight: 1.5, marginTop: 0 }}>
        Tu cuenta existe, pero todavía no está autorizada para ver los datos del club.
        Pide al administrador que agregue tu correo a la lista de entrenadores.
      </p>
      {detail && <p style={{ fontSize: 12, color: 'var(--slate-400)' }}>Detalle: {detail}</p>}
      <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
    </AuthCard>
  );
}

function Root() {
  // boot | login | set-password | denied | app
  const [phase, setPhase] = useState('boot');
  const [denied, setDenied] = useState({ email: '', detail: '' });
  const currentUser = useRef(null);

  const enter = useCallback(async (session) => {
    if (!session) {
      currentUser.current = null;
      DB.teardown();
      setPhase('login');
      return;
    }
    if (mustSetPassword) { setPhase('set-password'); return; }
    if (currentUser.current === session.user.id) return; // ya dentro
    const { data: ok, error } = await supabase.rpc('is_club_member');
    const offline = error && !navigator.onLine;
    if (!offline && (error || !ok)) {
      DB.teardown();
      setDenied({ email: session.user.email || '', detail: error ? error.message : '' });
      setPhase('denied');
      return;
    }
    currentUser.current = session.user.id;
    await DB.init(session.user.id);
    setPhase('app');
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      DB.init('local').then(() => setPhase('app'));
      return;
    }
    let cancelled = false;
    // Las llamadas a Supabase dentro del callback se difieren (evita bloqueos de supabase-js).
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled || event === 'INITIAL_SESSION') return;
      if (event === 'PASSWORD_RECOVERY') { mustSetPassword = true; setPhase('set-password'); return; }
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => enter(s), 0);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) enter(session);
    });
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, [enter]);

  if (phase === 'boot') return <Splash />;
  if (phase === 'login') return <Login />;
  if (phase === 'set-password') {
    return <SetPassword onDone={async () => {
      mustSetPassword = false;
      window.history.replaceState(null, '', window.location.pathname);
      const { data: { session } } = await supabase.auth.getSession();
      currentUser.current = null;
      enter(session);
    }} />;
  }
  if (phase === 'denied') return <NotMember {...denied} />;
  return <Shell />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </ErrorBoundary>
  );
}
