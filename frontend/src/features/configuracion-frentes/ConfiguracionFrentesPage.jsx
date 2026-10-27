// Fechas de entrega por Frente -> Torre -> Piso, como un arbol de desplegables
// (rediseno 2026-10-05; antes era una tabla plana + formulario de texto libre).
// El backend (configuracionFrente.service.js#list) ya devuelve una fila por cada
// combinacion real del inventario -- frente (torre/piso null), torre (piso null)
// y piso -- con su fecha si la hay; aqui se arman en arbol y cada nodo edita su
// propia fecha en linea. Vive en Accesos ("Fechas de entrega", ver
// AccesosLayout.jsx).
//
// Los tres niveles son mutuamente excluyentes (lo exige el backend con 409): si
// un nivel de arriba tiene fecha, los de abajo quedan bloqueados, y al reves. La
// pantalla lo refleja deshabilitando el control con una nota, en vez de dejar
// que el usuario choque con el error.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { AccesosLayout } from '../../components/layout/AccesosLayout.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { useEstadoRetorno } from '../../hooks/useEstadoRetorno.js';
import {
  listConfiguracionesFrente,
  actualizarFechaProyecto,
  actualizarFechaTorre,
  actualizarFechaPiso,
} from '../../api/configuracionesFrentes.js';
import usuariosStyles from '../accesos/Usuarios.module.css';
import styles from './ConfiguracionFrentes.module.css';

// Convierte la lista plana en { frente, fecha, torres: [{ torre, fecha, pisos: [{ piso, fecha }] }] }
function armarArbol(filas) {
  const frentes = new Map();
  for (const f of filas) {
    if (!frentes.has(f.frente)) frentes.set(f.frente, { frente: f.frente, fecha: null, torres: new Map() });
    const nodoFrente = frentes.get(f.frente);
    if (f.torre == null) {
      nodoFrente.fecha = f.fechaEntrega;
      continue;
    }
    if (!nodoFrente.torres.has(f.torre)) nodoFrente.torres.set(f.torre, { torre: f.torre, fecha: null, pisos: [] });
    const nodoTorre = nodoFrente.torres.get(f.torre);
    if (f.piso == null) nodoTorre.fecha = f.fechaEntrega;
    else nodoTorre.pisos.push({ piso: f.piso, fecha: f.fechaEntrega });
  }
  return [...frentes.values()].map((fr) => {
    const torres = [...fr.torres.values()].map((t) => ({ ...t, pisosConFecha: t.pisos.filter((p) => p.fecha).length }));
    const configuradas = torres.reduce((acc, t) => acc + (t.fecha ? 1 : 0) + t.pisosConFecha, 0);
    return { ...fr, torres, torresConFecha: torres.filter((t) => t.fecha || t.pisosConFecha > 0).length, configuradas };
  });
}

// Fecha editable de un nodo: input de fecha + Guardar (solo si cambio) + Quitar.
function FechaControl({ valor, bloqueadoPor, onGuardar, onQuitar }) {
  const [borrador, setBorrador] = useState(valor ?? '');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setBorrador(valor ?? '');
  }, [valor]);

  const cambio = borrador !== (valor ?? '');

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar(borrador || null);
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    setGuardando(true);
    try {
      await onQuitar();
    } finally {
      setGuardando(false);
    }
  }

  if (bloqueadoPor) return <span className={styles.bloqueado}>{bloqueadoPor}</span>;

  return (
    <div className={styles.fechaControl}>
      <input
        type="date"
        className={styles.fechaInput}
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        disabled={guardando}
        aria-label="Fecha de entrega"
      />
      {cambio && borrador && (
        <Button variant="primary" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      )}
      {valor && !cambio && (
        <Button variant="secondary" onClick={quitar} disabled={guardando}>
          Quitar
        </Button>
      )}
    </div>
  );
}

function plural(n, palabra) {
  return `${n} ${palabra}${n === 1 ? '' : 's'}`;
}

function Chevron({ abierto }) {
  return <ChevronRight size={16} className={`${styles.chevron} ${abierto ? styles.chevronAbierto : ''}`} aria-hidden="true" />;
}

