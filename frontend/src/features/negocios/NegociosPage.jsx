// Negocios de Baía Kristal -- el corazón financiero del sistema. Rediseño
// 2026-10-05 (mismo lenguaje que las listas y fichas del HRMS): ya no es una
// lista lateral con un panel de detalle, sino
//   - `/negocios`      -> página de lista a ancho completo: resumen (KPIs),
//                          filtros con etiqueta y una tabla paginada;
//   - `/negocios/:id`  -> detalle como ruta propia (banner + pestañas, ver
//                          NegocioDetalleContenido.jsx).
// Una sola ruta (`NegociosPage`) decide cuál mostrar según haya `:id` -- así
// Dashboard y Cartera en Gestión siguen enlazando directo a `/negocios/${id}`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, CircleDot, Layers, MapPin, Building, Download, RefreshCw, Link2 } from 'lucide-react';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { InfoTooltip } from '../../components/ui/InfoTooltip.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { getStats } from '../../api/dashboard.js';
import { listNegocios, iniciarBackfillNegocios, getBackfillStatusNegocios } from '../../api/negocios.js';
import { SyncProgreso } from '../../components/SyncProgreso.jsx';
import { useSyncControl, normalizarEstadoRunning } from '../../hooks/useSyncControl.js';
import { estadoToken } from '../../utils/estados.js';
import { etiquetaEtapa } from '../../utils/etapas.js';
import { formatCOP } from '../../utils/format.js';
import { exportNegociosCsv, exportNegociosExcel, exportNegociosPdf } from './negociosExport.js';
import { NegocioDetalleContenido } from './NegocioDetalleContenido.jsx';
import styles from './NegociosPage.module.css';

const PAGE_SIZE = 50;
const FILTROS_VACIOS = { search: '', estado: '', etapa: '', frente: '', torre: '', vinculacion: '', saldoPendiente: false, conMovimientos: false };

function formatMoney(v) {
  if (v == null || v === 0) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
}

