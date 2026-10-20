import client from './client';

// Pide cancelar una sincronización en curso. La tarea se detiene sola en su siguiente punto seguro y conserva lo
// que ya había guardado (ver backend utils/progresoSync.js).
export function cancelarSync(clave) {
  return client.post(`/sync/cancelar/${encodeURIComponent(clave)}`);
}
