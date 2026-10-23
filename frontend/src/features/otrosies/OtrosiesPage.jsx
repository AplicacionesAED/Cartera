// Módulo 'Otrosíes' de Baía Kristal -- SOLO LECTURA (tabla de consulta, sin
// formularios ni edición). Muestra los Negocios/Deals con el estado del
// 'Otro sí - Contrato de Fiducia' y quién es el encargado (Encargado_Otro_Si).
//
// El backend filtra duro: GET /otrosies devuelve SIEMPRE solo los negocios
// con archivo=Sí (nunca llegan los 'No' ni los 'Pendiente de verificar'),
// por eso no hay filtro ni columna de Archivo -- si el negocio aparece en
// la tabla, tiene el PDF, y la columna 'Ver PDF' lo deja claro.
//
// Columna/filtro 'Otro sí requerido' QUITADOS (Jefe Gabriel, 2026-09-24): el
// picklist `Otro_si_Requerido` de Zoho no es confiable -- hay casos reales
// marcados 'No' que sí tienen el documento adjunto (`otro_si_tiene_archivo`
// desmiente al picklist), así que mostrarlo/filtrar por él comunicaba una
// señal falsa. El dato sigue existiendo en el modelo/sync/backend
// (`otro_si_requerido`, `otroSiRequerido` en la API) por si se necesita
// después -- solo se dejó de mostrar y de ofrecer como filtro acá.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ListFilter, RefreshCw, Layers, MapPin, Building, CheckCircle2, Circle, X, FileText } from 'lucide-react';
import { CeldaComprador, CeldaInmueble } from '../cartera-mora/CarteraCeldas.jsx';
import { StageBadge } from '../../components/ui/StageBadge.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { frentesDisponibles, torresDisponibles, podarSeleccion } from '../../utils/cascadaFiltros.js';
import { InfoTooltip } from '../../components/ui/InfoTooltip.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SortHeader } from '../../components/ui/SortHeader.jsx';
import { useSortableTable, ariaSort } from '../../hooks/useSortableTable.js';
import {
  listOtrosies,
  listStagesOtrosi,
  iniciarSyncOtrosies,
  getSyncStatusOtrosies,
  archivoOtrosieUrl,
  marcarVerificadoOtrosi,
} from '../../api/otrosies.js';
import { formatDateTime } from '../../utils/format.js';
import { SyncProgreso } from '../../components/SyncProgreso.jsx';
import { useSyncControl, normalizarEstadoLog } from '../../hooks/useSyncControl.js';
import { etiquetaEtapa } from '../../utils/etapas.js';
import styles from './OtrosiesPage.module.css';

// "Baia Kristal - NOMBRE(S) - P4 6-E" -> solo los nombres (la unidad ya va en su columna).
function nombreNegocio(dealName = '') {
  const partes = String(dealName).split(' - ').map((x) => x.trim()).filter(Boolean);
  return partes.length >= 3 ? partes.slice(1, -1).join(' - ') : dealName;
}

// "Etapa 2 - Prive - Torre 4 - 6-E" -> unidad destacada ("6-E") y la ubicación debajo.
function partirInmueble(label) {
  if (!label) return { principal: 'Sin inmueble' };
  const partes = label.split(' - ');
  if (partes.length < 2) return { principal: label };
  return { principal: partes[partes.length - 1], sub: partes.slice(0, -1).join(' · ') };
}

const VERIFICADO_OPCIONES = [
  { value: '', label: 'Todos' },
  { value: 'si', label: 'Verificados' },
  { value: 'no', label: 'Sin verificar' },
];

