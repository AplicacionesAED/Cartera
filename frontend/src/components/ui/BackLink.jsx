import { Link, useLocation, useNavigate } from 'react-router-dom';
import styles from './BackLink.module.css';

// Toda ruta a la que se entra "drilling down" (un :id concreto, no una
// pestaña hermana) debe traer uno de estos en el header -- el sidebar
// nunca es la unica forma de volver (ver DESIGN.md, Navigation).
//
// Si el usuario llegó a esta pantalla navegando dentro de la app (location.key !== 'default'), "volver" retrocede en
// el historial: así regresa a donde estaba (Movimientos, una tarjeta del detalle de otra pantalla, etc.) con sus
// filtros intactos. Con la pantalla abierta directo (enlace/recarga) cae al destino fijo `to`.
export function BackLink({ to, children }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  const hayHistorial = key !== 'default';

  function volver(e) {
    if (!hayHistorial || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(-1);
  }

  return (
    <Link to={to} onClick={volver} className={styles.backLink}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M8.5 3L4 7L8.5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {hayHistorial ? 'Volver' : children}
    </Link>
  );
}
