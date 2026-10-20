// Indicador de progreso de una sincronización: fase actual, barra, "N de M", tiempo transcurrido y
// tiempo restante estimado. Se muestra EN LUGAR del botón mientras la tarea corre (ver useSyncControl).
// El tiempo restante se estima por fase (lo que lleva esa fase ÷ lo procesado × lo que falta); hasta
// que haya un primer avance, o si la fase no tiene total conocido, la barra va en modo indeterminado.
import { useEffect, useState } from 'react';
import { RefreshCw, XCircle } from 'lucide-react';
import { cancelarSync } from '../api/sync.js';
import styles from './SyncProgreso.module.css';

export function formatearDuracion(segundos) {
  if (segundos == null || !isFinite(segundos)) return null;
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

// `embebido`: se muestra dentro de otro contenedor con borde (la barra de sincronización de las listas), así que
// no dibuja su propia caja.
export function SyncProgreso({ progreso, recibidoEn, titulo = 'Sincronizando…', compacto = false, embebido = false }) {
  const [ahora, setAhora] = useState(() => Date.now());
  const [pidiendoCancelar, setPidiendoCancelar] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState(null);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cancelando = pidiendoCancelar || progreso?.cancelando === true;
  const puedeCancelar = progreso?.cancelable === true && !!progreso?.clave;
  async function cancelar() {
    if (!window.confirm('¿Cancelar la sincronización? Se conserva lo que ya se guardó y no se pierde nada.')) return;
    setPidiendoCancelar(true);
    setErrorCancelar(null);
    try {
      await cancelarSync(progreso.clave);
    } catch (err) {
      setPidiendoCancelar(false);
      setErrorCancelar(err?.message || 'No se pudo cancelar.');
    }
  }

  const hayTotal = progreso?.total > 0;
  const procesados = progreso?.procesados ?? 0;
  const pct = hayTotal ? Math.min(100, Math.round((procesados / progreso.total) * 100)) : null;

  // Las marcas de tiempo vienen del servidor; se miden entre ellas (sin depender del reloj de este equipo)
  // y se suma lo que ha pasado desde que llegó la última lectura.
  const desdeLectura = recibidoEn ? Math.max(0, (ahora - recibidoEn) / 1000) : 0;
  const ms = (iso) => (iso ? new Date(iso).getTime() : null);
  const transcurrido = progreso?.iniciadoEn && progreso?.actualizadoEn
    ? (ms(progreso.actualizadoEn) - ms(progreso.iniciadoEn)) / 1000 + desdeLectura
    : null;
  let restante = null;
  if (hayTotal && procesados > 0 && progreso.faseIniciadaEn) {
    const enFase = (ms(progreso.actualizadoEn) - ms(progreso.faseIniciadaEn)) / 1000;
    if (enFase > 0) restante = (enFase / procesados) * (progreso.total - procesados) - desdeLectura;
  }

  return (
    <div className={`${styles.panel} ${compacto ? styles.compacto : ''} ${embebido ? styles.embebido : ''}`} role="status" aria-live="polite">
      <div className={styles.cabecera}>
        <RefreshCw size={14} className={styles.giro} aria-hidden="true" />
        <span className={styles.titulo}>{titulo}</span>
        {transcurrido != null && <span className={styles.tiempo}>Transcurrido {formatearDuracion(transcurrido)}</span>}
        {puedeCancelar && (
          <button type="button" className={styles.cancelar} onClick={cancelar} disabled={cancelando}>
            <XCircle size={13} aria-hidden="true" />
            {cancelando ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>
      <div className={styles.fase}>{cancelando ? 'Cancelando… guardando lo que ya se alcanzó' : progreso?.fase || 'Iniciando…'}</div>
      {errorCancelar && <div className={styles.detalle} style={{ color: 'var(--color-danger, #b91c1c)' }}>{errorCancelar}</div>}
      <div className={styles.pista} aria-hidden="true">
        {pct != null ? <div className={styles.relleno} style={{ width: `${pct}%` }} /> : <div className={styles.indeterminado} />}
      </div>
      <div className={styles.detalle}>
        {hayTotal ? (
          <>
            <strong>{pct}%</strong> · {procesados.toLocaleString('es-CO')} de {progreso.total.toLocaleString('es-CO')}
            {' · '}
            {restante != null && restante >= 0 ? `faltan ~${formatearDuracion(restante)}` : 'calculando el tiempo restante…'}
          </>
        ) : (
          'Esperando respuesta… el tiempo restante se calcula al empezar a guardar'
        )}
      </div>
    </div>
  );
}
