# CLAUDE.md

Guía para Claude Code en este repositorio. Es la versión **condensada**: solo reglas vigentes. El detalle histórico de cada
decisión, bug y verificación (por fecha) está en [docs/HISTORIAL.md](docs/HISTORIAL.md) — **léelo solo cuando necesites el
porqué de algo** (diagnóstico de la búsqueda tolerante, pasos de la normalización de movimientos, migración de base, etc.).
Si algo de aquí contradice al historial, manda este archivo.

## Proyecto

Cartera AED: seguimiento de cartera de los proyectos inmobiliarios de AED — **Baía Kristal** (CRM Zoho) y **Oliv** (CRM
HubSpot). Reimplementación de `zoho-payment-tracker/` (el legado, que no se toca). Express + Sequelize + PostgreSQL y React +
Vite (JavaScript plano, CSS Modules, sin Tailwind; gráficos con ApexCharts, nunca Recharts). Un solo contenedor: Express sirve
también el build del frontend. No hay entidad central tipo "perfil": cada módulo de negocio es top-level
(`NAV_GROUPS` en `AppShell.jsx`: Baía Kristal / Oliv).

- Producción detrás del gateway del portal: `https://portal.aed-it.com/cartera/` (build-args `VITE_API_BASE_URL=/cartera/api`,
  `VITE_BASE_PATH=/cartera/`). El proyecto ya no sigue la `Plantilla-Arquitectura-AED` (no existe `plantilla-arquitectura/`).
- Base de producción nueva: `72.62.100.53:5440/postgres` (URL en `backend/.env` como `DESTINO_DATABASE_URL`, ignorado por git).
  La v2 de desarrollo (`cartera_aed_v2`) y la legada están en el puerto 5436.

## Reglas de trabajo (importantes)

- Commits en español, autor `GEliasDev <GEliasDev@users.noreply.github.com>`, **sin** trailer ni mención a Claude. Nunca
  `git push` (lo hace el usuario). Hacer commit tras cada cambio terminado; `git add` de archivos específicos.
- Nunca editar `.env` ni escribir credenciales. **La BD local = producción**: consultas de prueba en solo lectura salvo que la
  tarea exija escribir. No disparar syncs reales de Zoho/HubSpot sin necesidad.
- No hay suite de tests: se verifica con `curl`, `node --check`, `npx esbuild src/App.jsx --bundle ...` y, si el usuario lo
  permite, navegador.
- Responder en español, directo y conciso. Leer `DESIGN.md` antes de tocar UI.

## Comandos

Desde la raíz: `npm run dev` (backend **3011** + frontend **5183**), `npm run install:all`, `npm run db:migrate`.
Desde `backend/`: `npm run db:migrate` (sequelize-cli), `npm run db:seed` (solo el admin inicial; **nunca en producción**),
`npm run dev`, `npm start` (migra y arranca). `.env` desde `.env.example`: `PG*`/`DATABASE_URL`, `CORS_ORIGIN` (admite varios
separados por coma), `PORT`, `JWT_SECRET`, `ADMIN_*`, `ZOHO_*` (solo lectura), `EXCEL_PASSWORD`, `HUBSPOT_ACCESS_TOKEN`,
`INTEGRACION_API_KEY`, `LEGACY_DATABASE_URL` (solo scripts de migración), `PRECALENTAR_CACHE=false` para desactivar el
precalentado. El refresh token de Zoho no tiene el scope `ZohoCRM.settings.fields.READ`: el sync de Oportunidades depende de
`zoho_field_metadata` ya poblada.

## Arquitectura del backend (`backend/src`)

- Módulos de 5 archivos (`model`, `schema` Zod, `service`, `controller`, `routes`); lógica **siempre** en el service; sin
  Prisma/Knex/TypeORM. Migraciones forward-only (`sequelize-cli`); `zDateOnly()` para `DATEONLY`.
- Manejo de errores unificado de la familia (byte a byte igual en Solicitudes, Cartera, HRMS y Bases; **no se edita por
  proyecto**): `ApiError`, `ApiResponse`, `asyncHandler`, `zDateOnly`, `validate`, `errorHandler`, `notFoundHandler`. Contrato
  `{ success:false, error:{ message, details? } }`. Errores propios = lanzar `ApiError`; nunca armar `res.status().json()` a mano.
  `ok(res, data)` envuelve en `{ data }`.
