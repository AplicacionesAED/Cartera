// Lista de encargos con importación de Excel -- compartida por Baía Kristal
// (EncargosListPage) y Oliv (OlivEncargosListPage), que solo difieren en la API,
// las rutas y dos detalles (filtro por proyecto y fecha del Excel). Rediseño
// 2026-10-05: zona de importación con arrastrar y soltar, resumen, filtros con
// etiqueta y una tabla en tarjeta con acciones por fila.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, FileSpreadsheet, Pencil, Trash2, Upload, X as XIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { useEstadoRetorno } from '../../hooks/useEstadoRetorno.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { descripcionProyecto } from '../../utils/proyectos.js';
import base from '../negocios/NegociosPage.module.css';
import styles from './Encargos.module.css';

const PAGE_SIZE = 20;

// config: { titulo, subtitulo, claveFiltros, rutaBase, api: { list, upload, update, remove },
//           conProyecto, conFecha, avisoEliminar }
export function EncargosLista({ config }) {
  const { titulo, subtitulo, claveFiltros, rutaBase, api, conProyecto = false, conFecha = false, avisoEliminar } = config;
  const filtrosVacios = conProyecto ? { search: '', proyecto: [] } : { search: '' };
  const [filtros, setFiltros] = useEstadoRetorno(`${claveFiltros}:filtros`, filtrosVacios);
  const [pagina, setPagina] = useEstadoRetorno(`${claveFiltros}:pagina`, 1);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [resultadosSubida, setResultadosSubida] = useState(null);
  // Fecha del Excel a subir (solo Oliv) -- opcional, vacía = el backend usa hoy.
  const [fechaSubida, setFechaSubida] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', codigo: '', fecha: '' });
  const [eliminandoId, setEliminandoId] = useState(null);
  const inputRef = useRef(null);

  async function cargar() {
    setCargando(true);
    try {
      const res = await api.list({ ...filtros, page: pagina, limit: PAGE_SIZE });
      setResultado(res.data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, pagina]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }

  async function handleFiles(fileList) {
    const files = [...fileList].filter((f) => /\.xlsx?$/i.test(f.name));
    if (files.length === 0) return;
    setSubiendo(true);
    setResultadosSubida(null);
    const out = [];
    for (const file of files) {
      try {
        const res = await api.upload(file, conFecha ? fechaSubida || undefined : undefined);
        out.push({ file: file.name, hojas: res.data.hojas?.length ?? 0, ok: true });
      } catch (err) {
        out.push({ file: file.name, error: err.message, ok: false });
      }
    }
    setResultadosSubida(out);
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = '';
    setPagina(1);
    cargar();
  }

  function startEdit(enc) {
    setEditandoId(enc.id);
    setEditForm({ nombre: enc.nombre ?? '', codigo: enc.codigo ?? '', fecha: enc.fecha ?? '' });
  }

  async function handleSaveEdit(id) {
    await api.update(id, conFecha ? editForm : { nombre: editForm.nombre, codigo: editForm.codigo });
    setEditandoId(null);
    cargar();
  }

  async function handleDelete(id, nombre) {
    if (!window.confirm(`¿Eliminar el encargo "${nombre}"? ${avisoEliminar}`)) return;
    setEliminandoId(id);
    try {
      await api.remove(id);
      cargar();
    } finally {
      setEliminandoId(null);
    }
  }

  const meta = resultado ?? {};
  const filas = meta.data ?? [];
  const total = meta.pagination?.total;
  const hayFiltros = Object.values(filtros).some((v) => v !== '');
  const columnas = conFecha ? 6 : 5;

  return (
    <div className={base.page}>
      <div className={base.header}>
        <div>
          <h1 className={base.title}>{titulo}</h1>
          <p className={base.subtitle}>
            {subtitulo}
            {total !== undefined ? ` · ${total.toLocaleString('es-CO')} encargo${total !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
      </div>

      <div
        className={`${styles.dropzone} ${arrastrando ? styles.dropzoneActiva : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <span className={styles.dropzoneIcono}>
          <FileSpreadsheet size={24} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className={styles.dropzoneTexto}>
          <p className={styles.dropzoneTitulo}>Importar archivos de Excel</p>
          <p className={styles.dropzoneAyuda}>Arrastra uno o varios archivos .xlsx aquí, o elígelos desde tu equipo.</p>
        </div>
        <div className={styles.dropzoneControles}>
          {conFecha && (
            <Field label="Fecha del Excel (vacía = hoy)">
              {(p) => <TextInput {...p} type="date" value={fechaSubida} onChange={(e) => setFechaSubida(e.target.value)} />}
            </Field>
          )}
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={subiendo}>
            <span className={base.botonInterior}>
              <Upload size={14} aria-hidden="true" />
              {subiendo ? 'Procesando…' : 'Importar Excel'}
            </span>
          </Button>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className={styles.hiddenInput} onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {resultadosSubida && (
        <div className={styles.resultadosSubida}>
          {resultadosSubida.map((r, i) => (
            <p key={i} className={r.ok ? styles.resultadoOk : styles.resultadoError}>
              {r.ok ? <Check size={14} /> : <XIcon size={14} />}
              <strong>{r.file}</strong> — {r.ok ? `${r.hojas} hoja${r.hojas !== 1 ? 's' : ''} importada${r.hojas !== 1 ? 's' : ''}` : r.error}
            </p>
          ))}
        </div>
      )}

      <div className={base.filtros}>
        <div className={base.filtroBusqueda}>
          <Field label="Buscar">
            {(p) => <TextInput {...p} value={filtros.search} onChange={(e) => actualizarFiltro('search', e.target.value)} placeholder="Nombre, código, archivo…" />}
          </Field>
        </div>
        {conProyecto && (meta.codigos ?? []).length > 0 && (
          <Field label="Proyecto">
            {(p) => (
              <MultiSelect {...p} options={meta.codigos.map((c) => ({ value: c, label: descripcionProyecto(c) || c }))} value={filtros.proyecto} onChange={(v) => actualizarFiltro('proyecto', v)} placeholder="Todos los proyectos" />
            )}
          </Field>
        )}
        {hayFiltros && (
          <button type="button" className={base.limpiar} onClick={() => { setFiltros(filtrosVacios); setPagina(1); }}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className={base.tableWrap}>
        <table className={base.table}>
          <thead>
            <tr>
              {conFecha && <th>Fecha</th>}
              <th>Encargo</th>
              <th>Archivo</th>
              <th>Hojas</th>
              <th>Importado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={columnas} className={base.mensaje}>Cargando…</td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={columnas} className={base.mensaje}>
                  {hayFiltros ? 'Sin encargos para los filtros aplicados.' : 'Sin encargos importados. Arrastra un Excel arriba o usa "Importar Excel" para comenzar.'}
                </td>
              </tr>
            ) : (
              filas.map((enc) => (
                <tr key={enc.id}>
                  {conFecha && (
                    <td className={styles.fecha}>
                      {editandoId === enc.id ? (
                        <TextInput type="date" value={editForm.fecha} onChange={(e) => setEditForm((f) => ({ ...f, fecha: e.target.value }))} />
                      ) : (
                        formatDate(enc.fecha)
                      )}
                    </td>
                  )}
                  <td>
                    {editandoId === enc.id ? (
                      <div className={styles.editForm}>
                        <TextInput value={editForm.nombre} onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del encargo" />
                        <TextInput value={editForm.codigo} onChange={(e) => setEditForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="Código" />
                        <div className={styles.editAcciones}>
                          <Button variant="primary" onClick={() => handleSaveEdit(enc.id)}>Guardar</Button>
                          <Button variant="secondary" onClick={() => setEditandoId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.encargoCelda}>
                        <span className={styles.archivoIcono}>
                          <FileSpreadsheet size={18} strokeWidth={1.75} aria-hidden="true" />
                        </span>
                        <div className={base.celdaTitulo}>
                          <Link to={`${rutaBase}/${enc.id}`} className={styles.enlace}>{enc.nombre}</Link>
                          {enc.codigo && (
                            <div className={styles.filaCodigo}>
                              <span className={styles.codigoBadge}>{enc.codigo}</span>
                              {conProyecto && descripcionProyecto(enc.codigo) && <span className={styles.descripcionProyecto}>{descripcionProyecto(enc.codigo)}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className={styles.archivoNombre} title={enc.archivo_nombre}>{enc.archivo_nombre}</td>
                  <td>
                    <div className={styles.hojasBadges}>
                      {(enc.hojas ?? []).map((h) => (
                        <span key={h.id} className={styles.hojaBadge}>{h.nombre_hoja} ({h.total_filas})</span>
                      ))}
                    </div>
                  </td>
                  <td className={styles.fechaCorta}>{formatDateTime(enc.creado_en)}</td>
                  <td className={styles.accionesCol}>
                    <div className={styles.acciones}>
                      {editandoId !== enc.id && (
                        <button type="button" className={styles.iconButton} title="Editar" aria-label={`Editar ${enc.nombre}`} onClick={() => startEdit(enc)}>
                          <Pencil size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                        title="Eliminar"
                        aria-label={`Eliminar ${enc.nombre}`}
                        disabled={eliminandoId === enc.id}
                        onClick={() => handleDelete(enc.id, enc.nombre)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!cargando && total > 0 && <Pagination page={pagina} pageSize={PAGE_SIZE} total={total} onPageChange={setPagina} />}
      </div>
    </div>
  );
}
