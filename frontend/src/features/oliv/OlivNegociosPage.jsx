// Negocios de Oliv -- mismo rediseño que Baía Kristal (ver negocios/NegociosPage.jsx):
//   - `/oliv/negocios`      -> página de lista a ancho completo (filtros + tabla);
//   - `/oliv/negocios/:id`  -> detalle como ruta propia (banner + pestañas).
// Sin resumen de KPIs ni reconstruir (sí exporta, igual que Baía Kristal): Negocios de Oliv es una vista
// compuesta en vivo sobre Oportunidad+Inmueble, no algo que se sincronice aparte
// (ver backend/src/modules/olivNegocio/olivNegocio.service.js), y todavía no hay
// endpoint de estadísticas para Oliv. La lista va dirigida por inmueble: la
// mayoría de filas todavía no tienen negocio vinculado, así que el título siempre
// es la unidad y el comprador solo aparece cuando sí hay negocio.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, CircleDot, Building } from 'lucide-react';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EstadoInventarioBadge } from '../../components/ui/EstadoInventarioBadge.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { ExportMenu } from '../../components/ui/ExportMenu.jsx';
import { listNegociosOliv } from '../../api/oliv.js';
import { formatCOP } from '../../utils/format.js';
import { traerTodasLasPaginas } from '../../utils/exportarExcelColumnas.js';
import { exportNegociosOlivCsv, exportNegociosOlivExcel, exportNegociosOlivPdf } from './negociosOlivExport.js';
import { OlivNegocioDetalleContenido } from './OlivNegocioDetalleContenido.jsx';
import styles from '../negocios/NegociosPage.module.css';

const PAGE_SIZE = 50;
const FILTROS_VACIOS = { search: '', estado: [], torre: [], estadoInmueble: [] };

function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[partes.length - 1][0] : ''}`.toUpperCase() || '?';
}

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function OlivNegociosLista() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [searchInput, setSearchInput] = useState(filtros.search);
  const debouncedSearch = useDebounce(searchInput);
  const [opciones, setOpciones] = useState({ estados: [], torres: [], estadosInmueble: [] });
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (debouncedSearch === filtros.search) return;
    setFiltros((prev) => ({ ...prev, search: debouncedSearch }));
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await listNegociosOliv({ ...filtros, page: pagina, limit: PAGE_SIZE });
      setResultado(res.data);
      setOpciones((prev) => ({
        estados: res.data.estados ?? prev.estados,
        torres: res.data.torres ?? prev.torres,
        estadosInmueble: res.data.estadosInmueble ?? prev.estadosInmueble,
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

  async function handleExport(fmt) {
    setExportando(true);
    try {
      const filas = await traerTodasLasPaginas(listNegociosOliv, filtros);
      const nombre = `oliv-negocios-${new Date().toISOString().slice(0, 10)}`;
      if (fmt === 'xlsx') exportNegociosOlivExcel(filas, `${nombre}.xlsx`);
      else if (fmt === 'pdf') exportNegociosOlivPdf(filas, `${nombre}.pdf`);
      else exportNegociosOlivCsv(filas, `${nombre}.csv`);
    } catch (err) {
      window.alert(`Error al exportar los negocios: ${err.message}`);
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
  const hayFiltros = Object.values(filtros).some((valor) => (Array.isArray(valor) ? valor.length > 0 : valor !== ''));
  const sinNegocios = !cargando && total === 0 && !hayFiltros;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Negocios</h1>
          <p className={styles.subtitle}>Inmuebles y negocios de Oliv{total !== undefined && !sinNegocios ? ` · ${total.toLocaleString('es-CO')} resultados` : ''}</p>
        </div>
        <div className={styles.acciones}>
          <ExportMenu onExport={handleExport} disabled={exportando || cargando || sinNegocios} />
        </div>
      </div>

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
            {(p) => <TextInput {...p} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Unidad, referencia o comprador…" />}
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
              <MultiSelect {...p} options={opciones.torres.map((t) => ({ value: t, label: `Torre ${t}` }))} value={filtros.torre} onChange={(v) => actualizarFiltro('torre', v)} placeholder="Todas las torres" />
            )}
          </Field>
        )}
        {opciones.estadosInmueble.length > 0 && (
          <Field label="Estado del inmueble">
            {(p) => (
              <MultiSelect {...p} options={opciones.estadosInmueble} value={filtros.estadoInmueble} onChange={(v) => actualizarFiltro('estadoInmueble', v)} placeholder="Todos los estados" />
            )}
          </Field>
        )}
        {opciones.estados.length > 0 && (
          <Field
            label={
              <span className={styles.labelConIcono}>
                <CircleDot size={13} />
                Estado del negocio
              </span>
            }
          >
            {(p) => (
              <MultiSelect {...p} options={opciones.estados} value={filtros.estado} onChange={(v) => actualizarFiltro('estado', v)} placeholder="Todos los estados" />
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
        {sinNegocios ? (
          <div className={styles.vacio}>
            <p className={styles.vacioTitulo}>Sin negocios cargados</p>
            <p className={styles.vacioTexto}>Los negocios se generan a partir de las oportunidades de Oliv en etapa 8 o superior.</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Comprador</th>
                  <th>Estado del negocio</th>
                  <th>Estado del inmueble</th>
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
                    const saldo = Number(n.saldoActual) || null;
                    return (
                      <tr key={n.id} className={styles.filaClicable} onClick={() => navigate(`/oliv/negocios/${n.id}`)}>
                        <td>
                          <div className={styles.celdaTitulo}>
                            <span className={styles.nombre}>{n.unidad || n.referencia}</span>
                            {n.referencia && n.unidad && <span className={styles.detalleSec}>Ref. {n.referencia}</span>}
                          </div>
                        </td>
                        <td>
                          {n.comprador ? (
                            <div className={styles.persona}>
                              <span className={styles.avatar}>{iniciales(n.comprador)}</span>
                              <span>{n.comprador}</span>
                            </div>
                          ) : (
                            <span className={styles.muted}>Sin negocio</span>
                          )}
                        </td>
                        <td>{n.estado ? <Badge variant="neutral">{n.estado}</Badge> : <span className={styles.muted}>—</span>}</td>
                        <td>{n.estadoInmueble ? <EstadoInventarioBadge estado={n.estadoInmueble} /> : <span className={styles.muted}>—</span>}</td>
                        <td className={`${styles.derecha} ${styles.saldo} ${saldo > 0 ? styles.saldoPositivo : styles.muted}`}>{saldo ? formatCOP(saldo) : '—'}</td>
                      </tr>
                    );
                  })
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

export function OlivNegociosPage() {
  const { id } = useParams();
  if (!id) return <OlivNegociosLista />;
  return (
    <div className={styles.page}>
      <BackLink to="/oliv/negocios">Negocios</BackLink>
      <OlivNegocioDetalleContenido key={id} id={id} />
    </div>
  );
}
