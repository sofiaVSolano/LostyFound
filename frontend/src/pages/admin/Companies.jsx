import { useState } from 'react';
import { Plus, Phone, Mail, MapPin, Pencil, Factory, User2 } from 'lucide-react';
import { useApi, useTitle } from '../../hooks/index.js';
import { useAuth, useMeta, useToast } from '../../context/AppContext.jsx';
import { api, patch } from '../../lib/api.js';
import { ChipGroup, Dialog, EmptyState, ErrorNote, Field, Loading, PageHead } from '../../components/ui.jsx';
import { AdminNav } from '../../components/admin.jsx';

const EMPTY = { name: '', nit: '', contactName: '', phone: '', email: '', address: '', materials: [] };

/** HU-14: registro de empresas de reciclaje vinculadas. */
export default function Companies() {
  useTitle('Empresas de reciclaje');
  const meta = useMeta();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/admin/companies');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const open = (c) => {
    setErrors({});
    setForm(c ? { name: c.name, nit: c.nit ?? '', contactName: c.contact_name ?? '', phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', materials: c.materials } : EMPTY);
    setEditing(c ?? 'new');
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing === 'new') await api('/admin/companies', { method: 'POST', body: form });
      else await api(`/admin/companies/${editing.id}`, { method: 'PATCH', body: form });
      toast({ title: editing === 'new' ? 'Empresa registrada' : 'Empresa actualizada', body: form.name, tone: 'match' });
      setEditing(null);
      reload();
    } catch (err) { setErrors({ ...err.fields, form: err.message }); }
  };
  const toggleActive = async (c) => {
    await patch(`/admin/companies/${c.id}`, { active: !c.active });
    reload();
  };

  return (
    <div className="shell page admin">
      <AdminNav />
      <PageHead
        eyebrow="HU-14" title={<>Empresas <span className="serif">vinculadas</span></>}
        actions={isAdmin && <button className="btn btn-primary btn-sm" onClick={() => open(null)}><Plus aria-hidden="true" /> Registrar empresa</button>}
      >
        Entidades autorizadas por la Universidad para recibir objetos reciclables, con los materiales que acepta cada una.
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : !data?.companies.length ? (
        <EmptyState title="Sin empresas registradas" art="card">Registra la primera empresa vinculada para poder asignar objetos reciclables.</EmptyState>
      ) : (
        <ul className="company-grid">
          {data.companies.map((c) => (
            <li key={c.id} className={`company card ${c.active ? '' : 'is-inactive'}`}>
              <div className="spread">
                <span className="company-ico" aria-hidden="true"><Factory /></span>
                <span className={`badge ${c.active ? 'badge-ok' : ''}`}>{c.active ? 'Activa' : 'Inactiva'}</span>
              </div>
              <h2 className="company-name">{c.name}</h2>
              {c.nit && <span className="mono muted small">NIT {c.nit}</span>}
              <ul className="company-contact">
                {c.contact_name && <li><User2 aria-hidden="true" /> {c.contact_name}</li>}
                {c.phone && <li><Phone aria-hidden="true" /> <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a></li>}
                {c.email && <li><Mail aria-hidden="true" /> <a href={`mailto:${c.email}`}>{c.email}</a></li>}
                {c.address && <li><MapPin aria-hidden="true" /> {c.address}</li>}
              </ul>
              <ul className="tag-common" aria-label="Materiales que recibe">{c.materials.map((m) => <li key={m}>{meta?.materialById[m]?.label}</li>)}</ul>
              <div className="company-stats">
                <span><strong>{c.assigned}</strong> asignados</span>
                <span><strong>{c.disposed}</strong> reciclados</span>
              </div>
              {isAdmin && (
                <div className="row">
                  <button className="btn btn-sm btn-outline" onClick={() => open(c)}><Pencil aria-hidden="true" /> Editar</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(c)}>{c.active ? 'Desactivar' : 'Activar'}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Registrar empresa' : 'Editar empresa'}>
        <form className="stack" onSubmit={save} noValidate>
          {errors.form && <div className="error-note" role="alert">{errors.form}</div>}
          <Field label="Nombre de la empresa" error={errors.name}>{(p) => <input {...p} className="input" value={form.name} onChange={set('name')} />}</Field>
          <div className="grid-2">
            <Field label="NIT" optional>{(p) => <input {...p} className="input mono" value={form.nit} onChange={set('nit')} />}</Field>
            <Field label="Persona de contacto" optional>{(p) => <input {...p} className="input" value={form.contactName} onChange={set('contactName')} />}</Field>
            <Field label="Teléfono" error={errors.phone}>{(p) => <input {...p} className="input" type="tel" value={form.phone} onChange={set('phone')} />}</Field>
            <Field label="Correo" error={errors.email}>{(p) => <input {...p} className="input" type="email" value={form.email} onChange={set('email')} />}</Field>
          </div>
          <Field label="Dirección" optional>{(p) => <input {...p} className="input" value={form.address} onChange={set('address')} />}</Field>
          {meta && <ChipGroup legend="Materiales que recibe" multiple options={meta.materials} value={form.materials} onChange={set('materials')} error={errors.materials} />}
          <button className="btn btn-primary">{editing === 'new' ? 'Registrar' : 'Guardar cambios'}</button>
        </form>
      </Dialog>
    </div>
  );
}
