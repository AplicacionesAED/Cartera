// Tercer módulo de negocio migrado. Sync de Deals de Zoho -- comparte la
// infraestructura OAuth con Inventario (utils/zohoAuth.js). Adaptado de
// zoho-payment-tracker/frontend/src/pages/Dashboard.jsx (estado de sync) y
// components/PaymentPlanTable.jsx (tabla con filtros y paginación) -- en el
// legado esa página se llamaba "Dashboard" mientras que "Oportunidades" era
// solo el título mostrado; acá el nombre del archivo ya es el correcto. Sin
// KPIs ni columna "Última Sync" (quitados 2026-09-16, a pedido del
// usuario) -- solo queda la barra de estado de sync (SyncStatusBar) para esa
// información. Tampoco "Pago Separación" (quitada 2026-09-24) -- ese dato ya
// se ve en el detalle de la oportunidad, no hacía falta duplicarlo acá.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ListFilter, RefreshCw, Layers, MapPin, Building } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { StageBadge } from '../../components/ui/StageBadge.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { frentesDisponibles, torresDisponibles, podarSeleccion } from '../../utils/cascadaFiltros.js';
import { InfoTooltip } from '../../components/ui/InfoTooltip.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SortHeader } from '../../components/ui/SortHeader.jsx';
import { useSortableTable, ariaSort } from '../../hooks/useSortableTable.js';
import { listOportunidades, listStages, iniciarSyncOportunidades, getSyncStatusOportunidades, iniciarBackfillSubforms, getBackfillSubformsStatus } from '../../api/oportunidades.js';
import { SyncProgreso } from '../../components/SyncProgreso.jsx';
import { SyncModoButton } from '../../components/SyncModoButton.jsx';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { useSyncControl, normalizarEstadoLog, normalizarEstadoRunning } from '../../hooks/useSyncControl.js';
import { formatDateTime } from '../../utils/format.js';
import { etiquetaEtapa } from '../../utils/etapas.js';
import styles from './OportunidadesListPage.module.css';

