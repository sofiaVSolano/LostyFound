import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, CheckCircle2, ArrowLeft, Inbox, KeyRound, AlertTriangle } from 'lucide-react';
import { useAuth, useToast } from '../context/AppContext.jsx';
import { post } from '../lib/api.js';
import { Field, Logo } from '../components/ui.jsx';
import { useTitle } from '../hooks/index.js';

const DOMAINS = ['correo.usbcali.edu.co', 'usbcali.edu.co'];
const DEMO = [
  ['Estudiante', 'estudiante@correo.usbcali.edu.co'],
  ['Docente', 'docente@usbcali.edu.co'],
  ['Hallador', 'hallador@correo.usbcali.edu.co'],
  ['Seguridad', 'seguridad@usbcali.edu.co'],
  ['Administración', 'admin@usbcali.edu.co'],
];

function EmailField({ value, onChange, error, autoFocus }) {
  const [local, domain = null] = value.split('@');
  const valid = domain != null && DOMAINS.includes(domain.toLowerCase());
  const suggestions = local && !valid ? DOMAINS.filter((d) => domain == null || d.startsWith(domain.toLowerCase())) : [];
  return (
    <Field label="Correo institucional" error={error} hint="Solo @correo.usbcali.edu.co o @usbcali.edu.co">
      {(p) => (
        <>
          <div className="input-wrap">
            <Mail className="lead" aria-hidden="true" />
            <input
              {...p} className="input" type="email" inputMode="email" autoComplete="username" autoFocus={autoFocus}
              value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="tu.nombre@correo.usbcali.edu.co" required
            />
            {valid && <CheckCircle2 className="input-ok" aria-label="Dominio institucional válido" />}
          </div>
          {suggestions.length > 0 && (
            <div className="domain-suggest" aria-label="Completar dominio">
              {suggestions.map((d) => (
                <button type="button" key={d} className="chip chip-sm" onClick={() => onChange(`${local}@${d}`)}>
                  {local}<strong>@{d}</strong>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Field>
  );
}

function PasswordField({ value, onChange, error, label = 'Contraseña', autoComplete = 'current-password', meter = false }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const strength = useMemo(() => {
    let s = 0;
    if (value.length >= 8) s++;
    if (/\d/.test(value) && /[a-zA-Z]/.test(value)) s++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) s++;
    if (/[^a-zA-Z0-9]/.test(value) || value.length >= 12) s++;
    return s;
  }, [value]);
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'];
  return (
    <Field label={label} error={error} hint={meter ? 'Mínimo 8 caracteres, con letras y números.' : undefined}>
      {(p) => (
        <>
          <div className="input-wrap">
            <Lock className="lead" aria-hidden="true" />
            <input
              {...p} className="input" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock'))} onKeyDown={(e) => setCaps(e.getModifierState?.('CapsLock'))}
              required
            />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={show}>
              {show ? <EyeOff /> : <Eye />}
            </button>
          </div>
          {caps && <span className="caps-warn" role="status"><AlertTriangle aria-hidden="true" /> Bloq Mayús está activado</span>}
          {meter && value && (
            <div className="meter" data-level={strength} aria-live="polite">
              <div className="meter-bars" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} />)}</div>
              <span>{labels[strength]}</span>
            </div>
          )}
        </>
      )}
    </Field>
  );
}

function CodeInput({ value, onChange, onComplete, error }) {
  const refs = useRef([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  const set = (i, d) => {
    const arr = digits.slice();
    arr[i] = d;
    const next = arr.join('').replace(/\s+$/, '');
    onChange(next);
    if (next.replace(/\s/g, '').length === 6) onComplete?.(next.replace(/\s/g, ''));
  };
  const onPaste = (e) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!t) return;
    e.preventDefault();
    onChange(t);
    refs.current[Math.min(5, t.length)]?.focus();
    if (t.length === 6) onComplete?.(t);
  };
  return (
    <fieldset className="code-input" aria-describedby={error ? 'code-err' : undefined}>
      <legend className="field-label">Código de 6 dígitos</legend>
      <div className="code-boxes">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            className="code-box mono"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            aria-label={`Dígito ${i + 1}`}
            aria-invalid={error ? true : undefined}
            value={d.trim()}
            onPaste={onPaste}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(-1);
              set(i, v || ' ');
              if (v && i < 5) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
            }}
            autoFocus={i === 0}
          />
        ))}
      </div>
      {error && <span className="field-error" id="code-err" role="alert">{error}</span>}
    </fieldset>
  );
}