- CORS expone `Content-Disposition` (`exposedHeaders`): sin eso el navegador no lee el nombre de un archivo descargado.
- Cookies `cartera_access_token`/`cartera_refresh_token` (prefijo obligatorio por proyecto).
- **Usuarios y permisos**: `usuarios.roles` = arreglo de nombres (`ADMIN` reservado, bypass); cada rol es una fila de `roles` con
  `permisos` (claves de `config/modulos.js`: `negocios`, `oportunidades`, `inventario`, `encargos`, `movimientos`, `resumen`,
  `dashboard`, `cartera-mora`, `otrosies`, `oliv-*`, `accesos-usuarios`, `accesos-roles`). `requireModulo`/`requireAdmin`
  (`middlewares/auth.js`) leen la tabla **en vivo** en cada request. Frentes y Sincronización siguen `soloAdmin`. Hay auditoría
  de administración (`auditoriaUsuario`). Roles reales con nombres en título ("Cartera", "Administrador"). Un módulo nuevo = clave
  en `config/modulos.js` + `frontend/src/config/modulosPorProyecto.js` + ítem en `NAV_GROUPS`.
- **Bind posicional (`$1, $2...`), nunca `replacements` con nombre**, en upserts de `sequelize.query()` dentro de un
  `Promise.all` (Sequelize mezcla valores entre llamadas paralelas). Terminar cadenas `?.` con `?? null` antes de un bind
  (`undefined` rompe `pg`).
- `TRUNCATE` de tablas con FK: todas las relacionadas en un solo statement.
- Filtros sobre JSONB `datos` con SQL crudo (`sequelize.query`), no con helpers de JSON path. Los `LEFT JOIN LATERAL` entre
  `inventario_items` y `negocios` dependen de índices funcionales (`datos->>'C_digo_inmueble'`, `datos->>'Nomenclatura'`); si se
  copia otro join así, revisar índices del legado.
- `DATEONLY` de Sequelize devuelve string `'YYYY-MM-DD'`, no `Date`. `negocio_movimientos.fecha_contable` y
  `oportunidades.fecha_inicio_plan_pagos` son `DATE` que guardan solo fecha UTC a medianoche (deliberado; no convertir).
- **Movimientos fiduciarios normalizados**: `movimientos_fiduciarios.datos` se sacó a 22 columnas (forma A); un disparador
  (`mf_llenar_columnas`) las llena y deja `datos` en NULL si se reconstruye idéntico. **Para leer el objeto original usar
  siempre `mf_datos(fila)`, nunca la columna `datos` cruda.** Las filas tipo B y formas desconocidas conservan `datos`.
- **Filtros de selección múltiple** (oct 2026): los listados reciben cada filtro repetido (`?etapa=1&etapa=2`);
  `utils/filtros.js#lista()` normaliza a arreglo y `filtrarCascadaEnMemoria()` filtra los resultados en memoria. Semántica:
  OR dentro de un filtro, AND entre filtros, vacío = sin filtro. La cascada Etapa→Frente→Torre usa
  `inventarioTorres.service.js` (`valoresProyectoTorre`, `proyectosTorreDeFiltros`, `whereReferenciaPorFiltros`); las torres solo
  acotan junto a frentes; `'Sin proyecto'` = sin inmueble/proyecto. `limit` hasta 9999 en dashboard/cartera/negocios.
- **Búsqueda**: substring simple `ILIKE '%término%'` en todos los módulos. La búsqueda tolerante (trigramas) se revirtió por
  pedido del usuario y **no se reintenta** sin corregir el diagnóstico guardado en el historial (similitud por campo, umbral
  adaptativo, códigos fuera del score, tokenizador sin truncar).
- **Ordenamiento server-side** con `utils/ordenamiento.js#ordenSequelize` y whitelist por módulo (`sortBy` nunca se concatena).
  Hoy: Otrosíes, dashboard-recaudo, cartera-mora, fiducia/movimientos. No agregarlo a otros sin pedido.

### Zoho / HubSpot y sincronización

