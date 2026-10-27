// OJO (oct 2026): ya NO se usa para filtros, páginas ni orden de listas -- esos arrancan limpios con useState (un filtro
// restaurado hacía que el primer pedido saliera filtrado y los selectores de filtro no recibieran sus opciones). Se deja
// solo para preferencias de interfaz (modo de sincronización, proyecto de Inicio, bloques KPI).
// PLANTILLA -- copiado tal cual del HRMS aed. Va en
// frontend/src/hooks/usePersistentState.js del proyecto nuevo.
//
// Regla que resuelve: el buscador, los <select> de filtro y la pagina
// actual de cualquier lista son parte del estado de esa pantalla -- salir
// (BackLink, sidebar, o browser back) y volver de inmediato no deberia
// resetearlos. React desmonta el componente de la lista al salir y lo
// vuelve a montar limpio al volver, asi que un useState comun pierde todo
// en silencio -- este fue un bug real reportado en el HRMS (elegir
// filtros, entrar a un registro, volver, filtros perdidos). Ver
// ARQUITECTURA-FRONTEND.md, "Filtros persistentes", para el detalle.
//
// Uso: identico a useState, drop-in swap.
//   const [filters, setFilters] = usePersistentState('empleados-list:filters', { q: '' });
import { useEffect, useState } from 'react';

export function usePersistentState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // sessionStorage puede fallar (modo privado, cuota llena) -- el filtro
      // simplemente no persiste, no es un error que deba interrumpir la pagina.
    }
  }, [key, value]);

  return [value, setValue];
}
