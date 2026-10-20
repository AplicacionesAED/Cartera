import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.jsx';
import { ProtectedRoute } from './auth/ProtectedRoute.jsx';

// Cada ruta es su propio chunk (ver "Lazy loading de rutas" en
// ARQUITECTURA-FRONTEND.md) -- los componentes son named exports, no
// default, asi que este helper adapta la forma que React.lazy espera.
function lazyNamed(loader, name) {
  return lazy(() => loader().then((module) => ({ default: module[name] })));
}

const LoginPage = lazyNamed(() => import('./features/auth/LoginPage.jsx'), 'LoginPage');
const CambiarPasswordPage = lazyNamed(() => import('./features/auth/CambiarPasswordPage.jsx'), 'CambiarPasswordPage');
const ConfiguracionFrentesPage = lazyNamed(() => import('./features/configuracion-frentes/ConfiguracionFrentesPage.jsx'), 'ConfiguracionFrentesPage');
// Accesos (configuración del sistema, uso ocasional -- ver AccesosLayout.jsx
// y "Regla: administración de cuentas/accesos..." en ARQUITECTURA-FRONTEND.md).
// UsuariosListPage/UsuarioFormPage son el mismo patrón lista+ruta de
// creación/edición 1:1 del HRMS (ver el comentario de cabecera de cada uno).
const UsuariosListPage = lazyNamed(() => import('./features/accesos/UsuariosListPage.jsx'), 'UsuariosListPage');
const UsuarioFormPage = lazyNamed(() => import('./features/accesos/UsuarioFormPage.jsx'), 'UsuarioFormPage');
// Roles dinámicos (ver ARQUITECTURA-FRONTEND.md, "Roles y permisos
// dinámicos") -- reemplaza el anterior esAdmin/modulosPermitidos por
// usuario, ahora un usuario elige roles reasignables desde acá sin tocar
// código.
const RolesPage = lazyNamed(() => import('./features/accesos/RolesPage.jsx'), 'RolesPage');
const RolFormPage = lazyNamed(() => import('./features/accesos/RolFormPage.jsx'), 'RolFormPage');
const RolDetallePage = lazyNamed(() => import('./features/accesos/RolDetallePage.jsx'), 'RolDetallePage');
const HistorialPage = lazyNamed(() => import('./features/accesos/HistorialPage.jsx'), 'HistorialPage');
const SincronizacionPage = lazyNamed(() => import('./features/accesos/SincronizacionPage.jsx'), 'SincronizacionPage');
// Layout maestro-detalle (sidebar + panel derecho) -- una sola pagina para
// "inventario" y "inventario/:id", mismo patron que NegociosPage.jsx.
const InventarioPage = lazyNamed(() => import('./features/inventario/InventarioPage.jsx'), 'InventarioPage');
const ExportarInmueblesBKPage = lazyNamed(() => import('./features/inventario/ExportarInmueblesBKPage.jsx'), 'ExportarInmueblesBKPage');
const OportunidadesListPage = lazyNamed(() => import('./features/oportunidades/OportunidadesListPage.jsx'), 'OportunidadesListPage');
const OportunidadDetallePage = lazyNamed(() => import('./features/oportunidades/OportunidadDetallePage.jsx'), 'OportunidadDetallePage');
const EncargosListPage = lazyNamed(() => import('./features/fiducia/EncargosListPage.jsx'), 'EncargosListPage');
// El click de un encargo en la lista va a esta grilla de unidades (mismo
// destino real que en el legado, ver el comentario de cabecera de
// EncargoNomenclaturasPage.jsx) -- el visor de hojas crudas queda como
// vista secundaria en /fiducia/:id/hojas.
const EncargoNomenclaturasPage = lazyNamed(() => import('./features/fiducia/EncargoNomenclaturasPage.jsx'), 'EncargoNomenclaturasPage');
const EncargoHojasPage = lazyNamed(() => import('./features/fiducia/EncargoHojasPage.jsx'), 'EncargoHojasPage');
const HojaViewerPage = lazyNamed(() => import('./features/fiducia/HojaViewerPage.jsx'), 'HojaViewerPage');
const ApartamentoDetallePage = lazyNamed(() => import('./features/fiducia/ApartamentoDetallePage.jsx'), 'ApartamentoDetallePage');
const MovimientosPage = lazyNamed(() => import('./features/fiducia/MovimientosPage.jsx'), 'MovimientosPage');
// Layout maestro-detalle (sidebar + panel derecho) -- una sola pagina para
// "negocios" y "negocios/:id" (el id, si existe, decide que se muestra en
// el panel derecho; ver el comentario de cabecera de NegociosPage.jsx).
const NegociosPage = lazyNamed(() => import('./features/negocios/NegociosPage.jsx'), 'NegociosPage');
const DashboardPage = lazyNamed(() => import('./features/dashboard/DashboardPage.jsx'), 'DashboardPage');
const CarteraMoraPage = lazyNamed(() => import('./features/cartera-mora/CarteraMoraPage.jsx'), 'CarteraMoraPage');
const ResumenPage = lazyNamed(() => import('./features/resumen/ResumenPage.jsx'), 'ResumenPage');
// Otrosíes (Baía Kristal) -- módulo de SOLO LECTURA, tabla de consulta del
// estado del 'Otro sí - Contrato de Fiducia' sobre los Deals (ver
// features/otrosies/OtrosiesPage.jsx).
const InicioPage = lazyNamed(() => import('./features/inicio/InicioPage.jsx'), 'InicioPage');
const OtrosiesPage = lazyNamed(() => import('./features/otrosies/OtrosiesPage.jsx'), 'OtrosiesPage');
// Proyecto Oliv (CRM HubSpot) -- primer módulo, ver
// features/oliv/OlivOportunidadesPage.jsx.
const OlivOportunidadesPage = lazyNamed(() => import('./features/oliv/OlivOportunidadesPage.jsx'), 'OlivOportunidadesPage');
const OlivOportunidadDetallePage = lazyNamed(() => import('./features/oliv/OlivOportunidadDetallePage.jsx'), 'OlivOportunidadDetallePage');
// Layout maestro-detalle (sidebar + panel derecho) -- una sola pagina para
// "oliv/inmuebles" y "oliv/inmuebles/:id", mismo patron que InventarioPage.jsx.
const OlivInventarioPage = lazyNamed(() => import('./features/oliv/OlivInventarioPage.jsx'), 'OlivInventarioPage');
const ExportarInmueblesOlivPage = lazyNamed(() => import('./features/oliv/ExportarInmueblesOlivPage.jsx'), 'ExportarInmueblesOlivPage');
// Vista compuesta (Oportunidad + Inmueble + cotización aceptada), mismo
// patron maestro-detalle que NegociosPage.jsx.
const OlivNegociosPage = lazyNamed(() => import('./features/oliv/OlivNegociosPage.jsx'), 'OlivNegociosPage');
// Encargos/Movimientos de Oliv (Excel crudo, sin columnas conocidas
// todavia -- ver olivEncargo.upload.js del backend). Sin pagina de
// Nomenclaturas (esa cruza con Negocio, todavia sin reglas para Oliv):
// clickear un encargo va directo a sus hojas.
const OlivEncargosListPage = lazyNamed(() => import('./features/oliv/OlivEncargosListPage.jsx'), 'OlivEncargosListPage');
const OlivEncargoHojasPage = lazyNamed(() => import('./features/oliv/OlivEncargoHojasPage.jsx'), 'OlivEncargoHojasPage');
const OlivHojaViewerPage = lazyNamed(() => import('./features/oliv/OlivHojaViewerPage.jsx'), 'OlivHojaViewerPage');
const OlivMovimientosPage = lazyNamed(() => import('./features/oliv/OlivMovimientosPage.jsx'), 'OlivMovimientosPage');
const OlivResumenPage = lazyNamed(() => import('./features/oliv/OlivResumenPage.jsx'), 'OlivResumenPage');
const OlivDashboardPage = lazyNamed(() => import('./features/oliv/OlivDashboardPage.jsx'), 'OlivDashboardPage');
const OlivCarteraMoraPage = lazyNamed(() => import('./features/oliv/OlivCarteraMoraPage.jsx'), 'OlivCarteraMoraPage');

