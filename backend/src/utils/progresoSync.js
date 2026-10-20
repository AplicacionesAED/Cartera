// Progreso en memoria de las sincronizaciones largas (Zoho, HubSpot, fiducia), para que la pantalla
// muestre cómo va y cuánto falta. Una instancia por tarea (clave fija). Vive en el proceso: si el
// servidor se reinicia a mitad de una sync, el progreso se pierde junto con la sync.
//
//   const p = progresoSync('inventario');
//   p.iniciar('Trayendo productos de Zoho');
//   p.fase('Guardando productos', total);   // total opcional (null = no se sabe todavía)
//   p.avanzar(50);                          // procesados += 50 (o p.establecer(n))
//   p.terminar();
// `snapshot()` es lo que se expone en los endpoints de estado (campo `progreso`).
//
// CANCELACIÓN: la pantalla pide cancelar (`p.cancelar()`); la tarea NO se corta de golpe, sino que en sus
// puntos seguros (entre lotes/páginas, nunca a mitad de un registro) llama `p.verificar()`, que lanza
// `SyncCancelada`. La tarea la atrapa, conserva lo ya guardado (cada registro se guarda completo) y termina con
// estado "cancelada" sin ejecutar los pasos destructivos de cierre (limpiezas, avanzar la marca del último sync).
const registro = new Map();

class SyncCancelada extends Error {
  constructor() {
    super('Sincronización cancelada');
    this.name = 'SyncCancelada';
  }
}

const esCancelacion = (err) => err instanceof SyncCancelada || err?.name === 'SyncCancelada';

// `opciones.cancelable = false` para tareas que no se pueden interrumpir sin dejar datos a medias.
function progresoSync(clave, opciones = {}) {
  if (registro.has(clave)) return registro.get(clave);

  const estado = { clave, cancelable: opciones.cancelable !== false, cancelando: false, fase: null, procesados: 0, total: null, iniciadoEn: null, faseIniciadaEn: null, actualizadoEn: null, activo: false };
  const ahora = () => new Date().toISOString();

  const api = {
    iniciar(fase = null) {
      Object.assign(estado, { fase, procesados: 0, total: null, iniciadoEn: ahora(), faseIniciadaEn: ahora(), actualizadoEn: ahora(), activo: true, cancelando: false });
    },
    // Cambia de fase: reinicia el contador (el tiempo restante se estima por fase).
    fase(fase, total = null) {
      Object.assign(estado, { fase, procesados: 0, total, faseIniciadaEn: ahora(), actualizadoEn: ahora() });
    },
    // Cambia solo el texto de la fase (p. ej. el número de página) sin reiniciar el contador ni el reloj de la fase.
    etiqueta(fase) { estado.fase = fase; estado.actualizadoEn = ahora(); },
    total(total) { estado.total = total; estado.actualizadoEn = ahora(); },
    avanzar(n = 1) { estado.procesados += n; estado.actualizadoEn = ahora(); },
    establecer(procesados, total = estado.total) { estado.procesados = procesados; estado.total = total; estado.actualizadoEn = ahora(); },
    terminar() { estado.activo = false; estado.cancelando = false; estado.actualizadoEn = ahora(); },
    // Pide cancelar. Devuelve false si no hay nada en curso o la tarea no admite cancelación.
    cancelar() {
      if (!estado.activo || !estado.cancelable) return false;
      estado.cancelando = true;
      estado.fase = 'Cancelando… guardando lo que ya se alcanzó';
      estado.actualizadoEn = ahora();
      return true;
    },
    // Punto seguro de la tarea: si se pidió cancelar, lanza SyncCancelada.
    verificar() { if (estado.cancelando) throw new SyncCancelada(); },
    estaCancelando() { return estado.cancelando; },
    snapshot() { return { ...estado }; },
  };
  registro.set(clave, api);
  return api;
}

module.exports = { progresoSync, SyncCancelada, esCancelacion };
