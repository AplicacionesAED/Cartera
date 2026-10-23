// Inmuebles de Baía Kristal (Products de Zoho). Rediseño 2026-10-05, mismo
// esquema que Negocios (ver negocios/NegociosPage.jsx):
//   - `/inventario`      -> página de lista a ancho completo: chips de estado,
//                            filtros con etiqueta y una tabla paginada;
//   - `/inventario/:id`  -> detalle como ruta propia (banner, cifras clave y
//                            variables con buscador).
// Una sola ruta decide cuál mostrar según haya `:id`, para que otras pantallas
// sigan enlazando directo a `/inventario/${id}`. Reusa los estilos de lista de
// Negocios (negocios/NegociosPage.module.css).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, RefreshCw, Layers, MapPin, Building, Download } from 'lucide-react';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EstadoInventarioBadge } from '../../components/ui/EstadoInventarioBadge.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { frentesDisponibles, torresDisponibles, podarSeleccion } from '../../utils/cascadaFiltros.js';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SyncProgreso } from '../../components/SyncProgreso.jsx';
import { useSyncControl, normalizarEstadoRunning } from '../../hooks/useSyncControl.js';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { listInventario, iniciarSyncInventario, getSyncStatusInventario } from '../../api/inventario.js';
import { etiquetaEtapa } from '../../utils/etapas.js';
import { InventarioDetalleContenido } from './InventarioDetalleContenido.jsx';
import styles from '../negocios/NegociosPage.module.css';

const PAGE_SIZE = 50;
const FILTROS_VACIOS = { search: '', categoria: [], estado: [], etapa: [], frente: [], torre: [] };

