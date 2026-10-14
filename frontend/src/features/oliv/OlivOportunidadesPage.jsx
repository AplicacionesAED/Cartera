// Primer módulo de Oliv (proyecto nuevo, CRM HubSpot) -- lista + sync,
// calcado de oportunidades/OportunidadesListPage.jsx (Baía Kristal/Zoho).
// Columnas "Negocio"/"Etapa" pedidas explícitamente por el usuario
// (2026-09-11), calcadas 1:1 de cómo las muestra
// Centro-aplicaciones-comerciales-AED (mismo HubSpot) -- "Negocio" es
// `nombre_contacto` (el dealname de Oliv no siempre es útil, a veces es un
// valor en pesos) y "Etapa" ya viene resuelta a su etiqueta legible (no el
// ID interno del pipeline). Sin columna "Proyecto" (quitada 2026-09-16, a
// pedido del usuario): esta lista ya viene filtrada solo a Oliv
// (`proyecto_inmobiliario_cac`, ver olivOportunidad.sync.js), así que esa
// columna siempre mostraba el mismo valor. El resto de cada Deal sigue
// viajando crudo en `propiedades` (ver GET /oliv/oportunidades/:id), listo
// para una vista de detalle cuando haga falta.
//
// Filtros/columna Inmueble/orden por encabezado (Jefe Gabriel, 2026-09-25) --
// mismo patrón que Oportunidades de Baía Kristal, con una diferencia real de
// fondo: acá SÍ hay una FK real entre Oportunidad e Inmueble
// (`inmueble_hubspot_id -> OlivInmueble.hubspot_id`, ver
// olivOportunidad.model.js), así que la columna 'Inmueble' y el orden por
// ella salen de un `include`/`order` de Sequelize normal, no de una subquery
// correlacionada como en Baía Kristal (ahí el cruce es indirecto, por texto
// de `referencia_recaudo`). Tampoco hay jerarquía Etapa->Frente->Torre como
// Baía Kristal -- Oliv es un solo proyecto, los filtros de inmueble son
// planos (Torre + Estado del inmueble), mismo criterio que
// olivNegocio.service.js/olivInmueble.service.js.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, ListFilter, Building } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { StageBadge } from '../../components/ui/StageBadge.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SortHeader } from '../../components/ui/SortHeader.jsx';
import { useSortableTable, ariaSort } from '../../hooks/useSortableTable.js';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import {
  listOportunidadesOliv,
  listStagesOportunidadesOliv,
  iniciarSyncOportunidadesOliv,
  getSyncStatusOportunidadesOliv,
  getStatusOportunidadesOliv,
} from '../../api/oliv.js';
import { formatDateTime } from '../../utils/format.js';
import { SyncProgreso } from '../../components/SyncProgreso.jsx';
import { useSyncControl, normalizarEstadoLog } from '../../hooks/useSyncControl.js';
import styles from '../oportunidades/OportunidadesListPage.module.css';