function cleanNombre(nombre) {
  if (!nombre) return null;
  return nombre.replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[partes.length - 1][0] : ''}`.toUpperCase() || '?';
}

function parseSaldo(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) || n === 0 ? null : n;
}

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ExportMenu({ onExport, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className={styles.exportWrap} ref={ref}>
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} disabled={disabled}>
        <span className={styles.botonInterior}>
          <Download size={14} aria-hidden="true" />
          Exportar
        </span>
      </Button>
      {open && (
        <div className={styles.exportMenu} role="menu">
          {[
            ['Excel (.xlsx)', 'xlsx'],
            ['CSV', 'csv'],
            ['PDF', 'pdf'],
          ].map(([label, fmt]) => (
            <button
              key={fmt}
              type="button"
              role="menuitem"
              className={styles.exportOption}
              onClick={() => {
                setOpen(false);
                onExport(fmt);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Resumen({ stats }) {
  if (!stats) return null;
  return (
    <>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Total inmuebles</p>
          <p className={styles.kpiValor}>{stats.totalInmuebles}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Con negocio</p>
          <p className={styles.kpiValor}>{stats.totalNegocios}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Con abonos</p>
          <p className={`${styles.kpiValor} ${styles.exito}`}>{stats.conSaldo}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Total abonado</p>
          <p className={`${styles.kpiValorSm} ${styles.exito}`}>{stats.saldoTotal > 0 ? formatMoney(stats.saldoTotal) : '—'}</p>
        </div>
      </div>

      <details className={styles.desglose}>
        <summary>Ver desglose por estado, etapa y frente</summary>
        <div className={styles.desgloseGrid}>
          {[
            ['Por estado', stats.porEstado, (e) => e.estado, (e) => e.estado],
            ['Por etapa', stats.porEtapa, (e) => e.etapa, (e) => etiquetaEtapa(e.etapa)],
            ['Por frente', stats.porFrente, (f) => f.frente, (f) => f.frente],
          ].map(([titulo, filas, clave, etiqueta]) => (
            <div key={titulo}>
              <p className={styles.desgloseTitulo}>{titulo}</p>
              <div className={styles.desgloseLista}>
                {filas.map((fila) => (
                  <div key={clave(fila)} className={styles.desgloseFila}>
                    <span className={styles.desgloseEtiqueta}>{etiqueta(fila)}</span>
                    <span className={styles.desgloseValores}>
                      <span className={styles.desgloseCount}>{fila.count}</span>
                      {fila.saldo > 0 && <span className={styles.desgloseSaldo}>{formatMoney(fila.saldo)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}

function NegociosLista() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = usePersistentState('negocios-list:filtros', FILTROS_VACIOS);
  const [pagina, setPagina] = usePersistentState('negocios-list:pagina', 1);
  const [resultado, setResultado] = useState(null);
  const [stats, setStats] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [searchInput, setSearchInput] = useState(filtros.search);
  const debouncedSearch = useDebounce(searchInput);

  // Las opciones de los filtros (estados/etapas/frentes/torres) solo vienen
  // en la respuesta cuando NO hay filtros activos -- se guardan aparte y solo
  // se pisan cuando llegan, para que el selector no se vacíe al aplicar un
  // filtro.
  const [opciones, setOpciones] = useState({
    estados: [], etapasDisponibles: [], frentesDisponibles: [], frentesPorEtapa: {}, torresPorFrente: {}, torresPorEtapaFrente: {},
  });

  useEffect(() => {
    getStats().then((res) => setStats(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (debouncedSearch === filtros.search) return;
    setFiltros((prev) => ({ ...prev, search: debouncedSearch }));
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await listNegocios({ ...filtros, page: pagina, limit: PAGE_SIZE });
      setResultado(res.data);
      setOpciones((prev) => ({
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

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }

  function handleEtapaChange(value) {
    setFiltros((prev) => {
      const { frentesPorEtapa, torresPorEtapaFrente } = opciones;
      let { frente, torre } = prev;
      if (value && frente && !(frentesPorEtapa[value] || []).includes(frente)) {
        frente = '';
        torre = '';
      } else if (value && frente && torre && !(torresPorEtapaFrente[`${value}||${frente}`] || []).includes(torre)) {
        torre = '';
      }
      return { ...prev, etapa: value, frente, torre };
    });
    setPagina(1);
  }

  function handleFrenteChange(value) {
    setFiltros((prev) => ({ ...prev, frente: value, torre: '' }));
    setPagina(1);
  }

  const sync = useSyncControl({
    iniciar: iniciarBackfillNegocios,
    obtener: getBackfillStatusNegocios,
    normalizar: normalizarEstadoRunning,
    alTerminar: (e) => {
      cargar();
      getStats().then((r) => setStats(r.data)).catch(() => {});
      return e;
    },
  });
  const syncError = sync.errorInicio || (sync.ejecutado && !sync.corriendo ? sync.estado?.error : null);

  async function handleExport(fmt) {
    setExportando(true);
    try {
      const res = await listNegocios({ ...filtros, page: 1, limit: 9999 });
      const base = `negocios-${new Date().toISOString().slice(0, 10)}`;
      if (fmt === 'xlsx') exportNegociosExcel(res.data.data, `${base}.xlsx`);
      else if (fmt === 'pdf') exportNegociosPdf(res.data.data, `${base}.pdf`);
      else exportNegociosCsv(res.data.data, `${base}.csv`);
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
  const hayFiltros = Object.values(filtros).some((valor) => valor !== '' && valor !== false);
  const sinNegocios = !cargando && meta.total === 0 && !hayFiltros;
  const frenteOptions = filtros.etapa ? (opciones.frentesPorEtapa?.[filtros.etapa] || []) : (opciones.frentesDisponibles ?? []);
  const torreOptions = filtros.frente
    ? (filtros.etapa ? (opciones.torresPorEtapaFrente?.[`${filtros.etapa}||${filtros.frente}`] || []) : (opciones.torresPorFrente?.[filtros.frente] || []))
    : [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Negocios</h1>
          <p className={styles.subtitle}>
            Inmuebles y negocios de Baía Kristal{meta.total !== undefined && !sinNegocios ? ` · ${meta.total.toLocaleString('es-CO')} resultados` : ''}
          </p>
        </div>
        <div className={styles.acciones}>
          <ExportMenu onExport={handleExport} disabled={exportando || cargando} />
          {sync.corriendo ? (
            <SyncProgreso progreso={sync.progreso} recibidoEn={sync.recibidoEn} titulo="Reconstruyendo negocios…" compacto />
          ) : (
            <Button variant="secondary" onClick={sync.ejecutar}>
              <span className={styles.botonInterior}>
                <RefreshCw size={14} aria-hidden="true" />
                Reconstruir desde Fiducia
              </span>
            </Button>
          )}
        </div>
      </div>

      {syncError && <p className={styles.syncError}>{syncError}</p>}

      <Resumen stats={stats} />

      <div className={styles.filtros}>
        <div className={styles.filtroBusqueda}>
          <Field
            label={
              <span className={styles.labelConIcono}>
                <Search size={13} />
                Buscar
                <InfoTooltip text="Busca por referencia, nomenclatura, nombre del comprador o número de cédula." />
              </span>
            }
          >
            {(p) => <TextInput {...p} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Ref., nomenclatura, comprador o cédula…" />}
          </Field>
        </div>
        {opciones.estados.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <CircleDot size={13} />
                Estado del negocio
                <InfoTooltip text="Filtra según la situación del negocio: al día, en proceso, pendiente o cancelado." />
              </span>
            }
          >
            {(p) => (
              <Select {...p} value={filtros.estado} onChange={(e) => actualizarFiltro('estado', e.target.value)}>
                <option value="">Todos los estados</option>
                {opciones.estados.map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field
          label={
            <span className={styles.labelConIcono}>
              <Link2 size={13} />
              Vinculación
              <InfoTooltip text="De qué forma quedó vinculado el negocio con su inmueble: por nomenclatura y categoría (lo que trae la fiducia), por referencia de recaudo, o sin inmueble vinculado." />
            </span>
          }
        >
          {(p) => (
            <Select {...p} value={filtros.vinculacion ?? ''} onChange={(e) => actualizarFiltro('vinculacion', e.target.value)}>
              <option value="">Todas</option>
              <option value="nomenclatura">Por nomenclatura y categoría</option>
              <option value="referencia">Por referencia de recaudo</option>
              <option value="sin">Sin inmueble vinculado</option>
            </Select>
          )}
        </Field>
        {opciones.etapasDisponibles.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <Layers size={13} />
                Etapa
                <InfoTooltip text="Filtra por la etapa del inmueble asociado al negocio. Los proyectos sin etapa numerada y los negocios sin inmueble asociado (Sin proyecto) se agrupan aparte." />
              </span>
            }
          >
            {(p) => (
              <Select {...p} value={filtros.etapa} onChange={(e) => handleEtapaChange(e.target.value)}>
                <option value="">Todas las etapas</option>
                {opciones.etapasDisponibles.map((et) => <option key={et} value={et}>{etiquetaEtapa(et)}</option>)}
              </Select>
            )}
          </Field>
        )}
        {frenteOptions.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <MapPin size={13} />
                Frente
                <InfoTooltip text="Filtra por el proyecto/desarrollo del inmueble asociado al negocio. Si hay una Etapa elegida, solo se muestran los frentes de esa etapa. Los negocios sin inmueble asociado no aparecen al filtrar por un Frente específico." />
              </span>
            }
          >
            {(p) => (
              <Select {...p} value={filtros.frente} onChange={(e) => handleFrenteChange(e.target.value)}>
                <option value="">Todos los frentes</option>
                {frenteOptions.map((fr) => <option key={fr} value={fr}>{fr}</option>)}
              </Select>
            )}
          </Field>
        )}
        {filtros.frente && torreOptions.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <Building size={13} />
                Torre
                <InfoTooltip text="Filtra por la torre del Frente seleccionado." />
              </span>
            }
          >
            {(p) => (
              <Select {...p} value={filtros.torre} onChange={(e) => actualizarFiltro('torre', e.target.value)}>
                <option value="">Todas las torres</option>
                {torreOptions.map((tr) => <option key={tr} value={tr}>Torre {tr}</option>)}
              </Select>
            )}
          </Field>
        )}
        <div className={styles.filtrosToggles}>
          <Checkbox label="Solo con abonos" checked={filtros.saldoPendiente} onChange={(e) => actualizarFiltro('saldoPendiente', e.target.checked)} />
          <Checkbox label="Solo con movimientos" checked={filtros.conMovimientos} onChange={(e) => actualizarFiltro('conMovimientos', e.target.checked)} />
        </div>
        {hayFiltros && (
          <button type="button" className={styles.limpiar} onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className={styles.tableWrap}>
        {sinNegocios ? (
          <div className={styles.vacio}>
            <p className={styles.vacioTitulo}>Sin negocios cargados</p>
            <p className={styles.vacioTexto}>Los datos se extraen automáticamente de los archivos Excel subidos a Encargos. Usa "Reconstruir desde Fiducia" para cargarlos.</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Inmueble</th>
                  <th>Nomenclatura</th>
                  <th>Comprador</th>
                  <th>Estado</th>
                  <th className={styles.derecha}>Saldo actual</th>
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
                  filas.map((n) => {
                    const nomenclatura = n.datos?.Nomenclatura;
                    const titulo = (nomenclatura ? `Apto ${nomenclatura}` : n.referencia) || n.id;
                    const comprador = cleanNombre(n.compradores?.[0]?.nombre);
                    const extra = (n.compradores?.length ?? 0) - 1;
                    const saldoNum = parseSaldo(n.datos?.['Saldo Actual'] ?? n.saldoActual);
                    return (
                      <tr key={n.id} className={styles.filaClicable} onClick={() => navigate(`/negocios/${n.id}`)}>
                        <td>
                          <div className={styles.celdaTitulo}>
                            <span className={styles.nombre}>{titulo}</span>
                            {n.referencia && n.referencia !== titulo && <span className={styles.detalleSec}>Ref. {n.referencia}</span>}
                          </div>
                        </td>
                        <td>{n.nomenclaturaCompleta || <span className={styles.muted}>—</span>}</td>
                        <td>
                          {comprador ? (
                            <div className={styles.persona}>
                              <span className={styles.avatar}>{iniciales(comprador)}</span>
                              <span>
                                {comprador}
                                {extra > 0 && <span className={styles.mas}>+{extra}</span>}
                              </span>
                            </div>
                          ) : (
                            <span className={styles.muted}>Sin comprador</span>
                          )}
                        </td>
                        <td>
                          {n.estado && <Badge variant={estadoToken(n.estado)}>{n.estado}</Badge>}
                          {!n.tieneNegocio && <Badge variant="neutral">Sin negocio</Badge>}
                        </td>
                        <td className={`${styles.derecha} ${styles.saldo} ${saldoNum > 0 ? styles.saldoPositivo : styles.muted}`}>
                          {saldoNum != null ? formatCOP(saldoNum) : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {!cargando && meta.total > 0 && <Pagination page={pagina} pageSize={PAGE_SIZE} total={meta.total} onPageChange={setPagina} />}
          </>
        )}
      </div>
    </div>
  );
}

export function NegociosPage() {
  const { id } = useParams();
  if (!id) return <NegociosLista />;
  return (
    <div className={styles.page}>
      <BackLink to="/negocios">Negocios</BackLink>
      <NegocioDetalleContenido key={id} id={id} />
    </div>
  );
}
