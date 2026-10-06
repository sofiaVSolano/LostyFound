import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wand2, Recycle, Factory, CheckCircle2, HeartHandshake, Milk, PackageCheck } from 'lucide-react';
import { useApi, useTitle } from '../../hooks/index.js';
import { useAuth, useMeta, useToast } from '../../context/AppContext.jsx';
import { post } from '../../lib/api.js';
import { dateShort, toLocalInput } from '../../lib/format.js';
import { Dialog, EmptyState, ErrorNote, Field, ItemArt, Loading, PageHead, StatusBadge, TabPanel, Tabs } from '../../components/ui.jsx';
import { AdminNav } from '../../components/admin.jsx';

/* ── HU-13 / HU-16: clasificación por material ── */
function ClassifyRow({ item, onDone }) {
  const meta = useMeta();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [material, setMaterial] = useState(item.material ?? item.suggestedMaterial ?? '');
  const [recyclable, setRecyclable] = useState(true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await post(`/admin/items/${item.id}/classify`, { material, recyclable });
      toast({ title: recyclable ? 'Listo para asignar' : 'Clasificación guardada', body: `${item.title} · ${meta.materialById[material].label}`, tone: 'match' });
      onDone();
    } catch (err) { toast({ title: 'No se pudo clasificar', body: err.message, tone: 'error' }); } finally { setBusy(false); }
  };
  const donate = async () => {
    try {
      await post(`/admin/items/${item.id}/dispose`, { outcome: 'donado' });
      toast({ title: 'Donación registrada', body: item.title, tone: 'match' });
      onDone();
    } catch (err) { toast({ title: 'No se pudo registrar', body: err.message, tone: 'error' }); }
  };

  return (
    <li className="rc-row card">
      <ItemArt item={item} className="rc-art" />
      <div className="rc-main">
        <div className="row" style={{ '--gap': '8px' }}>
          <Link to={`/objetos/${item.id}`} className="custody-title">{item.title}</Link>
          <StatusBadge status={item.status} label={item.statusLabel} />
        </div>
        <p className="muted small"><span className="mono">{item.radicado}</span> · {item.custody?.days} días en custodia</p>
        {item.suggestedMaterial && !item.material && (
          <p className="ai-hint small"><Wand2 aria-hidden="true" /> Sugerido por la descripción: <strong>{meta?.materialById[item.suggestedMaterial]?.label}</strong></p>
        )}
      </div>
      {isAdmin && (
        <div className="rc-controls">
          <label>
            <span className="sr-only">Material de {item.title}</span>
            <select className="select select-sm" value={material} onChange={(e) => setMaterial(e.target.value)}>
              <option value="">Material…</option>
              {meta?.materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={recyclable} onChange={(e) => setRecyclable(e.target.checked)} /> Apto para reciclaje
          </label>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={!material || busy}>Guardar</button>
          {item.status === 'en_disposicion' && <button className="btn btn-sm btn-ok" onClick={donate}><HeartHandshake aria-hidden="true" /> Registrar donación</button>}
        </div>
      )}
    </li>
  );
}