// Check manual de "ya comparé este otrosí contra el CRM" (Jefe Gabriel,
// 2026-09-24) -- botón clickeable, no una columna de solo lectura: el
// problema real que resuelve este módulo es que el CRM queda desactualizado
// (se firma el otrosí, se sube el documento, pero nadie refleja el cambio en
// el plan de pagos de Zoho), así que necesita quedar constancia de quién ya
// comparó el documento contra el CRM y cuándo. Título nativo (`title=`) con
// quién/cuándo en vez de un tooltip propio -- info secundaria, no vale la
// pena un componente nuevo para esto.
function BotonVerificado({ row, guardando, onToggle }) {
  const detalle = row.verificado && row.verificadoPor
    ? `Verificado por ${row.verificadoPor.nombre} el ${formatDateTime(row.verificadoEn)}`
    : 'Sin verificar contra el CRM';
  return (
    <button
      type="button"
      className={`${styles.botonVerificado} ${row.verificado ? styles.botonVerificadoActivo : ''}`}
      onClick={() => onToggle(row)}
      disabled={guardando}
      title={detalle}
    >
      {row.verificado ? <CheckCircle2 size={15} /> : <Circle size={15} />}
      {row.verificado ? 'Verificado' : 'Sin verificar'}
    </button>
  );
}

// Calco de SyncStatusBar en OportunidadesListPage.jsx (mismo look y polling
// cada 15s) pero con los endpoints propios que Carlos está agregando
// (POST /otrosies/sync, GET /otrosies/sync/status -- mismo shape que sus
// pares de Oportunidades).
function SyncStatusBar({ onTerminado }) {
  const sync = useSyncControl({
    iniciar: iniciarSyncOtrosies,
    obtener: getSyncStatusOtrosies,
    normalizar: normalizarEstadoLog,
    alTerminar: (e) => { if (e.ok || e.cancelada) onTerminado?.(); },
  });
  const status = sync.estado;

  return (
    <div className={styles.syncBar}>
      {sync.corriendo ? (
        <SyncProgreso progreso={sync.progreso} recibidoEn={sync.recibidoEn} titulo="Sincronizando con Zoho…" compacto embebido />
      ) : (
        <>
          <div className={styles.syncEstado}>
            {status?.status === 'never' && 'Sin sincronizaciones'}
            {status?.status === 'success' && (
              <span>
                Última sync: <strong>{formatDateTime(status.finalizadoEn)}</strong>{' '}
                <span className={styles.syncOk}>({status.registrosSync} reg.)</span>
              </span>
            )}
            {sync.errorInicio && <span className={styles.syncError}>No se pudo iniciar la sincronización: {sync.errorInicio}</span>}
            {!sync.errorInicio && status?.status === 'cancelled' && <span>Última sync cancelada: se conservó lo ya guardado</span>}
            {!sync.errorInicio && status?.status === 'error' && (
              <span className={styles.syncError}>Error en sync: {status.errorMsg?.slice(0, 120)}</span>
            )}
          </div>
          <button type="button" className={styles.botonSync} onClick={sync.ejecutar}>
            <RefreshCw size={13} />
            Sincronizar ahora
          </button>
        </>
      )}
    </div>
  );
}