export default function Auth({ mode }) {
  const { login, register, verify, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: params.get('email') || '', password: '' });
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState(location.state?.devCode ?? null);
  const [cooldown, setCooldown] = useState(0);
  const autoTried = useRef(false);
  useTitle(mode === 'login' ? 'Ingresar' : mode === 'register' ? 'Crear cuenta' : 'Verificar correo');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (err) => {
    setErrors(err.fields && Object.keys(err.fields).length ? { ...err.fields, form: err.message } : { form: err.message });
  };

  const doVerify = async (c = code) => {
    setBusy(true);
    setErrors({});
    try {
      await verify(form.email || user?.email, c);
      toast({ title: '¡Cuenta verificada!', body: 'Ya puedes reportar y reclamar objetos.', tone: 'match' });
      navigate('/inicio', { replace: true });
    } catch (err) { fail(err); setCode(''); } finally { setBusy(false); }
  };

  // Enlace tokenizado del correo: /verificar?email=…&codigo=…
  useEffect(() => {
    const c = params.get('codigo');
    if (mode === 'verify' && c && form.email && !autoTried.current) {
      autoTried.current = true;
      setCode(c);
      doVerify(c);
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      if (mode === 'login') {
        const d = await login(form.email, form.password);
        if (!d.user.verified) navigate(`/verificar?email=${encodeURIComponent(form.email)}`);
        else navigate(params.get('volver') || '/inicio', { replace: true });
      } else if (mode === 'register') {
        const d = await register(form);
        navigate(`/verificar?email=${encodeURIComponent(form.email)}`, { state: { devCode: d.devCode } });
      } else {
        await doVerify();
      }
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const resend = async () => {
    try {
      const d = await post('/auth/resend', { email: form.email || user?.email });
      setDevCode(d.devCode ?? null);
      setCooldown(30);
      toast({ title: 'Te enviamos un código nuevo', body: 'Revisa tu bandeja institucional (y la carpeta de spam).' });
    } catch (err) { fail(err); }
  };

  const titles = {
    login: ['Bienvenido de vuelta', 'Ingresa con tu correo institucional.'],
    register: ['Crea tu cuenta', 'Solo para la comunidad USB Cali — así todo el mundo es quien dice ser.'],
    verify: ['Revisa tu correo', `Enviamos un código a ${form.email || user?.email || 'tu correo institucional'}.`],
  };

  return (
    <div className="auth">
      <a href="#auth-form" className="skip-link">Saltar al formulario</a>
      <section className="auth-panel">
        <Link to="/" className="brand auth-brand" aria-label="Volver a la portada">
          <Logo /><span className="brand-name">Lost<span className="amp">&amp;</span>Found <em className="serif">Smart</em></span>
        </Link>
        <main className="auth-card" id="auth-form">
          <h1 tabIndex={-1}>{titles[mode][0]}</h1>
          <p className="muted">{titles[mode][1]}</p>
          {errors.form && <div className="error-note" role="alert"><AlertTriangle aria-hidden="true" /> {errors.form}</div>}

          <form onSubmit={submit} className="stack" style={{ '--gap': '18px' }} noValidate>
            {mode === 'register' && (
              <Field label="Nombre completo" error={errors.name}>
                {(p) => (
                  <div className="input-wrap">
                    <User className="lead" aria-hidden="true" />
                    <input {...p} className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
                  </div>
                )}
              </Field>
            )}
            {mode !== 'verify' && (
              <>
                <EmailField value={form.email} onChange={(email) => setForm({ ...form, email })} error={errors.email} autoFocus={mode === 'login'} />
                <PasswordField
                  value={form.password} onChange={(password) => setForm({ ...form, password })} error={errors.password}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'} meter={mode === 'register'}
                />
              </>
            )}
            {mode === 'verify' && (
              <>
                {!form.email && !user && <EmailField value={form.email} onChange={(email) => setForm({ ...form, email })} />}
                <CodeInput value={code} onChange={setCode} onComplete={(c) => doVerify(c)} error={errors.code} />
                {devCode && (
                  <div className="dev-mail" role="note">
                    <Inbox aria-hidden="true" />
                    <span><strong>Buzón de desarrollo:</strong> sin SMTP configurado, tu código es <button type="button" className="mono linkish" onClick={() => { setCode(devCode); doVerify(devCode); }}>{devCode}</button></span>
                  </div>
                )}
              </>
            )}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {mode === 'login' ? 'Ingresar' : mode === 'register' ? 'Crear cuenta' : 'Verificar'}
              {!busy && <ArrowRight aria-hidden="true" />}
            </button>
          </form>

          {mode === 'verify' && (
            <p className="auth-alt">
              ¿No te llegó?{' '}
              <button className="linkish" onClick={resend} disabled={cooldown > 0}>
                {cooldown > 0 ? `Reenviar en ${cooldown} s` : 'Reenviar código'}
              </button>
            </p>
          )}
          {mode === 'login' && <p className="auth-alt">¿Primera vez? <Link to="/registro">Crea tu cuenta</Link></p>}
          {mode === 'register' && <p className="auth-alt">¿Ya tienes cuenta? <Link to="/ingresar">Ingresa</Link></p>}

          {mode === 'login' && (
            <details className="demo-box">
              <summary><KeyRound aria-hidden="true" /> Cuentas de demostración</summary>
              <p className="muted small">Contraseña para todas: <code className="mono">Demo1234*</code></p>
              <div className="chips">
                {DEMO.map(([label, email]) => (
                  <button key={email} type="button" className="chip chip-sm" onClick={() => setForm({ ...form, email, password: 'Demo1234*' })}>{label}</button>
                ))}
              </div>
            </details>
          )}
        </main>
        <Link to="/" className="auth-back"><ArrowLeft aria-hidden="true" /> Volver a la portada</Link>
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-orbit">
          <span className="orbit o1" /><span className="orbit o2" /><span className="orbit o3" />
          <div className="auth-tag">
            <span className="auth-tag-hole" />
            <span className="mono">LF-2026-····-··</span>
            <strong>{mode === 'register' ? (form.name || 'Tu nombre aquí') : 'Tu próximo hallazgo'}</strong>
            <span className="auth-tag-line" />
            <span className="auth-tag-line short" />
          </div>
        </div>
        <blockquote>
          “Perdí mi carnet un lunes. <span className="serif">El martes ya lo tenía.</span>”
          <cite>— Alguien del Bloque C, probablemente</cite>
        </blockquote>
      </aside>
    </div>
  );
}