function iniciales(texto = '') {
  const partes = String(texto).replace(/^(Baia Kristal|Oliv)\s*-\s*/i, '').trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[1][0] : ''}`.toUpperCase() || '?';
}

const MODOS_SYNC = [
  { value: 'cambios', label: 'Sincronizar cambios', descripcion: 'Trae solo lo que cambió en Zoho desde la última sincronización (rápido).' },
  { value: 'todo', label: 'Sincronizar todo', descripcion: 'Vuelve a traer todas las oportunidades que cumplen la regla, con toda su información y su plan de pagos (tarda más).' },
];

function SyncStatusBar({ onTerminado }) {
  const [modo, setModo] = usePersistentState('oportunidades:sync-modo', 'cambios');
  const sync = useSyncControl({
    iniciar: () => iniciarSyncOportunidades(modo === 'todo'),
    obtener: getSyncStatusOportunidades,
    normalizar: normalizarEstadoLog,
    alTerminar: (e) => { if (e.ok || e.cancelada) onTerminado?.(); },
  });
  // "Actualizar planes de pago": vuelve a leer de Zoho el plan de TODAS las oportunidades guardadas y reemplaza lo guardado
  // (5 consultas a la vez; se puede cancelar sin perder lo ya actualizado).
  const syncPlanes = useSyncControl({
    iniciar: () => iniciarBackfillSubforms(true),
    obtener: getBackfillSubformsStatus,
    normalizar: normalizarEstadoRunning,
    alTerminar: (e) => { if (e.ok || e.cancelada) onTerminado?.(); },
  });
  const status = sync.estado;
  const errorSync = sync.errorInicio || syncPlanes.errorInicio;
  const resultadoPlanes = syncPlanes.ejecutado && !syncPlanes.corriendo ? syncPlanes.estado : null;

  return (
    <div className={styles.syncBar}>
      {sync.corriendo ? (
        <SyncProgreso progreso={sync.progreso} recibidoEn={sync.recibidoEn} titulo="Sincronizando con Zoho…" compacto embebido />
      ) : syncPlanes.corriendo ? (
        <SyncProgreso progreso={syncPlanes.progreso} recibidoEn={syncPlanes.recibidoEn} titulo="Actualizando planes de pago desde Zoho…" compacto embebido />
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
            {errorSync && <span className={styles.syncError}>No se pudo iniciar la sincronización: {errorSync}</span>}
            {!errorSync && resultadoPlanes?.cancelada && <span>Actualización de planes cancelada: {resultadoPlanes.result?.actualizadas ?? 0} planes ya quedaron actualizados</span>}
            {!errorSync && resultadoPlanes?.ok === true && <span className={styles.syncOk}>Planes de pago actualizados ({resultadoPlanes.result?.actualizadas ?? 0}{resultadoPlanes.result?.errores > 0 ? `, ${resultadoPlanes.result.errores} con error` : ''})</span>}
            {!errorSync && status?.status === 'cancelled' && <span>Última sync cancelada: se conservó lo ya guardado</span>}
            {!errorSync && status?.status === 'error' && (
              <span className={styles.syncError}>Error en sync: {status.errorMsg?.slice(0, 120)}</span>
            )}
          </div>
          <Button variant="secondary" onClick={() => { if (window.confirm('Se volverá a leer de Zoho el plan de pagos de TODAS las oportunidades (más de 4.000; tarda bastante). Puedes cancelar en cualquier momento sin perder lo ya actualizado. ¿Continuar?')) syncPlanes.ejecutar(); }}>
            <span className={styles.botonSyncInterior}>
              <RefreshCw size={14} aria-hidden="true" />
              Actualizar planes de pago
            </span>
          </Button>
          <SyncModoButton
            opciones={MODOS_SYNC}
            modo={modo}
            onModo={setModo}
            onEjecutar={(m) => {
              if (m === 'todo' && !window.confirm('Se volverán a traer de Zoho TODAS las oportunidades que cumplen la regla, con su información completa y su plan de pagos. Tarda varios minutos y puedes cancelar sin perder lo ya guardado. ¿Continuar?')) return;
              sync.ejecutar();
            }}
          />
        </>
      )}
    </div>
  );
}

export function OportunidadesListPage() {
  const navigate = useNavigate();
  // Deliberadamente useState normal (NO usePersistentState) -- pedido explícito
  // del usuario: a diferencia del resto de listados del proyecto, este módulo
  // no debe recordar filtros/página entre visitas, deben arrancar limpios.
  const [filtros, setFiltros] = useState({ search: '', stage: [], etapa: [], frente: [], torre: [] });
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

  // 'remote': el orden se resuelve en el backend ANTES de paginar (ver
  // oportunidad.service.js#list) -- mismo patrón que OtrosiesPage.jsx.
  // `valueGetters` no se usa para comparar en este modo, pero el hook lo
  // exige igual.
  const valueGetters = useMemo(
    () => ({
      dealName: (f) => f.dealName ?? '',
      stage: (f) => f.stage ?? '',
      referenciaRecaudo: (f) => f.referenciaRecaudo ?? '',
      inmueble: (f) => f.inmueble?.label ?? '',
    }),
    []
  );
  const { sortedRows, sort, toggleSort: toggleSortInternal } = useSortableTable(resultado?.data ?? [], valueGetters, { mode: 'remote' });

  function toggleSort(key) {
    toggleSortInternal(key);
    setPagina(1);
  }

  async function cargar() {
    setCargando(true);
    try {
      const res = await listOportunidades({ ...filtros, sortBy: sort.key ?? undefined, sortDir: sort.direction ?? undefined, page: pagina, limit: 20 });
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
    listStages().then((res) => setStages(res.data));
  }, []);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, pagina, sort]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }

  // Mismo criterio en cascada que OtrosiesPage.jsx: elegir una etapa limpia
  // el frente/torre si dejan de pertenecer a ella; elegir un frente limpia
  // la torre.
  function actualizarCascada(campo, valor) {
    setFiltros((prev) => ({ ...prev, ...podarSeleccion(opciones, { etapa: prev.etapa, frente: prev.frente, torre: prev.torre, [campo]: valor }) }));
    setPagina(1);
  }

  const frenteOptions = frentesDisponibles(opciones, filtros.etapa);
  const torreOptions = torresDisponibles(opciones, filtros.etapa, filtros.frente);

  const meta = resultado ?? {};
  const hayFiltros = Object.values(filtros).some((valor) => (Array.isArray(valor) ? valor.length > 0 : valor !== ''));
  const limpiarFiltros = () => {
    setFiltros({ search: '', stage: [], etapa: [], frente: [], torre: [] });
    setPagina(1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Oportunidades</h1>
          <p className={styles.subtitle}>
            CRM Zoho{meta.pagination ? ` · ${meta.pagination.total.toLocaleString('es-CO')} oportunidades` : ''}
          </p>
        </div>
        <SyncStatusBar
          onTerminado={() => {
            cargar();
            listStages().then((res) => setStages(res.data)).catch(() => {});
          }}
        />
      </div>

      <div className={styles.row}>
        <Field
          className={styles.fieldMd}
          label={
            <span className={styles.labelConIcono}>
              <Search size={13} />
              Buscar
              <InfoTooltip text="Escribe el nombre del negocio, el contacto o el número de referencia para filtrar la lista." />
            </span>
          }
        >
          {(p) => <TextInput {...p} value={filtros.search} onChange={(e) => actualizarFiltro('search', e.target.value)} placeholder="Nombre, contacto o referencia…" />}
        </Field>
        <Field
          className={styles.fieldLg}
          label={
            <span className={styles.labelConIcono}>
              <ListFilter size={13} />
              Etapa CRM
              <InfoTooltip text="Filtra por la fase del proceso comercial (calificación, propuesta, negociación, cerrado…)." />
            </span>
          }
        >
          {(p) => (
            <MultiSelect {...p} options={stages} value={filtros.stage} onChange={(v) => actualizarFiltro('stage', v)} placeholder="Todas las etapas" />
          )}
        </Field>
        {opciones.etapasDisponibles.length > 0 && (
          <Field
            className={styles.fieldSm}
            label={
              <span className={styles.labelConIcono}>
                <Layers size={13} />
                Etapa del inmueble
                <InfoTooltip text="Filtra por la etapa del inmueble asociado a la oportunidad." />
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
            className={styles.fieldSm}
            label={
              <span className={styles.labelConIcono}>
                <MapPin size={13} />
                Frente
                <InfoTooltip text="Filtra por el proyecto/desarrollo del inmueble asociado a la oportunidad. Si hay una etapa elegida, solo se muestran los frentes de esa etapa." />
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
            className={styles.fieldSm}
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
        {hayFiltros && (
          <button type="button" className={styles.limpiar} onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className={styles.tableWrap}>
        {cargando ? (
          <p className={styles.cargando}>Cargando…</p>
        ) : (
          <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th aria-sort={ariaSort(sort, 'dealName')}>
                  <SortHeader label="Oportunidad" sortKey="dealName" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'stage')}>
                  <SortHeader label="Etapa CRM" sortKey="stage" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'referenciaRecaudo')}>
                  <SortHeader label="Ref. Recaudo" sortKey="referenciaRecaudo" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'inmueble')}>
                  <SortHeader label="Inmueble" sortKey="inmueble" sort={sort} onSort={toggleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.sinResultados}>No se encontraron oportunidades</td>
                </tr>
              ) : (
                sortedRows.map((op) => (
                  <tr key={op.id} className={styles.filaClicable} onClick={() => navigate(`/oportunidades/${op.id}`)}>
                    <td>
                      <div className={styles.persona}>
                        <span className={styles.avatar}>{iniciales(op.dealName)}</span>
                        <span className={styles.personaTexto}>
                          <span className={styles.nombreOportunidad}>{op.dealName}</span>
                        </span>
                      </div>
                    </td>
                    <td><StageBadge stage={op.stage} /></td>
                    <td>{op.referenciaRecaudo ? <span className={styles.refBadge}>{op.referenciaRecaudo}</span> : '—'}</td>
                    <td>{op.inmueble?.label || 'Sin inmueble'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {meta.pagination && (
            <Pagination page={pagina} pageSize={meta.pagination.limit} total={meta.pagination.total} onPageChange={setPagina} />
          )}
          </>
        )}
      </div>
    </div>
  );
}
