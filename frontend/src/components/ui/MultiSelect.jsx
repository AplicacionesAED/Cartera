// Filtro de selección MÚLTIPLE: un campo que se ve como un <select>, pero al abrirlo muestra una lista con casillas para
// marcar varias opciones a la vez (con buscador cuando la lista es larga, "Seleccionar todo" y "Limpiar").
//
// Se usa dentro de <Field> igual que <Select>:
//   <Field label="Etapa">{(p) => <MultiSelect {...p} options={etapas} value={filtros.etapa} onChange={(v) => actualizarFiltro('etapa', v)} placeholder="Todas las etapas" />}</Field>
//
// `options`: ['A', 'B'] o [{ value, label }]. `value`: arreglo de valores (vacío = sin filtro, es decir "todos").
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import fieldStyles from './Field.module.css';
import styles from './MultiSelect.module.css';

const normalizar = (o) => (o !== null && typeof o === 'object' ? { value: String(o.value), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) });

export function MultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = 'Todos',
  disabled = false,
  searchPlaceholder = 'Buscar…',
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const ref = useRef(null);

  const opciones = useMemo(() => options.map(normalizar), [options]);
  const seleccion = useMemo(() => new Set((Array.isArray(value) ? value : value ? [value] : []).map(String)), [value]);
  const etiquetaDe = useMemo(() => new Map(opciones.map((o) => [o.value, o.label])), [opciones]);

  useEffect(() => {
    if (!abierto) return undefined;
    function cerrarFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    function cerrarEscape(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', cerrarFuera);
    document.addEventListener('keydown', cerrarEscape);
    return () => {
      document.removeEventListener('mousedown', cerrarFuera);
      document.removeEventListener('keydown', cerrarEscape);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) setConsulta('');
  }, [abierto]);

  const visibles = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    return q ? opciones.filter((o) => o.label.toLowerCase().includes(q)) : opciones;
  }, [opciones, consulta]);

  const hayBuscador = opciones.length > 8;
  const marcadas = [...seleccion];

  function alternar(v) {
    const sig = new Set(seleccion);
    if (sig.has(v)) sig.delete(v);
    else sig.add(v);
    // Se conserva el orden de las opciones.
    onChange(opciones.map((o) => o.value).filter((x) => sig.has(x)));
  }

  function resumen() {
    if (marcadas.length === 0) return <span className={styles.placeholder}>{placeholder}</span>;
    const nombres = marcadas.map((v) => etiquetaDe.get(v) ?? v);
    if (nombres.length <= 2) return <span className={styles.valor}>{nombres.join(', ')}</span>;
    return (
      <span className={styles.valor}>
        {nombres[0]}, {nombres[1]}<span className={styles.mas}>+{nombres.length - 2}</span>
      </span>
    );
  }

  const todasVisiblesMarcadas = visibles.length > 0 && visibles.every((o) => seleccion.has(o.value));

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        id={id}
        className={`${fieldStyles.control} ${styles.disparador} ${marcadas.length > 0 ? styles.conSeleccion : ''}`}
        onClick={() => !disabled && setAbierto((a) => !a)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      >
        {resumen()}
        {marcadas.length > 0 && <span className={styles.contador}>{marcadas.length}</span>}
        <ChevronDown size={16} className={`${styles.flecha} ${abierto ? styles.flechaAbierta : ''}`} aria-hidden="true" />
      </button>

      {abierto && (
        <div className={styles.panel} role="listbox" aria-multiselectable="true">
          {hayBuscador && (
            <div className={styles.buscador}>
              <input type="text" className={fieldStyles.control} value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder={searchPlaceholder} autoFocus />
            </div>
          )}
          <div className={styles.acciones}>
            <button
              type="button"
              className={styles.accion}
              onClick={() => {
                const sig = new Set(seleccion);
                if (todasVisiblesMarcadas) visibles.forEach((o) => sig.delete(o.value));
                else visibles.forEach((o) => sig.add(o.value));
                onChange(opciones.map((o) => o.value).filter((x) => sig.has(x)));
              }}
              disabled={visibles.length === 0}
            >
              {todasVisiblesMarcadas ? 'Quitar todas' : 'Seleccionar todas'}
            </button>
            <button type="button" className={styles.accion} onClick={() => onChange([])} disabled={marcadas.length === 0}>
              Limpiar
            </button>
          </div>
          {/* data-lenis-prevent: el scroll de la página no debe robarle la rueda a esta lista. */}
          <div className={styles.lista} data-lenis-prevent>
            {visibles.length === 0 && <div className={styles.vacio}>Sin opciones</div>}
            {visibles.map((o) => {
              const marcada = seleccion.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={marcada}
                  className={`${styles.opcion} ${marcada ? styles.opcionMarcada : ''}`}
                  onClick={() => alternar(o.value)}
                >
                  <span className={`${styles.caja} ${marcada ? styles.cajaMarcada : ''}`} aria-hidden="true">
                    {marcada && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className={styles.texto}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