/* ── HU-15: asignación a empresa ── */
function AssignPanel({ items, companies, onDone }) {
  const meta = useMeta();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [material, setMaterial] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [company, setCompany] = useState('');
  const visible = items.filter((i) => !material || i.material === material);
  const chosen = visible.filter((i) => selected.has(i.id));
  const materialsOfChosen = new Set(chosen.map((i) => i.material));
  const compatible = companies.filter((c) => c.active && [...materialsOfChosen].every((m) => c.materials.includes(m)));
  useEffect(() => { if (company && !compatible.some((c) => String(c.id) === company)) setCompany(''); }, [compatible, company]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const assign = async () => {
    try {
      const r = await post('/admin/items/assign-batch', { itemIds: chosen.map((i) => i.id), companyId: Number(company) });
      const name = companies.find((c) => String(c.id) === company)?.name;
      toast({ title: `${r.assigned.length} ${r.assigned.length === 1 ? 'objeto asignado' : 'objetos asignados'}`, body: `a ${name}${r.skipped.length ? ` · ${r.skipped.length} omitidos` : ''}`, tone: 'match' });
      setSelected(new Set());
      onDone();
    } catch (err) { toast({ title: 'No se pudo asignar', body: err.message, tone: 'error' }); }
  };

  if (!items.length) return <EmptyState title="Nada listo para asignar" art="card">Clasifica objetos como aptos para reciclaje en la pestaña anterior.</EmptyState>;
  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="Filtrar por material">
        <button className="chip chip-sm" aria-pressed={!material} onClick={() => setMaterial('')}>Todos</button>
        {[...new Set(items.map((i) => i.material))].map((m) => (
          <button key={m} className="chip chip-sm" aria-pressed={material === m} onClick={() => setMaterial(m)}>
            {m === 'plastico' && <Milk aria-hidden="true" />}{meta?.materialById[m]?.label}
          </button>
        ))}
      </div>
      <ul className="assign-list">
        {visible.map((it) => (
          <li key={it.id}>
            <label className={`assign-item card ${selected.has(it.id) ? 'is-selected' : ''}`}>
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} disabled={!isAdmin} />
              <ItemArt item={it} className="rc-art" />
              <span className="grow"><strong>{it.title}</strong><span className="muted small">{it.materialLabel} · {it.radicado}</span></span>
            </label>
          </li>
        ))}
      </ul>
      {isAdmin && (
        <div className="assign-bar card">
          <span><strong>{chosen.length}</strong> seleccionados</span>
          <label className="grow">
            <span className="sr-only">Empresa de reciclaje</span>
            <select className="select select-sm" value={company} onChange={(e) => setCompany(e.target.value)} disabled={!chosen.length}>
              <option value="">{chosen.length ? (compatible.length ? 'Elige una empresa compatible…' : 'Ninguna empresa recibe todos esos materiales') : 'Selecciona objetos primero'}</option>
              {compatible.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.materials.map((m) => meta?.materialById[m]?.label).join(', ')}</option>)}
            </select>
          </label>
          <button className="btn btn-sm btn-primary" onClick={assign} disabled={!company || !chosen.length}><Factory aria-hidden="true" /> Asignar</button>
        </div>
      )}
    </div>
  );
}

/* ── HU-17: disposición final ── */
function DisposeDialog({ assignment, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ date: toLocalInput(), certificate: '', notes: '' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await post(`/admin/items/${assignment.item_id}/dispose`, { outcome: 'reciclado', ...form, date: new Date(form.date).toISOString() });
      toast({ title: 'Disposición final registrada', body: `${assignment.title} → Reciclado`, tone: 'match' });
      onDone();
    } catch (err) { setError(err.message); }
  };
  return (
    <Dialog open={!!assignment} onClose={onClose} title="Registrar disposición final" size="sm">
      {assignment && (
        <form className="stack" onSubmit={submit}>
          <p><strong>{assignment.title}</strong> entregado a <strong>{assignment.company_name}</strong>.</p>
          <Field label="Fecha de entrega a la empresa" error={error}>
            {(p) => <input {...p} type="datetime-local" className="input" value={form.date} max={toLocalInput()} onChange={(e) => setForm({ ...form, date: e.target.value })} />}
          </Field>
          <Field label="Número de certificado" optional>
            {(p) => <input {...p} className="input mono" value={form.certificate} onChange={(e) => setForm({ ...form, certificate: e.target.value })} placeholder="CERT-…" />}
          </Field>
          <Field label="Observaciones" optional>
            {(p) => <textarea {...p} className="textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}
          </Field>
          <button className="btn btn-primary"><CheckCircle2 aria-hidden="true" /> Marcar como reciclado</button>
        </form>
      )}
    </Dialog>
  );
}