export default function App() {
  return (
    // Suspense unico a este nivel -- cubre /login y /cambiar-password, que
    // renderizan FUERA de AppShell y por lo tanto fuera de su propio
    // <Suspense> interno (ver AppShell.jsx). El de AppShell sigue existiendo
    // para las rutas de adentro (permite loading mas granular al navegar
    // entre paginas ya con el shell montado, sin re-mostrar este fallback).
    <Suspense fallback={null}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="cambiar-password" element={<CambiarPasswordPage />} />
          <Route element={<AppShell />}>
            <Route index element={<InicioPage />} />
            {/* Usuarios/Roles: ya no soloAdmin puro -- gateado por modulo
                granular ('accesos-usuarios'/'accesos-roles') para poder
                darle a un rol NO admin acceso a una seccion puntual de
                Accesos en vez de ser todo o nada (puerto de HRMS,
                2026-09-18, pedido explicito del usuario aplicado a los 3
                proyectos). Frentes/Sincronizacion no se pidio desglosarlas,
                siguen soloAdmin. */}
            <Route element={<ProtectedRoute permiso="accesos-usuarios" />}>
              <Route path="accesos/usuarios" element={<UsuariosListPage />} />
              <Route path="accesos/usuarios/nuevo" element={<UsuarioFormPage mode="crear" />} />
              <Route path="accesos/usuarios/:id/editar" element={<UsuarioFormPage mode="editar" />} />
              <Route path="accesos/usuarios/historial" element={<HistorialPage />} />
            </Route>
            <Route element={<ProtectedRoute permiso="accesos-roles" />}>
              <Route path="accesos/roles" element={<RolesPage />} />
              <Route path="accesos/roles/nuevo" element={<RolFormPage />} />
              <Route path="accesos/roles/:id/editar" element={<RolDetallePage />} />
            </Route>
            <Route element={<ProtectedRoute soloAdmin />}>
              <Route path="accesos/frentes" element={<ConfiguracionFrentesPage />} />
              <Route path="accesos/sincronizacion" element={<SincronizacionPage />} />
            </Route>
            <Route path="inventario" element={<InventarioPage />} />
            <Route path="inventario/exportar" element={<ExportarInmueblesBKPage />} />
            <Route path="inventario/:id" element={<InventarioPage />} />
            <Route path="oportunidades" element={<OportunidadesListPage />} />
            <Route path="oportunidades/:id" element={<OportunidadDetallePage />} />
            <Route path="fiducia" element={<EncargosListPage />} />
            <Route path="fiducia/movimientos" element={<MovimientosPage />} />
            <Route path="fiducia/:id" element={<EncargoNomenclaturasPage />} />
            <Route path="fiducia/:id/hojas" element={<EncargoHojasPage />} />
            <Route path="fiducia/:id/hojas/:hojaId" element={<HojaViewerPage />} />
            <Route path="fiducia/:id/apartamento/:referencia" element={<ApartamentoDetallePage />} />
            <Route path="negocios" element={<NegociosPage />} />
            <Route path="negocios/:id" element={<NegociosPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="cartera-mora" element={<CarteraMoraPage />} />
            <Route path="resumen" element={<ResumenPage />} />
            <Route path="otrosies" element={<OtrosiesPage />} />
            <Route path="oliv/oportunidades" element={<OlivOportunidadesPage />} />
            <Route path="oliv/oportunidades/:id" element={<OlivOportunidadDetallePage />} />
            <Route path="oliv/inmuebles" element={<OlivInventarioPage />} />
            <Route path="oliv/inmuebles/exportar" element={<ExportarInmueblesOlivPage />} />
            <Route path="oliv/inmuebles/:id" element={<OlivInventarioPage />} />
            <Route path="oliv/negocios" element={<OlivNegociosPage />} />
            <Route path="oliv/negocios/:id" element={<OlivNegociosPage />} />
            <Route path="oliv/encargos" element={<OlivEncargosListPage />} />
            <Route path="oliv/encargos/movimientos" element={<OlivMovimientosPage />} />
            <Route path="oliv/resumen" element={<OlivResumenPage />} />
            <Route path="oliv/dashboard" element={<OlivDashboardPage />} />
            <Route path="oliv/cartera-mora" element={<OlivCarteraMoraPage />} />
            <Route path="oliv/encargos/:id" element={<OlivEncargoHojasPage />} />
            <Route path="oliv/encargos/:id/hojas/:hojaId" element={<OlivHojaViewerPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