function iniciales(texto = '') {
  const partes = String(texto).replace(/^(Baia Kristal|Oliv)\s*-\s*/i, '').trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[1][0] : ''}`.toUpperCase() || '?';
}

function SyncStatusBar({ onTerminado }) {
  const [hubspotConfigurado, setHubspotConfigurado] = useState(null);
  const sync = useSyncControl({
    iniciar: iniciarSyncOportunidadesOliv,
    obtener: getSyncStatusOportunidadesOliv,
    normalizar: normalizarEstadoLog,
    alTerminar: (e) => { if (e.ok) onTerminado?.(); },
  });
  const status = sync.estado;
  const errorSync = sync.errorInicio;

  useEffect(() => {
    getStatusOportunidadesOliv().then((res) => setHubspotConfigurado(res.data.hubspotConfigurado)).catch(() => {});
  }, []);

  return (
    <div className={styles.syncBar}>
      {hubspotConfigurado && sync.corriendo ? (
        <SyncProgreso progreso={sync.progreso} recibidoEn={sync.recibidoEn} titulo="Sincronizando con HubSpot…" compacto embebido />
      ) : (
        <>
          <div className={styles.syncEstado}>
            {hubspotConfigurado === false && <span className={styles.syncError}>HubSpot sin configurar (falta HUBSPOT_ACCESS_TOKEN)</span>}
            {hubspotConfigurado && status?.status === 'never' && 'Sin sincronizaciones'}
            {hubspotConfigurado && status?.status === 'success' && (
              <span>
                Última sync: <strong>{formatDateTime(status.finalizadoEn)}</strong>{' '}
                <span className={styles.syncOk}>({status.registrosSync} reg.)</span>
              </span>
            )}
            {errorSync && <span className={styles.syncError}>No se pudo iniciar la sincronización: {errorSync}</span>}
            {hubspotConfigurado && !errorSync && status?.status === 'error' && (
              <span className={styles.syncError}>Error en sync: {status.errorMsg?.slice(0, 120)}</span>
            )}
          </div>
          <Button variant="secondary" onClick={sync.ejecutar} disabled={!hubspotConfigurado}>
            <span className={styles.botonSyncInterior}>
              <RefreshCw size={14} aria-hidden="true" />
              Sincronizar ahora
            </span>
          </Button>
        </>
      )}
    </div>
  );
}

export function OlivOportunidadesPage() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = usePersistentState('oliv-oportunidades:filtros', { search: '', stage: '', torre: '', estadoInmueble: '' });
  const [pagina, setPagina] = usePersistentState('oliv-oportunidades:pagina', 1);
  const [resultado, setResultado] = useState(null);
  const [stages, setStages] = useState([]);
  const [opciones, setOpciones] = useState({ torresDisponibles: [], estadosInmuebleDisponibles: [] });
  const [cargando, setCargando] = useState(true);

  const valueGetters = useMemo(
    () => ({
      dealName: (f) => f.dealName ?? '',
      nombreContacto: (f) => f.nombreContacto ?? '',
      stage: (f) => f.stage ?? '',
      referenciaRecaudo: (f) => f.referenciaRecaudo ?? '',
      inmueble: (f) => f.inmueble?.label ?? '',
    }),
    []
  );
  // 'remote': el orden se resuelve en el backend ANTES de paginar (mismo
  // patrón que oportunidades/OportunidadesListPage.jsx y OtrosiesPage.jsx).
  const { sortedRows, sort, toggleSort: toggleSortInternal } = useSortableTable(resultado?.data ?? [], valueGetters, { mode: 'remote' });

  function toggleSort(key) {
    toggleSortInternal(key);
    setPagina(1);
  }

  async function cargar() {
    setCargando(true);
    try {
      const res = await listOportunidadesOliv({ ...filtros, sortBy: sort.key ?? undefined, sortDir: sort.direction ?? undefined, page: pagina, limit: 20 });
      setResultado(res.data);
      setOpciones((prev) => ({
        torresDisponibles: res.data.torresDisponibles ?? prev.torresDisponibles,
        estadosInmuebleDisponibles: res.data.estadosInmuebleDisponibles ?? prev.estadosInmuebleDisponibles,
      }));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    listStagesOportunidadesOliv().then((res) => setStages(res.data));
  }, []);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, pagina, sort]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }

  const meta = resultado ?? {};
  const hayFiltros = Object.values(filtros).some((valor) => valor !== '');
  const limpiarFiltros = () => {
    setFiltros({ search: '', stage: '', torre: '', estadoInmueble: '' });
    setPagina(1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Oportunidades</h1>
          <p className={styles.subtitle}>
            Oliv · CRM HubSpot{meta.pagination ? ` · ${meta.pagination.total.toLocaleString('es-CO')} oportunidades` : ''}
          </p>
        </div>
        <SyncStatusBar
          onTerminado={() => {
            cargar();
            listStagesOportunidadesOliv().then((res) => setStages(res.data)).catch(() => {});
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
            </span>
          }
        >
          {(p) => <TextInput {...p} value={filtros.search} onChange={(e) => actualizarFiltro('search', e.target.value)} placeholder="Negocio, contacto, referencia o unidad…" />}
        </Field>
        <Field
          className={styles.fieldLg}
          label={
            <span className={styles.labelConIcono}>
              <ListFilter size={13} />
              Etapa CRM
            </span>
          }
        >
          {(p) => (
            <Select {...p} value={filtros.stage} onChange={(e) => actualizarFiltro('stage', e.target.value)}>
              <option value="">Todas las etapas</option>
              {stages.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          )}
        </Field>
        {opciones.torresDisponibles.length > 0 && (
          <Field
            className={styles.fieldSm}
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
                {opciones.torresDisponibles.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
          </Field>
        )}
        {opciones.estadosInmuebleDisponibles.length > 0 && (
          <Field
            className={styles.fieldSm}
            label={
              <span className={styles.labelConIcono}>
                <ListFilter size={13} />
                Estado del inmueble
              </span>
            }
          >
            {(p) => (
              <Select {...p} value={filtros.estadoInmueble} onChange={(e) => actualizarFiltro('estadoInmueble', e.target.value)}>
                <option value="">Todos los estados</option>
                {opciones.estadosInmuebleDisponibles.map((e) => <option key={e} value={e}>{e}</option>)}
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
        {cargando ? (
          <p className={styles.cargando}>Cargando…</p>
        ) : (
          <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th aria-sort={ariaSort(sort, 'dealName')}>
                  <SortHeader label="Negocio" sortKey="dealName" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'nombreContacto')}>
                  <SortHeader label="Contacto" sortKey="nombreContacto" sort={sort} onSort={toggleSort} />
                </th>
                <th aria-sort={ariaSort(sort, 'stage')}>
                  <SortHeader label="Etapa" sortKey="stage" sort={sort} onSort={toggleSort} />
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
                  <td colSpan={5} className={styles.sinResultados}>No se encontraron oportunidades</td>
                </tr>
              ) : (
                sortedRows.map((op) => (
                  <tr key={op.id} className={styles.filaClicable} onClick={() => navigate(`/oliv/oportunidades/${op.id}`)}>
                    <td>
                      <div className={styles.persona}>
                        <span className={styles.avatar}>{iniciales(op.nombreContacto || op.dealName)}</span>
                        <span className={styles.personaTexto}>
                          <span className={styles.nombreOportunidad}>{op.dealName}</span>
                        </span>
                      </div>
                    </td>
                    <td>{op.nombreContacto ?? '—'}</td>
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