export default function Recycling() {
  useTitle('Reciclaje');
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('classify');
  const [plasticOnly, setPlasticOnly] = useState(false);
  const [disposing, setDisposing] = useState(null);
  const candidates = useApi(`/admin/recycling/candidates${plasticOnly ? '?material=plastico' : ''}`);
  const available = useApi('/admin/recycling/available');
  const companies = useApi('/admin/companies');
  const assignments = useApi('/admin/assignments');
  const reloadAll = () => { candidates.reload(); available.reload(); assignments.reload(); companies.reload(); };

  const pending = useMemo(() => assignments.data?.assignments.filter((a) => !a.disposed_at) ?? [], [assignments.data]);
  const done = useMemo(() => assignments.data?.assignments.filter((a) => a.disposed_at) ?? [], [assignments.data]);

  return (
    <div className="shell page admin">
      <AdminNav />
      <PageHead eyebrow="HU-13 a HU-17" title={<>Reciclaje y <span className="serif">disposición final</span></>}>
        Clasifica por material los objetos no reclamados, asígnalos a empresas vinculadas y registra su destino con trazabilidad.
      </PageHead>
      <ol className="flow" aria-label="Flujo de disposición">
        <li className={tab === 'classify' ? 'is-on' : ''}><span>1</span> Clasificar</li>
        <li className={tab === 'assign' ? 'is-on' : ''}><span>2</span> Asignar</li>
        <li className={tab === 'dispose' ? 'is-on' : ''}><span>3</span> Disponer</li>
        <li className={tab === 'history' ? 'is-on' : ''}><span>4</span> Trazabilidad</li>
      </ol>
      <Tabs
        label="Etapas de reciclaje" value={tab} onChange={setTab}
        tabs={[
          { id: 'classify', label: 'Por clasificar', count: candidates.data?.items.length },
          { id: 'assign', label: 'Listos para asignar', count: available.data?.items.length },
          { id: 'dispose', label: 'Asignados', count: pending.length },
          { id: 'history', label: 'Histórico', count: done.length },
        ]}
      />
      <TabPanel id={tab}>
        {tab === 'classify' && (
          <>
            <div className="spread">
              <p className="muted small">Objetos que superaron el plazo de custodia o su política. El material se sugiere automáticamente a partir de la descripción.</p>
              <button className="chip chip-sm" aria-pressed={plasticOnly} onClick={() => setPlasticOnly((p) => !p)}><Milk aria-hidden="true" /> Solo plásticos (termos, botellas…)</button>
            </div>
            <ErrorNote error={candidates.error} onRetry={candidates.reload} />
            {candidates.loading && !candidates.data ? <Loading /> : candidates.data?.items.length ? (
              <ul className="rc-list">{candidates.data.items.map((it) => <ClassifyRow key={it.id} item={it} onDone={reloadAll} />)}</ul>
            ) : <EmptyState title={plasticOnly ? 'Sin plásticos pendientes' : 'Nada por clasificar'} art="card">Cuando un objeto supere el tiempo máximo en custodia aparecerá aquí.</EmptyState>}
          </>
        )}
        {tab === 'assign' && (available.loading && !available.data ? <Loading /> : <AssignPanel items={available.data?.items ?? []} companies={companies.data?.companies ?? []} onDone={reloadAll} />)}
        {tab === 'dispose' && (
          pending.length ? (
            <ul className="rc-list">
              {pending.map((a) => (
                <li key={a.id} className="rc-row card">
                  <ItemArt item={{ ...a, photos: a.photos, categoryLabel: a.category }} className="rc-art" />
                  <div className="rc-main">
                    <Link to={`/objetos/${a.item_id}`} className="custody-title">{a.title}</Link>
                    <p className="muted small"><Factory aria-hidden="true" className="inline-ico" /> {a.company_name} · asignado el {dateShort(a.assigned_at)} · {a.materialLabel}</p>
                  </div>
                  {isAdmin && <button className="btn btn-sm btn-primary" onClick={() => setDisposing(a)}><PackageCheck aria-hidden="true" /> Registrar entrega</button>}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Sin asignaciones pendientes" art="card">Las asignaciones a empresas aparecerán aquí hasta que registres su disposición final.</EmptyState>
        )}
        {tab === 'history' && (
          done.length ? (
            <div className="table-wrap card">
              <table className="table">
                <caption className="sr-only">Histórico de disposición final</caption>
                <thead><tr><th scope="col">Objeto</th><th scope="col">Material</th><th scope="col">Empresa</th><th scope="col">Asignado</th><th scope="col">Dispuesto</th><th scope="col">Certificado</th></tr></thead>
                <tbody>
                  {done.map((a) => (
                    <tr key={a.id}>
                      <th scope="row"><Link to={`/objetos/${a.item_id}`}>{a.title}</Link><br /><span className="mono muted small">{a.radicado}</span></th>
                      <td>{a.materialLabel}</td><td>{a.company_name}</td><td>{dateShort(a.assigned_at)}</td><td>{dateShort(a.disposed_at)}</td>
                      <td className="mono">{a.certificate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="Aún sin registros" art="card">Cada disposición final quedará aquí y en el historial inmutable del objeto.</EmptyState>
        )}
      </TabPanel>
      <DisposeDialog assignment={disposing} onClose={() => setDisposing(null)} onDone={() => { setDisposing(null); reloadAll(); }} />
    </div>
  );
}
