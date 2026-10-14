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
const registro = new Map();

function progresoSync(clave) {
  if (registro.has(clave)) return registro.get(clave);

  const estado = { fase: null, procesados: 0, total: null, iniciadoEn: null, faseIniciadaEn: null, actualizadoEn: null, activo: false };
  const ahora = () => new Date().toISOString();

  const api = {
    iniciar(fase = null) {
      Object.assign(estado, { fase, procesados: 0, total: null, iniciadoEn: ahora(), faseIniciadaEn: ahora(), actualizadoEn: ahora(), activo: true });
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
    terminar() { estado.activo = false; estado.actualizadoEn = ahora(); },
    snapshot() { return { ...estado }; },
  };
  registro.set(clave, api);
  return api;
}

module.exports = { progresoSync };
