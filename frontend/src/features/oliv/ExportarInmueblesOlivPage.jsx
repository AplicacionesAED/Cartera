// Ruta /oliv/inmuebles/exportar: elegir las columnas del Excel de Inmuebles de Oliv.
import { ExportarInmueblesPage } from '../inventario/ExportarInmueblesPage.jsx';
import { cargarInmueblesOliv, construirGruposOliv, exportarInmueblesOliv } from './exportarInmueblesOliv.js';

const CONFIG = {
  titulo: 'Exportar inmuebles a Excel',
  subtitulo: 'Unidades de Oliv (HubSpot)',
  volverA: '/oliv/inmuebles',
  volverTexto: 'Inmuebles',
  filtrosVacios: { search: '', torre: '', categoria: '', estado: '' },
  cargarDatos: cargarInmueblesOliv,
  construirGrupos: construirGruposOliv,
  exportar: exportarInmueblesOliv,
  seleccionInicial: ['nomenclaturaCompleta'],
};

export function ExportarInmueblesOlivPage() {
  return <ExportarInmueblesPage config={CONFIG} />;
}
