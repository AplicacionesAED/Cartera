// Igual que useState, pero el valor se guarda en la ENTRADA DEL HISTORIAL del navegador (history.state) y no en el
// almacenamiento: sobrevive solo mientras el usuario va y viene por esa entrada. Sirve para los filtros, la página y el
// orden de las listas:
//   - lista -> detalle -> "Volver" / botón Atrás: la lista reaparece con sus filtros (vuelve a su misma entrada);
//   - entrar a la lista desde el menú lateral, un enlace o recargando en otra pestaña: entrada nueva, arranca limpia.
// Uso: idéntico a useState, con una clave que identifica el dato dentro de la entrada.
//   const [filtros, setFiltros] = useEstadoRetorno('negocios:filtros', FILTROS_VACIOS);
import { useEffect, useState } from 'react';

const prefijo = (key) => `ret:${key}`;

export function useEstadoRetorno(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const guardado = window.history.state?.usr?.[prefijo(key)];
      return guardado !== undefined ? guardado : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      const actual = window.history.state ?? {};
      // `usr` es donde React Router guarda el `state` de la ubicación: se conserva intacto y solo se agrega la clave.
      window.history.replaceState({ ...actual, usr: { ...(actual.usr ?? {}), [prefijo(key)]: value } }, '');
    } catch {
      // Sin acceso al historial el valor solo vive mientras la pantalla esté montada.
    }
  }, [key, value]);

  return [value, setValue];
}
