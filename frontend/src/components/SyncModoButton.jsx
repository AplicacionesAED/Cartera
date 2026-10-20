// Botón de sincronización con selector de modo (botón dividido): el botón principal ejecuta el modo elegido y la
// flecha abre la lista para cambiarlo. Ej.: "Sincronizar cambios" (por defecto) / "Sincronizar todo".
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ChevronDown, Check } from 'lucide-react';
import { Button } from './ui/Button.jsx';
import styles from './SyncModoButton.module.css';

// Modos de las sincronizaciones de Oliv (HubSpot).
export const MODOS_SYNC_OLIV = [
  { value: 'cambios', label: 'Sincronizar cambios', descripcion: 'Trae solo lo que cambió en HubSpot desde la última sincronización (rápido).' },
  { value: 'todo', label: 'Sincronizar todo', descripcion: 'Vuelve a traer todo lo que cumple la regla y quita lo que ya no la cumple (tarda más).' },
];

// opciones: [{ value, label, descripcion }]
export function SyncModoButton({ opciones, modo, onModo, onEjecutar, disabled = false }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const actual = opciones.find((o) => o.value === modo) ?? opciones[0];

  useEffect(() => {
    if (!abierto) return undefined;
    function cerrar(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  return (
    <div className={styles.grupo} ref={ref}>
      <Button variant="secondary" onClick={() => onEjecutar(actual.value)} disabled={disabled}>
        <span className={styles.interior}>
          <RefreshCw size={14} aria-hidden="true" />
          {actual.label}
        </span>
      </Button>
      <button
        type="button"
        className={styles.flecha}
        onClick={() => setAbierto((a) => !a)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Elegir tipo de sincronización"
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {abierto && (
        <div className={styles.menu} role="menu">
          {opciones.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === actual.value}
              className={styles.opcion}
              onClick={() => {
                onModo(o.value);
                setAbierto(false);
              }}
            >
              <span className={styles.opcionTitulo}>
                {o.label}
                {o.value === actual.value && <Check size={14} aria-hidden="true" />}
              </span>
              {o.descripcion && <span className={styles.opcionDesc}>{o.descripcion}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
