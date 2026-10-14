// Control común de los botones de sincronización: al pulsar, el botón DESAPARECE y en su lugar se
// muestra el progreso (ver components/SyncProgreso.jsx) hasta que la tarea termina. Así no se puede
// pulsar dos veces ni quedar la duda de si ya inició (cada pulsación extra, además, castiga la cuenta
// de Zoho con "demasiadas peticiones").
//
//   const sync = useSyncControl({ iniciar, obtener, normalizar: normalizarEstadoLog, alTerminar });
//   sync.corriendo      -> true desde el clic hasta que la tarea termina (ocultar el botón)
//   sync.progreso       -> { fase, procesados, total, iniciadoEn, faseIniciadaEn, actualizadoEn } | null
//   sync.estado         -> el estado normalizado (ok / error / datos de la última corrida)
//   sync.ejecutar()     -> inicia la tarea
//
// `normalizar(data)` convierte la respuesta del endpoint de estado a
// { corriendo, ok?, error?, progreso, ...resto }. Hay dos formas ya cubiertas abajo.
import { useCallback, useEffect, useRef, useState } from 'react';

const INTERVALO_MS = 2000;
// Entre el clic y que el servidor marque "en ejecución" puede pasar un instante (la tarea arranca
// después de responder): mientras tanto se sigue considerando iniciada.
const GRACIA_INICIO_MS = 15000;

// Forma A: { status: running | success | error | never, finalizadoEn, registrosSync, errorMsg, progreso }
export function normalizarEstadoLog(data) {
  if (!data) return { corriendo: false, progreso: null };
  return {
    ...data,
    // Un registro 'running' sin progreso activo es de una corrida que murió (reinicio del servidor): no cuenta como en curso.
    corriendo: data.status === 'running' && (data.progreso ? data.progreso.activo !== false : true),
    ok: data.status === 'success' ? true : data.status === 'error' ? false : null,
    error: data.status === 'error' ? data.errorMsg || 'La sincronización falló.' : null,
    progreso: data.progreso ?? null,
  };
}

// Forma B: { running, result: { ok, error, ... } | null, progreso }
export function normalizarEstadoRunning(data) {
  if (!data) return { corriendo: false, progreso: null };
  const result = data.result ?? null;
  const terminado = result && result.running !== true;
  return {
    ...data,
    corriendo: data.running === true,
    ok: terminado ? result.ok === true : null,
    error: terminado && result.ok === false ? result.error || 'La sincronización falló.' : null,
    progreso: data.progreso ?? null,
  };
}

export function useSyncControl({ iniciar, obtener, normalizar, alTerminar }) {
  const [estado, setEstado] = useState(null);
  const [recibidoEn, setRecibidoEn] = useState(0);
  const [iniciando, setIniciando] = useState(false);
  const [errorInicio, setErrorInicio] = useState(null);
  const [ejecutado, setEjecutado] = useState(false); // ya corrió una tarea en esta pantalla (para no mostrar errores viejos)
  const timerRef = useRef(null);
  const inicioRef = useRef(0);
  const vistoCorriendoRef = useRef(false);
  const alTerminarRef = useRef(alTerminar);
  alTerminarRef.current = alTerminar;

  const detener = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const consultar = useCallback(async () => {
    try {
      const res = await obtener();
      const nuevo = normalizar(res.data);
      setEstado(nuevo);
      setRecibidoEn(Date.now());
      if (nuevo.corriendo) {
        vistoCorriendoRef.current = true;
        return nuevo;
      }
      const dentroDeGracia = !vistoCorriendoRef.current && Date.now() - inicioRef.current < GRACIA_INICIO_MS;
      if (inicioRef.current && !dentroDeGracia) {
        // Terminó (o nunca llegó a arrancar): se libera el botón y se avisa una sola vez.
        detener();
        setIniciando(false);
        const eraNuestra = vistoCorriendoRef.current;
        inicioRef.current = 0;
        vistoCorriendoRef.current = false;
        if (eraNuestra) alTerminarRef.current?.(nuevo);
      } else if (!inicioRef.current) {
        detener();
      }
      return nuevo;
    } catch {
      return null; // un tropiezo de red no cancela el seguimiento: se reintenta en el siguiente ciclo
    }
  }, [obtener, normalizar, detener]);

  const seguir = useCallback(() => {
    detener();
    timerRef.current = setInterval(consultar, INTERVALO_MS);
  }, [consultar, detener]);

  // Al montar: si ya hay una tarea en curso (p. ej. el programador diario, o la pantalla recargada), se muestra su progreso.
  useEffect(() => {
    let vivo = true;
    obtener()
      .then((res) => {
        if (!vivo) return;
        const nuevo = normalizar(res.data);
        setEstado(nuevo);
        setRecibidoEn(Date.now());
        if (nuevo.corriendo) {
          vistoCorriendoRef.current = true;
          inicioRef.current = Date.now();
          setEjecutado(true);
          setIniciando(true);
          seguir();
        }
      })
      .catch(() => {});
    return () => {
      vivo = false;
      detener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ejecutar = useCallback(async () => {
    setErrorInicio(null);
    setEjecutado(true);
    setIniciando(true);
    inicioRef.current = Date.now();
    vistoCorriendoRef.current = false;
    try {
      await iniciar();
    } catch (err) {
      setErrorInicio(err?.message || 'No se pudo iniciar la sincronización.');
      setIniciando(false);
      inicioRef.current = 0;
      return;
    }
    seguir();
    consultar();
  }, [iniciar, seguir, consultar]);

  return {
    corriendo: iniciando || estado?.corriendo === true,
    progreso: estado?.corriendo ? estado.progreso : null,
    recibidoEn,
    estado,
    errorInicio,
    ejecutado,
    ejecutar,
    refrescar: consultar,
  };
}
