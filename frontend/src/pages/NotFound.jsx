import { Link } from 'react-router-dom';
import { useTitle } from '../hooks/index.js';

export default function NotFound() {
  useTitle('Página perdida');
  return (
    <div className="shell page notfound">
      <div className="nf-tag" aria-hidden="true">
        <span className="tag-hole" />
        <span className="mono">LF-404-PAGE-??</span>
        <strong>Página web</strong>
        <small>Última vez vista: en algún enlace roto</small>
      </div>
      <h1 tabIndex={-1}>Esta página <span className="serif">también se perdió.</span></h1>
      <p className="muted">Ya activamos el sonar, pero no aparece en ninguna zona del campus.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link to="/inicio" className="btn btn-primary">Volver al inicio</Link>
        <Link to="/explorar" className="btn btn-outline">Explorar objetos</Link>
      </div>
    </div>
  );
}