- Inventario (`InventarioItem` = Producto de Zoho) y Oportunidades (`Oportunidad` = Deal, mapeo dinámico por
  `ZohoFieldMetadata`; subforms Forma/Propuesta de Pago por `oportunidad.subformsBackfill.js`). Oliv usa
  `utils/hubspotClient.js` (token estático de Private App).
- **Etapas excluidas** (`config/estadosOportunidad.js`): `BACKOUT`, `ESTUDIO DEMORADO`, `NO INTERESADO`, `RECONTACTAR EN EL FUTURO`
  se filtran en el sync y se eliminaron de la base. `findOportunidadByReferencia` elige la vigente
  (`elegirOportunidadVigente`): una DESISTIDO/BACKOUT nunca opaca a una vigente con la misma referencia.
- **Sync con modos** "cambios" (por defecto) y "todo", **cancelable** (cancelación cooperativa en `utils/progresoSync.js`),
  con progreso en vivo: `useSyncControl`, `SyncProgreso`, `SyncModoButton`. Oportunidades tiene "Actualizar Planes de Pago"
  (5 consultas a la vez). **Programador** (`modules/programador.js`): sync completo a las 04:00 y diario a las 12:30.
- `precalentar.js`: la conciliación vive en memoria y tarda ~20 s; el servidor precalienta tras arrancar y
  `invalidarCacheDashboard()`/`invalidarCacheResumenOliv()` reprograman la reconstrucción (debounce 15 s). Invalidar el cache
  desde un script `node -e` no afecta al servidor real (otro proceso).
- **Carga diaria de la fiduciaria vía n8n**: `POST /api/fiducia/upload` acepta sesión con módulo `encargos` **o** cabecera
  `X-API-Key` = `INTEGRACION_API_KEY` (≥32 caracteres, comparación en tiempo constante; solo abre esa ruta). Multipart campo
  `archivo`, máx. 50 MB. Excel protegido con `EXCEL_PASSWORD`.

### Negocios, vinculación y conciliación

- `negocio.backfill.js` reconstruye `Negocio`/`NegocioComprador`/`NegocioMovimiento` desde `HojaFiduciaria`/`MovimientoFiduciario`
  (correr `POST /negocios/backfill` tras cada Excel nuevo). Es **atómico/transaccional** y debe correr en proceso aparte (un
  reinicio de nodemon a mitad dejó datos incompletos).
- **Vinculación negocio↔inmueble** (tabla `vinculos_negocio_inmueble`, `modules/vinculo/`: `vinculoResolver`, `categoriaTorre`,
  `vinculo.service`): primero por **nomenclatura + categoría**, con la **referencia de recaudo** como respaldo; guarda el
  método (`nomenclatura`/`referencia`). El listado y el detalle usan la misma decisión (`PRIORIDAD_ESTADO_SQL`). Filtro
  "Vinculación" en Negocios; el módulo "Vínculos por revisar" se eliminó.
- **Ids del detalle de negocio**: `inv-<inventarioId>` (por inmueble) o `neg-<negocioId>` (negocio sin inmueble). Un id numérico
  suelto no abre nada. Enlazar siempre con esos prefijos.
- **Total pagado** = suma de movimientos normalizados (sin `GENERADO POR VENTA UNIDAD`, desde el último desistimiento/ajuste) +
  **saldo a favor del plan**. Una cuota negativa del plan se muestra en 0 (saldo contraentrega nunca negativo) y su valor se
  suma al total pagado (KPI en verde "Saldo a favor"). Misma cuenta en conciliación, tarjeta, Cartera y Dashboard
  (`dashboard/conciliacion.js` en backend y `frontend/src/utils/conciliacion.js` son copias: mantener sincronizadas).
  `resolverValorVenta` ajusta el valor de venta según etapa/estado. El `Saldo Actual` del Excel de la fiducia no sirve.
- Dashboard (`/dashboard-recaudo`, `/cartera-mora`, `/resumen-etapas[...]`, montados bajo `/negocios`); `cerrar-mes` es manual y
  solo admin. Cartera: Cuota Inicial / Saldo Contraentrega; filas clicables abren el negocio; menú contextual con
  marcar en trámite/canje (`PATCH /negocios/:id/flags`).
