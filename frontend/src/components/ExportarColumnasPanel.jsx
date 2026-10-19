// Panel para elegir QUÉ columnas se exportan a Excel (Inmuebles de Baía Kristal y de Oliv).
// Al abrirse carga los datos con los filtros activos del listado (para saber qué columnas existen de
// verdad y no volver a pedirlos al exportar), muestra las columnas agrupadas por sección con
// buscador y "marcar todas / ninguna", y deja marcada por defecto solo la que se indique.
//
//   <ExportarColumnasPanel
//     open onClose titulo="Exportar inmuebles"
//     cargarDatos={() => Promise<items[]>}
//     construirGrupos={(items) => [{ id, titulo, columnas: [{ key, label }] }]}
//     seleccionInicial={['nomenclaturaCompleta']}
//     onExportar={(items, keysSeleccionadas) => Promise}
//   />
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal } from './ui/Modal.jsx';
import { Button } from './ui/Button.jsx';
import { Checkbox } from './ui/Checkbox.jsx';
import styles from './ExportarColumnasPanel.module.css';

const sinTildes = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ExportarColumnasPanel({ open, onClose, titulo, descripcion, cargarDatos, construirGrupos, seleccionInicial, onExportar }) {
  const [items, setItems] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [seleccion, setSeleccion] = useState(() => new Set(seleccionInicial));
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState(null);
  const cargaRef = useRef(0);

  // Cada vez que se abre: datos frescos (los filtros pudieron cambiar) y selección por defecto.
  useEffect(() => {
    if (!open) return undefined;
    const id = ++cargaRef.current;
    setCargando(true);
    setError(null);
    setBusqueda('');
    setSeleccion(new Set(seleccionInicial));
    cargarDatos()
      .then((datos) => {
        if (id !== cargaRef.current) return;
        setItems(datos);
        setGrupos(construirGrupos(datos));
      })
      .catch((err) => {
        if (id === cargaRef.current) setError(err.message || 'No se pudo cargar la información.');
      })
      .finally(() => {
        if (id === cargaRef.current) setCargando(false);
      });
    return () => { cargaRef.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const todasLasKeys = useMemo(() => grupos.flatMap((g) => g.columnas.map((c) => c.key)), [grupos]);

  const gruposVisibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return grupos;
    return grupos
      .map((g) => ({ ...g, columnas: g.columnas.filter((c) => sinTildes(c.label).includes(q)) }))
      .filter((g) => g.columnas.length > 0);
  }, [grupos, busqueda]);

  function alternar(key) {
    setSeleccion((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(key)) nuevo.delete(key);
      else nuevo.add(key);
      return nuevo;
    });
  }

  function alternarGrupo(g) {
    setSeleccion((prev) => {
      const nuevo = new Set(prev);
      const todasMarcadas = g.columnas.every((c) => nuevo.has(c.key));
      g.columnas.forEach((c) => (todasMarcadas ? nuevo.delete(c.key) : nuevo.add(c.key)));
      return nuevo;
    });
  }

  async function exportar() {
    setExportando(true);
    setError(null);
    try {
      // El orden del Excel es el del panel (no el orden en que se fueron marcando).
      const keys = todasLasKeys.filter((k) => seleccion.has(k));
      await onExportar(items, keys);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo exportar.');
    } finally {
      setExportando(false);
    }
  }

  const cantidad = todasLasKeys.filter((k) => seleccion.has(k)).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      footer={(
        <div className={styles.pie}>
          <span className={styles.contador}>{cantidad} de {todasLasKeys.length} columnas</span>
          <Button variant="secondary" onClick={onClose} disabled={exportando}>Cancelar</Button>
          <Button onClick={exportar} disabled={cargando || exportando || cantidad === 0}>
            <span className={styles.botonInterior}>
              <Download size={14} aria-hidden="true" />
              {exportando ? 'Exportando…' : 'Exportar a Excel'}
            </span>
          </Button>
        </div>
      )}
    >
      {cargando ? (
        <p className={styles.estado}>Cargando información de los inmuebles…</p>
      ) : !items ? (
        <p className={styles.error}>{error || 'No se pudo cargar la información.'}</p>
      ) : (
        <div className={styles.contenido}>
          {descripcion && <p className={styles.descripcion}>{descripcion(items?.length ?? 0)}</p>}
          <div className={styles.herramientas}>
            <input
              type="search"
              className={styles.buscador}
              placeholder="Buscar columna…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar columna"
            />
            <button type="button" className={styles.enlace} onClick={() => setSeleccion(new Set(todasLasKeys))}>Marcar todas</button>
            <button type="button" className={styles.enlace} onClick={() => setSeleccion(new Set())}>Desmarcar todas</button>
          </div>
          <div className={styles.lista}>
            {gruposVisibles.length === 0 && <p className={styles.estado}>Ninguna columna coincide con la búsqueda.</p>}
            {gruposVisibles.map((g) => {
              const marcadas = g.columnas.filter((c) => seleccion.has(c.key)).length;
              return (
                <div key={g.id} className={styles.grupo}>
                  <div className={styles.grupoCabecera}>
                    <Checkbox
                      label={<strong>{g.titulo}</strong>}
                      checked={marcadas === g.columnas.length}
                      onChange={() => alternarGrupo(g)}
                    />
                    <span className={styles.grupoConteo}>{marcadas}/{g.columnas.length}</span>
                  </div>
                  <div className={styles.columnas}>
                    {g.columnas.map((c) => (
                      <Checkbox key={c.key} label={c.label} checked={seleccion.has(c.key)} onChange={() => alternar(c.key)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </Modal>
  );
}
