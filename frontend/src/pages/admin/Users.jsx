import { useApi, useTitle } from '../../hooks/index.js';
import { useAuth, useToast } from '../../context/AppContext.jsx';
import { patch } from '../../lib/api.js';
import { ErrorNote, Loading, PageHead } from '../../components/ui.jsx';
import { AdminNav } from '../../components/admin.jsx';

const ROLES = [['user', 'Comunidad'], ['security', 'Seguridad'], ['admin', 'Administración']];

export default function Users() {
  useTitle('Usuarios');
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/admin/users');
  const change = async (u, role) => {
    try { await patch(`/admin/users/${u.id}`, { role }); toast({ title: 'Rol actualizado', body: `${u.name} · ${ROLES.find((r) => r[0] === role)[1]}` }); reload(); }
    catch (err) { toast({ title: 'No se pudo cambiar', body: err.message, tone: 'error' }); }
  };
  return (
    <div className="shell page admin">
      <AdminNav />
      <PageHead eyebrow="Accesos" title={<>Usuarios y <span className="serif">roles</span></>}>
        Asigna quién puede custodiar objetos (seguridad) y administrar el punto de atención.
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <div className="table-wrap card">
          <table className="table">
            <caption className="sr-only">Usuarios registrados</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col">Correo</th><th scope="col">Alias</th><th scope="col">Verificado</th><th scope="col">Rol</th></tr></thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.id}>
                  <th scope="row">{u.name}</th>
                  <td>{u.email}</td>
                  <td className="muted">{u.alias}</td>
                  <td>{u.verified ? <span className="badge badge-ok">Sí</span> : <span className="badge badge-warn">Pendiente</span>}</td>
                  <td>
                    <label>
                      <span className="sr-only">Rol de {u.name}</span>
                      <select className="select select-sm" value={u.role} disabled={u.id === me.id} onChange={(e) => change(u, e.target.value)}>
                        {ROLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </select>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