// El campo `torre` de Zoho ya trae el proyecto ('Isla Laguna - Torre 1'): no repetirlo.
function proyectoTorre(item) {
  return item.torre && item.proyecto && item.torre.startsWith(item.proyecto) ? item.torre : [item.proyecto, item.torre].filter(Boolean).join(' · ');
}

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function InventarioLista() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = usePersistentState('inventario-list:filtros', FILTROS_VACIOS);
  const [pagina, setPagina] = usePersistentState('inventario-list:pagina', 1);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [searchInput, setSearchInput] = useState(filtros.search);
  const debouncedSearch = useDebounce(searchInput);

  const [opciones, setOpciones] = useState({
    categorias: [], estados: [], etapasDisponibles: [], frentesDisponibles: [], frentesPorEtapa: {}, torresPorFrente: {}, torresPorEtapaFrente: {},
  });

  useEffect(() => {
    if (debouncedSearch === filtros.search) return;
    setFiltros((prev) => ({ ...prev, search: debouncedSearch }));
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await listInventario({ ...filtros, page: pagina, limit: PAGE_SIZE });
      setResultado(res.data);
      setOpciones((prev) => ({
        categorias: res.data.categorias ?? prev.categorias,
        estados: res.data.estados ?? prev.estados,
        etapasDisponibles: res.data.etapasDisponibles ?? prev.etapasDisponibles,
        frentesDisponibles: res.data.frentesDisponibles ?? prev.frentesDisponibles,
        frentesPorEtapa: res.data.frentesPorEtapa ?? prev.frentesPorEtapa,
        torresPorFrente: res.data.torresPorFrente ?? prev.torresPorFrente,
        torresPorEtapaFrente: res.data.torresPorEtapaFrente ?? prev.torresPorEtapaFrente,
      }));
    } finally {
      setCargando(false);
    }
  }, [filtros, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const sync = useSyncControl({
    iniciar: iniciarSyncInventario,
    obtener: getSyncStatusInventario,
    normalizar: normalizarEstadoRunning,
    alTerminar: (e) => { if (e.ok || e.cancelada) cargar(); },
  });
  const syncError = sync.errorInicio || (sync.ejecutado && !sync.corriendo ? sync.estado?.error : null);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }

  function actualizarCascada(campo, valor) {
    setFiltros((prev) => ({ ...prev, ...podarSeleccion(opciones, { etapa: prev.etapa, frente: prev.frente, torre: prev.torre, [campo]: valor }) }));
    setPagina(1);
  }


  function limpiarFiltros() {
    setSearchInput('');
    setFiltros(FILTROS_VACIOS);
    setPagina(1);
  }

  const meta = resultado ?? {};
  const filas = meta.data ?? [];
  const total = meta.pagination?.total;
  const hayFiltros = Object.values(filtros).some((valor) => (Array.isArray(valor) ? valor.length > 0 : valor !== ''));
  const sinInventario = !cargando && total === 0 && !hayFiltros;
  const frenteOptions = frentesDisponibles(opciones, filtros.etapa);
  const torreOptions = torresDisponibles(opciones, filtros.etapa, filtros.frente);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Inmuebles</h1>
          <p className={styles.subtitle}>Inventario de Baía Kristal (Zoho){total !== undefined && !sinInventario ? ` · ${total.toLocaleString('es-CO')} resultados` : ''}</p>
        </div>
        <div className={styles.acciones}>
          <Button variant="secondary" onClick={() => navigate('/inventario/exportar')} disabled={sinInventario}>
            <span className={styles.botonInterior}>
              <Download size={14} aria-hidden="true" />
              Exportar a Excel
            </span>
          </Button>
          {sync.corriendo ? (
            <SyncProgreso progreso={sync.progreso} recibidoEn={sync.recibidoEn} titulo="Sincronizando desde Zoho…" compacto />
          ) : (
            <Button variant="secondary" onClick={sync.ejecutar}>
              <span className={styles.botonInterior}>
                <RefreshCw size={14} aria-hidden="true" />
                Sincronizar desde Zoho
              </span>
            </Button>
          )}
        </div>
      </div>

      {syncError && <p className={styles.syncError}>{syncError}</p>}

      {opciones.estados.length > 0 && (
        <div className={styles.chips} role="group" aria-label="Filtrar por estado">
          <button type="button" className={`${styles.chip} ${filtros.estado.length === 0 ? styles.chipActivo : ''}`} onClick={() => actualizarFiltro('estado', [])}>
            Todos
          </button>
          {opciones.estados.map((estado) => (
            <button
              key={estado}
              type="button"
              className={`${styles.chip} ${filtros.estado.includes(estado) ? styles.chipActivo : ''}`}
              aria-pressed={filtros.estado.includes(estado)}
              onClick={() => actualizarFiltro('estado', filtros.estado.includes(estado) ? filtros.estado.filter((x) => x !== estado) : [...filtros.estado, estado])}
            >
              {estado}
            </button>
          ))}
        </div>
      )}

      <div className={styles.filtros}>
        <div className={styles.filtroBusqueda}>
          <Field
            label={
              <span className={styles.labelConIcono}>
                <Search size={13} />
                Buscar
              </span>
            }
          >
            {(p) => <TextInput {...p} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Nombre, torre o referencia…" />}
          </Field>
        </div>
        {opciones.etapasDisponibles.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <Layers size={13} />
                Etapa
              </span>
            }
          >
            {(p) => (
              <MultiSelect {...p} options={opciones.etapasDisponibles.map((et) => ({ value: et, label: etiquetaEtapa(et) }))} value={filtros.etapa} onChange={(v) => actualizarCascada('etapa', v)} placeholder="Todas las etapas" />
            )}
          </Field>
        )}
        {frenteOptions.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <MapPin size={13} />
                Frente
              </span>
            }
          >
            {(p) => (
              <MultiSelect {...p} options={frenteOptions} value={filtros.frente} onChange={(v) => actualizarCascada('frente', v)} placeholder="Todos los frentes" />
            )}
          </Field>
        )}
        {filtros.frente.length > 0 && torreOptions.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <Building size={13} />
                Torre
              </span>
            }
          >
            {(p) => (
              <MultiSelect {...p} options={torreOptions.map((tr) => ({ value: tr, label: `Torre ${tr}` }))} value={filtros.torre} onChange={(v) => actualizarFiltro('torre', v)} placeholder="Todas las torres" />
            )}
          </Field>
        )}
        {opciones.categorias.length > 0 && (
          <Field label="Categoría">
            {(p) => (
              <MultiSelect {...p} options={opciones.categorias} value={filtros.categoria} onChange={(v) => actualizarFiltro('categoria', v)} placeholder="Todas las categorías" />
            )}
          </Field>
        )}
        {hayFiltros && (
          <button type="button" className={styles.limpiar} onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className={styles.tableWrap}>
        {sinInventario ? (
          <div className={styles.vacio}>
            <p className={styles.vacioTitulo}>Sin inmuebles cargados</p>
            <p className={styles.vacioTexto}>Usa "Sincronizar desde Zoho" para traer todos los inmuebles desde el módulo Products de Zoho.</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Inmueble</th>
                  <th>Proyecto · Torre</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={4} className={styles.mensaje}>Cargando…</td>
                  </tr>
                ) : filas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.mensaje}>Sin resultados para los filtros aplicados.</td>
                  </tr>
                ) : (
                  filas.map((item) => (
                    <tr key={item.id} className={styles.filaClicable} onClick={() => navigate(`/inventario/${item.id}`)}>
                      <td>
                        <div className={styles.celdaTitulo}>
                          <span className={styles.nombre}>{item.nombre || '(sin nombre)'}</span>
                          {item.piso && <span className={styles.detalleSec}>{item.piso}</span>}
                        </div>
                      </td>
                      <td>{proyectoTorre(item) || <span className={styles.muted}>—</span>}</td>
                      <td>{item.categoria || <span className={styles.muted}>—</span>}</td>
                      <td><EstadoInventarioBadge estado={item.estado} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {!cargando && total > 0 && <Pagination page={pagina} pageSize={PAGE_SIZE} total={total} onPageChange={setPagina} />}
          </>
        )}
      </div>
    </div>
  );
}

export function InventarioPage() {
  const { id } = useParams();
  if (!id) return <InventarioLista />;
  return (
    <div className={styles.page}>
      <BackLink to="/inventario">Inmuebles</BackLink>
      <InventarioDetalleContenido key={id} id={id} />
    </div>
  );
}