export function ConfiguracionFrentesPage() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useEstadoRetorno('configuracion-frentes:busqueda', '');
  const [abiertos, setAbiertos] = useState(() => new Set());

  const cargar = useCallback(async () => {
    try {
      const res = await listConfiguracionesFrente();
      setFilas(res.data);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const arbol = useMemo(() => armarArbol(filas), [filas]);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? arbol.filter((f) => f.frente.toLowerCase().includes(q)) : arbol;
  }, [arbol, busqueda]);

  function alternar(clave) {
    setAbiertos((prev) => {
      const sig = new Set(prev);
      if (sig.has(clave)) sig.delete(clave);
      else sig.add(clave);
      return sig;
    });
  }

  function expandirTodo() {
    const todas = new Set();
    for (const f of visibles) {
      todas.add(f.frente);
      for (const t of f.torres) todas.add(`${f.frente}||${t.torre}`);
    }
    setAbiertos(todas);
  }

  // Ejecuta una mutacion, recarga el arbol y muestra el error del backend (409 de
  // exclusion entre niveles) en el banner en vez de perderlo.
  async function ejecutar(accion) {
    setError(null);
    try {
      await accion();
      await cargar();
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar la fecha');
    }
  }

  const totalConfiguradas = arbol.reduce((acc, f) => acc + (f.fecha ? 1 : 0) + f.configuradas, 0);

  return (
    <div className={usuariosStyles.page}>
      <AccesosLayout>
        <div className={usuariosStyles.listHeader}>
          <div>
            <h1 className={usuariosStyles.title}>Fechas de entrega</h1>
            <p className={usuariosStyles.subtitle}>
              Por frente, torre y piso. Reemplaza la fecha estimada de la cuota Saldo Contraentrega en el cálculo de conciliación. Una fecha en un nivel
              cubre todo lo que está debajo; para fijar una más específica, quita primero la del nivel superior.
            </p>
          </div>
        </div>

        <div className={styles.barra}>
          <label className={styles.buscador}>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar frente…"
              aria-label="Buscar frente"
            />
          </label>
          <span className={styles.resumen}>
            {visibles.length} frentes · {totalConfiguradas} con fecha configurada
          </span>
          <div className={styles.barraAcciones}>
            <Button variant="secondary" onClick={expandirTodo}>
              Expandir todo
            </Button>
            <Button variant="secondary" onClick={() => setAbiertos(new Set())}>
              Contraer todo
            </Button>
          </div>
        </div>

        {error && (
          <div className={usuariosStyles.errorBanner} role="alert">
            {error}
          </div>
        )}

        {cargando ? (
          <p className={styles.estado}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className={styles.estado}>{arbol.length === 0 ? 'Todavía no hay frentes en el inventario.' : 'Ningún frente coincide con la búsqueda.'}</p>
        ) : (
          <div className={styles.lista}>
            {visibles.map((fr) => {
              const abiertoFrente = abiertos.has(fr.frente);
              const frenteBloqueado = !fr.fecha && fr.configuradas > 0 ? 'Hay fechas por torre o piso — quítalas para fijar una fecha única' : null;
              return (
                <section key={fr.frente} className={styles.nodo}>
                  <div className={styles.fila}>
                    <button type="button" className={styles.toggle} onClick={() => alternar(fr.frente)} aria-expanded={abiertoFrente}>
                      <Chevron abierto={abiertoFrente} />
                      <span className={styles.nombre}>{fr.frente}</span>
                      <span className={styles.meta}>{plural(fr.torres.length, 'torre')}</span>
                      {fr.fecha ? <Badge variant="success">Fecha única</Badge> : fr.configuradas > 0 ? <Badge variant="info">{plural(fr.configuradas, 'configurada')}</Badge> : <Badge variant="neutral">Sin fecha</Badge>}
                    </button>
                    <FechaControl
                      valor={fr.fecha}
                      bloqueadoPor={frenteBloqueado}
                      onGuardar={(f) => ejecutar(() => actualizarFechaProyecto(fr.frente, f))}
                      onQuitar={() => ejecutar(() => actualizarFechaProyecto(fr.frente, null))}
                    />
                  </div>

                  {abiertoFrente && (
                    <div className={styles.hijos}>
                      {fr.torres.map((t) => {
                        const claveTorre = `${fr.frente}||${t.torre}`;
                        const abiertaTorre = abiertos.has(claveTorre);
                        const torreBloqueada = fr.fecha
                          ? 'Cubierta por la fecha del frente'
                          : !t.fecha && t.pisosConFecha > 0
                            ? 'Hay fechas por piso — quítalas para fijar una fecha única'
                            : null;
                        return (
                          <div key={claveTorre} className={styles.nodoTorre}>
                            <div className={styles.fila}>
                              <button type="button" className={styles.toggle} onClick={() => alternar(claveTorre)} aria-expanded={abiertaTorre}>
                                <Chevron abierto={abiertaTorre} />
                                <span className={styles.nombreTorre}>Torre {t.torre}</span>
                                <span className={styles.meta}>{plural(t.pisos.length, 'piso')}</span>
                                {t.fecha ? <Badge variant="success">Fecha única</Badge> : t.pisosConFecha > 0 ? <Badge variant="info">{plural(t.pisosConFecha, 'piso')} con fecha</Badge> : null}
                              </button>
                              <FechaControl
                                valor={t.fecha}
                                bloqueadoPor={torreBloqueada}
                                onGuardar={(f) => ejecutar(() => actualizarFechaTorre(fr.frente, t.torre, f))}
                                onQuitar={() => ejecutar(() => actualizarFechaTorre(fr.frente, t.torre, null))}
                              />
                            </div>

                            {abiertaTorre && (
                              <div className={styles.pisos}>
                                {t.pisos.length === 0 ? (
                                  <p className={styles.estado}>Esta torre no tiene pisos registrados en el inventario.</p>
                                ) : (
                                  t.pisos.map((p) => (
                                    <div key={p.piso} className={`${styles.fila} ${styles.filaPiso}`}>
                                      <span className={styles.nombrePiso}>Piso {p.piso}</span>
                                      <FechaControl
                                        valor={p.fecha}
                                        bloqueadoPor={fr.fecha ? 'Cubierto por la fecha del frente' : t.fecha ? 'Cubierto por la fecha de la torre' : null}
                                        onGuardar={(f) => ejecutar(() => actualizarFechaPiso(fr.frente, t.torre, p.piso, f))}
                                        onQuitar={() => ejecutar(() => actualizarFechaPiso(fr.frente, t.torre, p.piso, null))}
                                      />
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </AccesosLayout>
    </div>
  );
}