export function OtrosiesPage() {
  // Deliberadamente useState normal (NO usePersistentState) -- pedido explícito
  // del usuario: a diferencia del resto de listados del proyecto, este módulo
  // no debe recordar filtros/página entre visitas, deben arrancar limpios.
  // Enlace desde Inicio (?verificado=no): arranca con ese filtro y limpia la URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtros, setFiltros] = useState(() => ({
    search: '', stage: [], etapa: [], frente: [], torre: [],
    verificado: ['si', 'no'].includes(searchParams.get('verificado')) ? searchParams.get('verificado') : '',
  }));
  useEffect(() => {
    if (searchParams.has('verificado')) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState(null);
  const [stages, setStages] = useState([]);
  const [opciones, setOpciones] = useState({
    etapasDisponibles: [],
    frentesDisponibles: [],
    frentesPorEtapa: {},
    torresPorFrente: {},
    torresPorEtapaFrente: {},
  });
  const [cargando, setCargando] = useState(true);
  // Id de la fila con un PATCH /verificado en vuelo -- deshabilita SOLO ese
  // botón (no toda la tabla) mientras se confirma, evita doble clic.
  const [guardandoId, setGuardandoId] = useState(null);

  const meta = resultado ?? {};
  const filas = meta.data ?? [];

  const valueGetters = useMemo(
    () => ({
      dealName: (f) => f.dealName ?? '',
      stage: (f) => f.stage ?? '',
      referenciaRecaudo: (f) => f.referenciaRecaudo ?? '',
      inmueble: (f) => f.inmueble?.label ?? '',
      encargadoOtroSi: (f) => f.encargadoOtroSi ?? '',
      otroSiTieneArchivo: (f) => (f.otroSiTieneArchivo === true ? 1 : 0),
      verificado: (f) => (f.verificado === true ? 1 : 0),
    }),
    []
  );
  const { sortedRows, sort, toggleSort: toggleSortInternal } = useSortableTable(filas, valueGetters, { mode: 'remote' });

  function toggleSort(key) {
    toggleSortInternal(key);
    setPagina(1);
  }

  async function cargar() {
    setCargando(true);
    try {
      const { search, stage, etapa, frente, torre, verificado } = filtros;
      const res = await listOtrosies({
        search,
        stage,
        etapa,
        frente,
        torre,
        verificado,
        sortBy: sort.key ?? undefined,
        sortDir: sort.direction ?? undefined,
        page: pagina,
        limit: 20,
      });
      setResultado(res.data);
      setOpciones((prev) => ({
        etapasDisponibles: res.data.etapasDisponibles ?? prev.etapasDisponibles,
        frentesDisponibles: res.data.frentesDisponibles ?? prev.frentesDisponibles,
        frentesPorEtapa: res.data.frentesPorEtapa ?? prev.frentesPorEtapa,
        torresPorFrente: res.data.torresPorFrente ?? prev.torresPorFrente,
        torresPorEtapaFrente: res.data.torresPorEtapaFrente ?? prev.torresPorEtapaFrente,
      }));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    listStagesOtrosi().then((res) => setStages(res.data));
  }, []);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, pagina, sort]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }

  function actualizarCascada(campo, valor) {
    setFiltros((prev) => ({ ...prev, ...podarSeleccion(opciones, { etapa: prev.etapa, frente: prev.frente, torre: prev.torre, [campo]: valor }) }));
    setPagina(1);
  }

  // Optimista: refleja el nuevo estado en la fila apenas confirma el backend
  // (no antes -- si el PATCH falla, la fila se queda como estaba, sin
  // necesidad de revertir nada a mano). Si el filtro "Verificado" está
  // activo, la fila puede dejar de calzar con él -- se recarga la página
  // entera en ese caso para no dejar una fila fantasma en la lista filtrada.
  async function handleToggleVerificado(row) {
    setGuardandoId(row.id);
    try {
      const res = await marcarVerificadoOtrosi(row.id, !row.verificado);
      if (filtros.verificado) {
        await cargar();
      } else {
        setResultado((prev) => ({
          ...prev,
          data: prev.data.map((r) => (r.id === row.id ? { ...r, ...res.data } : r)),
        }));
      }
    } catch (err) {
      window.alert(err.message || 'No se pudo actualizar la verificación'); // eslint-disable-line no-alert
    } finally {
      setGuardandoId(null);
    }
  }

  const hayFiltros = Object.values(filtros).some((valor) => (Array.isArray(valor) ? valor.length > 0 : Boolean(valor)));
  function limpiarFiltros() {
    setFiltros({ search: '', stage: [], etapa: [], frente: [], torre: [], verificado: '' });
    setPagina(1);
  }

  const frenteOptions = frentesDisponibles(opciones, filtros.etapa);
  const torreOptions = torresDisponibles(opciones, filtros.etapa, filtros.frente);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Otrosíes</h1>
          <span className={styles.subtitle}>Baía Kristal · Contrato de Fiducia · Solo lectura</span>
        </div>
        <SyncStatusBar
          onTerminado={() => {
            cargar();
            listStagesOtrosi().then((res) => setStages(res.data)).catch(() => {});
          }}
        />
      </div>

      <div className={styles.toolbarCard}>
      <div className={styles.filtrosGrid}>
        <Field
          className={styles.campoBusqueda}
          label={
            <span className={styles.labelConIcono}>
              <Search size={13} />
              Buscar
              <InfoTooltip text="Escribe el nombre del negocio para filtrar la lista." />
            </span>
          }
        >
          {(p) => <TextInput {...p} value={filtros.search} onChange={(e) => actualizarFiltro('search', e.target.value)} placeholder="Nombre del negocio…" />}
        </Field>
        <Field
          className={styles.campoFiltro}
          label={
            <span className={styles.labelConIcono}>
              <ListFilter size={13} />
              Etapa CRM
              <InfoTooltip text="Filtra por el estado actual del negocio en Zoho (match exacto)." />
            </span>
          }
        >
          {(p) => (
            <MultiSelect {...p} options={stages} value={filtros.stage} onChange={(v) => actualizarFiltro('stage', v)} placeholder="Todas las etapas" />
          )}
        </Field>
        {opciones.etapasDisponibles.length > 0 && (
          <Field
            className={styles.campoFiltro}
            label={
              <span className={styles.labelConIcono}>
                <Layers size={13} />
                Etapa del inmueble
                <InfoTooltip text="Filtra por la etapa del inmueble asociado al otrosí." />
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
            className={styles.campoFiltro}
            label={
              <span className={styles.labelConIcono}>
                <MapPin size={13} />
                Frente
                <InfoTooltip text="Filtra por el proyecto/desarrollo del inmueble asociado al otrosí. Si hay una etapa elegida, solo se muestran los frentes de esa etapa." />
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
            className={styles.campoFiltro}
            label={
              <span className={styles.labelConIcono}>
                <Building size={13} />
                Torre
                <InfoTooltip text="Filtra por la torre del frente seleccionado." />
              </span>
            }
          >
            {(p) => (
              <MultiSelect {...p} options={torreOptions.map((tr) => ({ value: tr, label: `Torre ${tr}` }))} value={filtros.torre} onChange={(v) => actualizarFiltro('torre', v)} placeholder="Todas las torres" />
            )}
          </Field>
        )}
        <Field
          className={styles.campoFiltro}
          label={
            <span className={styles.labelConIcono}>
              <CheckCircle2 size={13} />
              Verificado
              <InfoTooltip text="¿Ya se comparó este otrosí contra el plan de pagos del CRM? (check manual, no viene de Zoho)." />
            </span>
          }
        >
          {(p) => (
            <Select {...p} value={filtros.verificado} onChange={(e) => actualizarFiltro('verificado', e.target.value)}>
              {VERIFICADO_OPCIONES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
      </div>
      {hayFiltros && (
        <button type="button" className={styles.limpiarFiltros} onClick={limpiarFiltros}><X size={13} /> Limpiar filtros</button>
      )}
      </div>

      {cargando ? (
        <p className={styles.cargando}>Cargando…</p>
      ) : (
        <>
          <div className={styles.card}>
          <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th aria-sort={ariaSort(sort, 'dealName')}>
                  <SortHeader label="Negocio" sortKey="dealName" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'referenciaRecaudo')}>
                  <SortHeader label="Ref. Recaudo" sortKey="referenciaRecaudo" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'inmueble')}>
                  <SortHeader label="Inmueble" sortKey="inmueble" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'stage')}>
                  <SortHeader label="Etapa CRM" sortKey="stage" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'otroSiTieneArchivo')}>
                  <SortHeader label="Documento" sortKey="otroSiTieneArchivo" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'verificado')}>
                  <SortHeader label="Verificación" sortKey="verificado" sort={sort} onSort={toggleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.sinResultados}>No se encontraron registros</td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.id ?? row.dealName}>
                    <td><CeldaComprador nombre={nombreNegocio(row.dealName)} /></td>
                    <td>{row.referenciaRecaudo ? <span className={styles.refBadge}>{row.referenciaRecaudo}</span> : <span className={styles.muted}>—</span>}</td>
                    <td><CeldaInmueble {...partirInmueble(row.inmueble?.label)} /></td>
                    <td><StageBadge stage={row.stage} /></td>
                    <td>
                      {row.otroSiTieneArchivo === true ? (
                        <a href={archivoOtrosieUrl(row.id)} target="_blank" rel="noopener noreferrer" className={styles.linkPdf}>
                          <FileText size={14} /> Ver PDF
                        </a>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td>
                      <BotonVerificado row={row} guardando={guardandoId === row.id} onToggle={handleToggleVerificado} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          {meta.pagination && (
            <Pagination page={pagina} pageSize={meta.pagination.limit} total={meta.pagination.total} onPageChange={setPagina} />
          )}
          </div>
        </>
      )}
    </div>
  );
}