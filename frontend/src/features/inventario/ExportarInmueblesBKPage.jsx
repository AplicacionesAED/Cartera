// Ruta /inventario/exportar: elegir las columnas del Excel de Inmuebles de Baía Kristal.
import { ExportarInmueblesPage } from './ExportarInmueblesPage.jsx';
import { cargarInmueblesBK, construirGruposBK, exportarInmueblesBK } from './exportarInmuebles.js';

const CONFIG = {
  titulo: 'Exportar inmuebles a Excel',
  subtitulo: 'Inventario de Baía Kristal (Zoho)',
  volverA: '/inventario',
  volverTexto: 'Inmuebles',
  filtrosKey: 'inventario-list:filtros',
  filtrosVacios: { search: '', categoria: '', estado: '', etapa: '', frente: '', torre: '' },
  cargarDatos: cargarInmueblesBK,
  construirGrupos: construirGruposBK,
  exportar: exportarInmueblesBK,
  seleccionInicial: ['nomenclaturaCompleta'],
};

export function ExportarInmueblesBKPage() {
  return <ExportarInmueblesPage config={CONFIG} />;
}
