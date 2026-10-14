// Inmuebles de Oliv (objeto Unidades de HubSpot). Mismo rediseño que Baía Kristal
// (ver inventario/InventarioPage.jsx):
//   - `/oliv/inmuebles`      -> página de lista a ancho completo (chips de estado,
//                               filtros y tabla);
//   - `/oliv/inmuebles/:id`  -> detalle como ruta propia.
// Sin jerarquía Etapa->Frente->Torre: el objeto Unidades de HubSpot ya trae
// `torre` como propiedad plana, así que los filtros son directos (Torre,
// Categoría, Estado, más búsqueda). Conserva "Exportar a Excel" (respeta los
// filtros aplicados).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, RefreshCw, Building, Download } from 'lucide-react';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EstadoInventarioBadge } from '../../components/ui/EstadoInventarioBadge.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SyncProgreso } from '../../components/SyncProgreso.jsx';
import { useSyncControl, normalizarEstadoRunning } from '../../hooks/useSyncControl.js';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { listInmueblesOliv, iniciarSyncInmueblesOliv, getSyncStatusInmueblesOliv } from '../../api/oliv.js';
import { formatCOP } from '../../utils/format.js';
import { exportarInmueblesOliv } from './exportarInmueblesOliv.js';
import { OlivInventarioDetalleContenido } from './OlivInventarioDetalleContenido.jsx';
import styles from '../negocios/NegociosPage.module.css';

const PAGE_SIZE = 50;
const FILTROS_VACIOS = { search: '', torre: '', categoria: '', estado: '' };

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function OlivInventarioLista() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = usePersistentState('oliv-inventario-list:filtros', FILTROS_VACIOS);
  const [pagina, setPagina] = usePersistentState('oliv-inventario-list:pagina', 1);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [searchInput, setSearchInput] = useState(filtros.search);
  const debouncedSearch = useDebounce(searchInput);
  const [opciones, setOpciones] = useState({ torres: [], categorias: [], estados: [] });

  useEffect(() => {
    if (debouncedSearch === filtros.search) return;
    setFiltros((prev) => ({ ...prev, search: debouncedSearch }));
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await listInmueblesOliv({ ...filtros, page: pagina, limit: PAGE_SIZE });
      setResultado(res.data);
      setOpciones((prev) => ({
        torres: res.data.torres ?? prev.torres,
        categorias: res.data.categorias ?? prev.categorias,
        estados: res.data.estados ?? prev.estados,
      }));
    } finally {
      setCargando(false);
    }
  }, [filtros, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const sync = useSyncControl({
    iniciar: iniciarSyncInmueblesOliv,
    obtener: getSyncStatusInmueblesOliv,
    normalizar: normalizarEstadoRunning,
    alTerminar: (e) => { if (e.ok) cargar(); },
  });
  const syncError = sync.errorInicio || (sync.ejecutado && !sync.corriendo ? sync.estado?.error : null);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }


  async function handleExportar() {
    setExportando(true);
    try {
      await exportarInmueblesOliv(filtros);
    } catch (err) {
      window.alert(`No se pudo exportar: ${err.message}`);
    } finally {
      setExportando(false);
    }
  }

  function limpiarFiltros() {
    setSearchInput('');
    setFiltros(FILTROS_VACIOS);
    setPagina(1);
  }

  const meta = resultado ?? {};
  const filas = meta.data ?? [];
  const total = meta.pagination?.total;
  const hayFiltros = Object.values(filtros).some((valor) => valor !== '');
  const sinInventario = !cargando && total === 0 && !hayFiltros;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Inmuebles</h1>
          <p className={styles.subtitle}>Unidades de Oliv (HubSpot){total !== undefined && !sinInventario ? ` · ${total.toLocaleString('es-CO')} resultados` : ''}</p>
        </div>
        <div className={styles.acciones}>
          <Button variant="secondary" onClick={handleExportar} disabled={exportando}>
            <span className={styles.botonInterior}>
              <Download size={14} aria-hidden="true" />
              {exportando ? 'Exportando…' : 'Exportar a Excel'}
            </span>
          </Button>
          {sync.corriendo ? (
            <SyncProgreso progreso={sync.progreso} recibidoEn={sync.recibidoEn} titulo="Sincronizando desde HubSpot…" compacto />
          ) : (
            <Button variant="secondary" onClick={sync.ejecutar}>
              <span className={styles.botonInterior}>
                <RefreshCw size={14} aria-hidden="true" />
                Sincronizar desde HubSpot
              </span>
            </Button>
          )}
        </div>
      </div>

      {syncError && <p className={styles.syncError}>{syncError}</p>}

      {opciones.estados.length > 0 && (
        <div className={styles.chips} role="group" aria-label="Filtrar por estado">
          <button type="button" className={`${styles.chip} ${filtros.estado === '' ? styles.chipActivo : ''}`} onClick={() => actualizarFiltro('estado', '')}>
            Todos
          </button>
          {opciones.estados.map((estado) => (
            <button
              key={estado}
              type="button"
              className={`${styles.chip} ${filtros.estado === estado ? styles.chipActivo : ''}`}
              onClick={() => actualizarFiltro('estado', filtros.estado === estado ? '' : estado)}
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
            {(p) => <TextInput {...p} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Código de unidad o torre…" />}
          </Field>
        </div>
        {opciones.torres.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <Building size={13} />
                Torre
              </span>
            }
          >
            {(p) => (
              <Select {...p} value={filtros.torre} onChange={(e) => actualizarFiltro('torre', e.target.value)}>
                <option value="">Todas las torres</option>
                {opciones.torres.map((t) => <option key={t} value={t}>Torre {t}</option>)}
              </Select>
            )}
          </Field>
        )}
        {opciones.categorias.length > 0 && (
          <Field label="Categoría">
            {(p) => (
              <Select {...p} value={filtros.categoria} onChange={(e) => actualizarFiltro('categoria', e.target.value)}>
                <option value="">Todas las categorías</option>
                {opciones.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
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
            <p className={styles.vacioTexto}>Usa "Sincronizar desde HubSpot" para traer todas las unidades.</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Torre</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th className={styles.derecha}>Valor comercial</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={5} className={styles.mensaje}>Cargando…</td>
                  </tr>
                ) : filas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.mensaje}>Sin resultados para los filtros aplicados.</td>
                  </tr>
                ) : (
                  filas.map((item) => (
                    <tr key={item.id} className={styles.filaClicable} onClick={() => navigate(`/oliv/inmuebles/${item.id}`)}>
                      <td><span className={styles.nombre}>{item.codigoUnidad || '(sin código)'}</span></td>
                      <td>{item.torre ? `Torre ${item.torre}` : <span className={styles.muted}>—</span>}</td>
                      <td>{item.categoria || <span className={styles.muted}>—</span>}</td>
                      <td><EstadoInventarioBadge estado={item.estado} /></td>
                      <td className={`${styles.derecha} ${styles.saldo}`}>{item.valorComercial != null ? formatCOP(item.valorComercial) : <span className={styles.muted}>—</span>}</td>
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

export function OlivInventarioPage() {
  const { id } = useParams();
  if (!id) return <OlivInventarioLista />;
  return (
    <div className={styles.page}>
      <BackLink to="/oliv/inmuebles">Inmuebles</BackLink>
      <OlivInventarioDetalleContenido key={id} id={id} />
    </div>
  );
}
