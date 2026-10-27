// Pantalla (ruta propia) para elegir QUÉ columnas se exportan a Excel desde Inmuebles -- la comparten
// Baía Kristal (/inventario/exportar) y Oliv (/oliv/inmuebles/exportar), cada una con su configuración.
// Mismo lenguaje que el detalle del inmueble: banner, cifras clave y una tarjeta con buscador y las columnas
// separadas por SECCIONES (las mismas del detalle). Al abrir carga los inmuebles con los filtros que
// tenía el listado (llegan por el estado de la navegación), para saber qué columnas existen de verdad y no volver a
// pedirlos al exportar. Por defecto solo viene marcada la que indique `seleccionInicial`.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, FileSpreadsheet } from 'lucide-react';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { DetalleHero, HeroBadges } from '../../components/layout/DetalleHero.jsx';
import detalle from './InventarioDetallePage.module.css';
import styles from './ExportarInmueblesPage.module.css';

const sinTildes = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ExportarInmueblesPage({ config }) {
  const { titulo, volverA, volverTexto, filtrosVacios, cargarDatos, construirGrupos, exportar, seleccionInicial, subtitulo } = config;
  const navigate = useNavigate();
  // Los filtros del listado llegan por el estado de la navegación (ya no se guardan en el navegador).
  const filtros = useLocation().state?.filtros ?? filtrosVacios;
  const hayFiltros = Object.values(filtros).some((v) => (Array.isArray(v) ? v.length > 0 : v !== ''));

  const [items, setItems] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [seleccion, setSeleccion] = useState(() => new Set(seleccionInicial));
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState(null);
  const filtrosIniciales = useRef(filtros);

  useEffect(() => {
    let vivo = true;
    cargarDatos(filtrosIniciales.current)
      .then((datos) => {
        if (!vivo) return;
        setItems(datos);
        setGrupos(construirGrupos(datos));
      })
      .catch((err) => vivo && setError(err.message || 'No se pudo cargar la información.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todasLasKeys = useMemo(() => grupos.flatMap((g) => g.columnas.map((c) => c.key)), [grupos]);
  const cantidad = todasLasKeys.filter((k) => seleccion.has(k)).length;

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
      const todas = g.columnas.every((c) => nuevo.has(c.key));
      g.columnas.forEach((c) => (todas ? nuevo.delete(c.key) : nuevo.add(c.key)));
      return nuevo;
    });
  }

  async function handleExportar() {
    setExportando(true);
    setError(null);
    try {
      // El orden del Excel es el de las secciones (no el orden en que se fueron marcando).
      await exportar(items, todasLasKeys.filter((k) => seleccion.has(k)));
    } catch (err) {
      setError(err.message || 'No se pudo exportar.');
    } finally {
      setExportando(false);
    }
  }

  const kpis = [
    ['Inmuebles a exportar', items ? items.length.toLocaleString('es-CO') : '…'],
    ['Columnas elegidas', cantidad.toLocaleString('es-CO')],
    ['Columnas disponibles', todasLasKeys.length.toLocaleString('es-CO')],
  ];

  return (
    <div className={styles.pagina}>
      <BackLink to={volverA}>{volverTexto}</BackLink>
      <div className={detalle.detalle}>
        <DetalleHero
          icon={FileSpreadsheet}
          titulo={titulo}
          subtitulo={subtitulo}
          meta={hayFiltros ? 'Se exportan los inmuebles con los filtros activos del listado' : 'Se exportan todos los inmuebles'}
        >
          <HeroBadges>
            <Button variant="secondary" onClick={() => navigate(volverA)}>Cancelar</Button>
          </HeroBadges>
        </DetalleHero>

        <div className={detalle.kpiGrid}>
          {kpis.map(([label, valor]) => (
            <div key={label} className={detalle.kpiCard}>
              <p className={detalle.kpiLabel}>{label}</p>
              <p className={detalle.kpiValor}>{valor}</p>
            </div>
          ))}
        </div>

        <div className={detalle.card}>
          <div className={detalle.cardHeader}>
            <span className={detalle.cardTitulo}>Columnas a exportar</span>
            <span className={detalle.contador}>{cantidad} / {todasLasKeys.length}</span>
            <div className={styles.acciones}>
              <button type="button" className={styles.enlace} onClick={() => setSeleccion(new Set(todasLasKeys))} disabled={cargando}>Marcar todas</button>
              <button type="button" className={styles.enlace} onClick={() => setSeleccion(new Set())} disabled={cargando}>Desmarcar todas</button>
            </div>
          </div>

          <div className={detalle.busquedaContenedor}>
            <input
              type="search"
              className={detalle.buscador}
              placeholder="Buscar una columna…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar una columna"
              disabled={cargando}
            />
          </div>

          {cargando && <p className={detalle.sinResultados}>Cargando la información de los inmuebles…</p>}
          {!cargando && !items && <p className={detalle.error}>{error || 'No se pudo cargar la información.'}</p>}
          {!cargando && items && gruposVisibles.length === 0 && <p className={detalle.sinResultados}>Ninguna columna coincide con la búsqueda.</p>}

          {!cargando && items && gruposVisibles.length > 0 && (
            <div className={detalle.contenedorGrupos}>
              {gruposVisibles.map((g) => {
                const marcadas = g.columnas.filter((c) => seleccion.has(c.key)).length;
                return (
                  <div key={g.id} className={detalle.seccionGrupo}>
                    <h3 className={`${detalle.tituloSeccion} ${styles.tituloSeccion}`}>
                      <Checkbox
                        label={g.titulo}
                        checked={marcadas === g.columnas.length}
                        onChange={() => alternarGrupo(g)}
                      />
                      <span className={styles.conteoSeccion}>{marcadas} / {g.columnas.length}</span>
                    </h3>
                    <div className={styles.columnas}>
                      {g.columnas.map((c) => (
                        <div key={c.key} className={styles.columna}>
                          <Checkbox label={c.label} checked={seleccion.has(c.key)} onChange={() => alternar(c.key)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && items && <p className={detalle.error}>{error}</p>}

        <div className={styles.barra}>
          <span className={styles.barraTexto}>{cantidad === 0 ? 'Elige al menos una columna' : `${cantidad} ${cantidad === 1 ? 'columna elegida' : 'columnas elegidas'}`}</span>
          <Button variant="secondary" onClick={() => navigate(volverA)} disabled={exportando}>Cancelar</Button>
          <Button onClick={handleExportar} disabled={cargando || !items || exportando || cantidad === 0}>
            <span className={styles.botonInterior}>
              <Download size={14} aria-hidden="true" />
              {exportando ? 'Exportando…' : 'Exportar a Excel'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
