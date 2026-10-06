import { useState } from 'react';
import { Plus, Pencil, Timer } from 'lucide-react';
import { useApi, useTitle } from '../../hooks/index.js';
import { useAuth, useMeta, useToast } from '../../context/AppContext.jsx';
import { api } from '../../lib/api.js';
import { CategoryIcon, Dialog, ErrorNote, Field, Loading, PageHead } from '../../components/ui.jsx';
import { AdminNav } from '../../components/admin.jsx';

const EMPTY = { name: '', category: '', days: 60, description: '' };

/** HU-12: políticas de vencimiento por categoría. */
export default function Policies() {
  useTitle('Políticas de vencimiento');
  const meta = useMeta();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/admin/policies');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const open = (p) => {
    setErrors({});
    setForm(p ? { name: p.name, category: p.category ?? '', days: p.days, description: p.description } : EMPTY);
    setEditing(p ?? 'new');
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, days: Number(form.days) };
      if (editing === 'new') await api('/admin/policies', { method: 'POST', body });
      else await api(`/admin/policies/${editing.id}`, { method: 'PATCH', body });
      toast({ title: 'Política guardada', body: 'Las fechas límite de los objetos afectados se recalcularon.', tone: 'match' });
      setEditing(null);
      reload();
    } catch (err) { setErrors({ ...(err.fields ?? {}), form: err.message }); }
  };

  return (
    <div className="shell page admin">
      <AdminNav />
      <PageHead
        eyebrow="HU-12" title={<>Políticas de <span className="serif">vencimiento</span></>}
        actions={isAdmin && <button className="btn btn-primary btn-sm" onClick={() => open(null)}><Plus aria-hidden="true" /> Nueva política</button>}
      >
        Cada objeto que ingresa a custodia recibe la política de su categoría (o la general). Al cumplirse, se genera una alerta automática.
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <ul className="policy-list">
          {data?.policies.map((p) => (
            <li key={p.id} className="policy card">
              <div className="policy-days"><strong>{p.days}</strong><span>días</span></div>
              <div className="grow">
                <h2 className="policy-name">{p.name}</h2>
                <p className="muted small">{p.description}</p>
                <div className="row" style={{ '--gap': '8px' }}>
                  <span className="badge badge-accent">
                    {p.category ? <><CategoryIcon id={p.category} /> {meta?.categoryById[p.category]?.label}</> : <><Timer aria-hidden="true" /> Todas las categorías</>}
                  </span>
                  <span className="badge">{p.items} {p.items === 1 ? 'objeto' : 'objetos'}</span>
                </div>
              </div>
              {isAdmin && <button className="icon-btn" onClick={() => open(p)} aria-label={`Editar ${p.name}`}><Pencil /></button>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva política' : 'Editar política'} size="sm">
        <form className="stack" onSubmit={save} noValidate>
          {errors.form && <div className="error-note" role="alert">{errors.form}</div>}
          <Field label="Nombre" error={errors.name}>{(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Categoría a la que aplica">
            {(p) => (
              <select {...p} className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">General (todas)</option>
                {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Días de permanencia" error={errors.days} hint="Entre 1 y 365 días desde el ingreso a custodia.">
            {(p) => <input {...p} type="number" min={1} max={365} className="input" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />}
          </Field>
          <Field label="Descripción" optional>{(p) => <textarea {...p} className="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <button className="btn btn-primary">Guardar</button>
        </form>
      </Dialog>
    </div>
  );
}