- **Otrosíes** (módulo propio, solo lectura, tabla `baia_kristal_otrosies`): sync bulk solo con metadatos; `otro_si_tiene_archivo`
  solo por GET individual (`otrosi.backfill.js`, re-verificación por recencia 24 h); el listado devuelve **solo** `archivo=true`
  (filtro duro). PDF bajo demanda en 2 pasos, streaming `inline`, nunca se guarda copia. **No confundir las 3 "etapas"**:
  `stage` (etapa del negocio, pipeline Zoho), `etapa` de la fila (etapa del proyecto, oculta en la tabla pero en la API) y
  `etapa` como query param (etapa del inmueble, cascada). La etiqueta del filtro es "Etapa del inmueble".
- Fiducia (`fiducia.upload.js`): sube Excel a `EncargFiduciario`/`HojaFiduciaria`/`MovimientoFiduciario`. El endpoint
  `/fiducia/movimientos` no lo usa ninguna pantalla (Movimientos usa `negocio_movimientos`).
- `ConfiguracionFrente`: fecha de entrega por Frente/Torre/Piso, mutuamente excluyentes entre niveles (409).
- `GET /inicio`: KPIs y alertas por proyecto; omite lo que el usuario no puede ver.

## Frontend (`frontend/src`)

- Identidad visual **igual al HRMS** (tokens, `AppShell`, `Field`, `Button`, tablas, `StatTile`, Detail Hero, etc. copiados del
  HRMS; ver `DESIGN.md`). Componentes propios en `components/ui/` (incl. `Accordion`, `DatosFinancieros`, `ConceptoHint`,
  `EstadoInventarioBadge`, `StageBadge`, `Tabs`). Sin modales de ruta; selección de uno a muchos con checkboxes.
- **Filtros de selección múltiple**: `components/ui/MultiSelect.jsx` (buscador si >8 opciones, seleccionar todas, limpiar,
  contador) dentro de `<Field>`; `api/toQuery.js` serializa arreglos repetidos; `utils/cascadaFiltros.js`
  (`frentesDisponibles`, `torresDisponibles`, `podarSeleccion`). El estado de filtros guarda **arreglos** (`[]` = sin filtro);
  `hayFiltros` debe contar longitudes (un `[]` es truthy). En Dashboard y Cartera las opciones vienen de `meta` (resultado), no
  de `opciones`. Quedan de a uno: Verificado/Requerido (Sí/No), selectores de mes, hoja de Oliv, rangos de mora, trámite.
- Estado de filtros en `usePersistentState` (sessionStorage); Otrosíes y Oportunidades usan `useState` a propósito.
- Movimientos: columnas Fecha, Referencia de recaudo (enlace al negocio), Comprador, Unidad, Tipo, Valor.
- Dinero en campos de texto, nunca `type="number"`. Exportar: `utils/exportCsv.js` y `exceljs`; ninguna pantalla oculta
  "Exportar" por rol (se gatea solo por el módulo de la pantalla).
- `InfoTooltip` en `display:none` en reposo (evita desbordes). `utils/rutas.js#rutaApp` para `window.open` con el subpath.
- Dashboard (Plan vs. Recaudo): tabla armada a mano con `<colgroup>`, scrollea la página (solo la tabla en pantalla completa).
  Cartera de Baía Kristal scrollea en horizontal a 1440 px (aceptado). Pendiente conocido: panel de Alertas con más tipos.

## Despliegue y datos

- Dockerfile en la raíz (3 stages), `entrypoint.sh` (migra y arranca; **nunca** `db:seed`), `.gitattributes` fuerza LF en
  `*.sh`/`Dockerfile`. `app.js` sirve `frontend/dist` con fallback a `index.html` fuera de `/api/*`.
- Migración de datos reales: `scripts/importarDatosLegado.js` (idempotente, solo lectura del legado) y
  `scripts/migracion/copiarDesdeV2.js`; pasos y "pasada final" en `backend/scripts/migracion/README.md`. **Pendiente del corte**:
  pasada final cuando Baía Kristal deje de recibir movimientos en la legada, apuntar variables del despliegue a la base nueva.
- Normalización de movimientos: ver `backend/scripts/migracion/normalizacion/DISENO.md` (pasos 0-8 hechos en producción).
- Respaldos previos en `Respaldos-Cartera` (fuera del repo, del usuario).
