# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cartera AED (nueva arquitectura) — reimplementación de `zoho-payment-tracker/`
(seguimiento de cartera de proyectos inmobiliarios de AED: Baía Kristal y,
desde 2026-09-11, Oliv -- reemplazó a Alegra, que nunca llegó a tener
módulos reales) siguiendo `Plantilla-Arquitectura-AED` (vinculada como submódulo en
`plantilla-arquitectura/`, hermana de esta carpeta). Es un proyecto **en
migración progresiva**: se construye en paralelo a `../zoho-payment-tracker/`
(que sigue en producción sin tocarse), módulo por módulo, sobre una base de
datos PostgreSQL nueva y separada (`cartera_aed_v2`, mismo servidor).

El plan completo de migración (decisiones ya tomadas, hoja de ruta de
módulos en orden) vive fuera de este repo, en la sesión de Claude Code que lo
armó — si no lo tienes a mano, reconstruye el estado actual mirando qué
módulos ya existen bajo `backend/src/modules/` y qué rutas reales (no
`enDesarrollo: true`) tiene `frontend/src/components/layout/AppShell.jsx`.

Central design decision: no hay una entidad central tipo "perfil" — cada
módulo de negocio (Negocios, Inventario, Fiducia, Opportunities/Zoho...) es
top-level, calcado del árbol de navegación de `zoho-payment-tracker/frontend/src/config/navItems.js`.

## Commands

Desde la raíz (`Cartera/`): `npm run dev` levanta backend y frontend juntos
(`concurrently`). `npm run install:all` instala ambos sub-paquetes de una.
`npm run db:migrate` proxea al runner de migraciones del backend.

Comandos individuales corren desde `backend/`:

```
npm install           # instalar dependencias
npm run db:migrate    # aplicar migraciones pendientes via sequelize-cli (idempotente)
npm run db:seed       # sequelize-cli db:seed:all (siembra el admin inicial, idempotente)
npm run dev            # nodemon src/server.js
npm start               # sin watch (usado en producción, corre migraciones primero)
```

Requiere una instancia de PostgreSQL y un `.env` (copiar `.env.example`) con
`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `CORS_ORIGIN`,
`PORT`, `JWT_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NOMBRE`,
`ZOHO_CLIENT_ID`/`ZOHO_CLIENT_SECRET`/`ZOHO_REFRESH_TOKEN`/`ZOHO_API_BASE`/
`ZOHO_ACCOUNTS_URL` (mismas credenciales que `zoho-payment-tracker/`, mismo
Zoho CRM, solo lectura -- necesarias para los sync de Inventario/
Oportunidades), `EXCEL_PASSWORD` (mismo valor que el legado, para leer
Excels de fiducia protegidos). El refresh token actual NO tiene el scope
`ZohoCRM.settings.fields.READ`, así que el primer sync de Oportunidades
depende de tener `zoho_field_metadata` ya poblada (ver el módulo
`oportunidad` más abajo) -- si esa tabla está vacía y no hay acceso en vivo
a `/settings/fields`, el sync falla al arrancar.

No hay suite de tests automatizada todavía — la verificación es manual vía
requests HTTP contra el servidor corriendo (`curl`/Postman) y navegación
manual del frontend.

**Puertos de desarrollo**: backend `3011`, frontend `5183` — deliberadamente
distintos de `zoho-payment-tracker/` (`3001`/`5173`) para poder correr ambos
proyectos a la vez en la misma máquina durante la migración.

## Backend architecture (`backend/src`)

**Con ORM (Sequelize).** PostgreSQL se consulta a través de Sequelize, con
una única instancia compartida en `config/db.js`. La lógica de negocio nunca
vive en el modelo (`.model.js` es solo schema + asociaciones) — siempre en
`.service.js`. No introduzcas Prisma/Knex/TypeORM/etc. en su lugar (aunque
`zoho-payment-tracker/` sí use Prisma — es intencional, ver el contexto de
migración arriba).

Ver `plantilla-arquitectura/arquitectura/ARQUITECTURA-BACKEND.md` para el
detalle completo de: la forma de 5 archivos por módulo, migraciones, el
patrón de historial versionado, el patrón de auditoría genérica, escrituras
transaccionales multi-tabla, catálogos de solo lectura vs. CRUD completo,
conversión de texto libre a lista fija, y la regla de fechas (`zDateOnly()`,
nunca `z.coerce.date()`).

**Módulo `usuario`** (`modules/usuario/`) — adopta el patrón de roles
dinámicos de la plantilla (`plantilla-arquitectura/arquitectura/
ARQUITECTURA-BACKEND.md`, "Roles y permisos dinámicos", 2026-09-10):
`usuarios.roles` es un arreglo de nombres de rol (`ADMIN` es el único
reservado en Cartera, bypass por nombre, sin cuentas de autoservicio como
`EMPLEADO` en otros proyectos de la familia aed) en vez del par
`es_admin`(boolean)/`modulos_permitidos`(array) que tenía antes -- cada rol
real es una fila de la tabla `roles` (`modules/rol/`), con su propio arreglo
de `permisos` (mismas claves de `config/modulos.js`), editable desde Accesos
> Roles sin releases. `utils/permisos.js#getRolesPermisos()` lee esa tabla
EN VIVO en cada request (`requireModulo`/`requireAdmin` en
`middlewares/auth.js`), así un permiso editado aplica de inmediato sin
relogin. Incluye `auditoriaUsuario.model.js` (historial de administración
sobre usuarios, `GET /usuarios/auditoria/historial`).

**Módulo `auth`** (`modules/auth/`) — copiado tal cual de la plantilla. Cookies
`cartera_access_token`/`cartera_refresh_token` (prefijo obligatorio por
proyecto, ver `utils/security.js` — no reutilizar el prefijo `hrms_` ni
`scp_bases_`, ya usados en la familia aed).

**Módulo `configuracionFrente`** (`modules/configuracionFrente/`) — primer
módulo de negocio migrado (piloto de la migración). Fechas de entrega reales
por Frente/Torre/Piso, mutuamente excluyentes entre los tres niveles (ver
comentario en `configuracionFrente.service.js`). `list()` enriquece con el
árbol completo de frentes/torres/pisos vía `inventarioTorres.service.js`
(módulo Inventario). Ruta: `/configuraciones/frentes`; frontend en
`features/configuracion-frentes/ConfiguracionFrentesPage.jsx`, enlazada
temporalmente desde `InicioPage` en `App.jsx` (no tiene item propio en
`NAV_GROUPS` — cuando exista la ruta "Accesos" del template, se cuelga de
ahí).

**Módulo `inventario`** (`modules/inventario/`) — segundo módulo migrado.
`InventarioItem` = Producto de Zoho CRM, sync manual vía
`inventario.sync.js` (`POST /inventario/sync`, mismo flujo OAuth que el
legado: `utils/zohoAuth.js` + `config/zoho.js`, credenciales compartidas con
`zoho-payment-tracker/` -- mismo Zoho CRM, solo lectura). `inventarioTorres.service.js`
es el subconjunto de `inventarioNegocioService.js` (legado) que solo toca
`InventarioItem` (jerarquía Etapa→Frente→Torre→Piso, detección de
nomenclatura completa = Proyecto + Torre + Piso + Unidad, que reemplaza al Project_Code de
Zoho: ya no se usa en ninguna parte) -- las funciones que cruzan con `Negocio`/
`Opportunity` se portan en la fase de Negocios. Filtros por `datos`
(JSONB) resueltos con SQL crudo vía `sequelize.query`/`replacements`, no
con los helpers de JSON path del ORM. Simplificación deliberada: sin
selects en cascada de Frente/Torre en el frontend todavía (Proyecto/
Categoría/Estado/Etapa + búsqueda cubren el caso principal). Ruta real en
`NAV_GROUPS` → Baía Kristal → Inmuebles (`/inventario`, `/inventario/:id`).

**Módulo `oportunidad`** (`modules/oportunidad/`) — tercer módulo migrado.
`Oportunidad` = Deal de Zoho CRM, con mapeo DINÁMICO de campos vía
`ZohoFieldMetadata` (`oportunidad.sync.js` — nunca hardcodea api_names más
allá de los base, se adapta solo si cambian los nombres de campos en Zoho,
igual que el legado). `SyncLog` historia cada sync. El backfill de subforms
(Forma de Pago/Propuesta de Pago, que el GET masivo de Deals nunca trae) es
`oportunidad.subformsBackfill.js`, disparado automático tras cada sync y
manual vía `POST /oportunidades/backfill-subforms`. Rutas reales en
`NAV_GROUPS` → Baía Kristal → Oportunidades.

**Módulo `otrosi`** (`modules/otrosi/`) — módulo **nuevo** (no existe en
`zoho-payment-tracker/`, no es una migración) de SOLO LECTURA para Baía
Kristal, pedido por el Jefe Gabriel: mostrar por cada Deal de Zoho si tiene
cargado el documento 'Otro sí - Contrato Fiducia', si el otro sí es requerido
(`Otro_si_Requerido`) y quién es el encargado (`Encargado_Otro_Si`), con link
para abrirlo — sin escritura ni a Zoho ni a datos de negocio. **Decisión de
diseño clave y POR QUÉ (el mismo pivote documentado en `oportunidad.service.js`)**:
primero se intentó apoyarse en el módulo `oportunidad` existente — la
migración `20260923170000-add-oportunidad-otrosi-columns.js` agregó las
columnas `otro_si_*` a `oportunidades` —, pero se descartó porque
`oportunidad` solo sincroniza los Deals con `pago_separacion`
(`oportunidad.service.js#list` filtra `{ pago_separacion: { [Op.ne]: null } }`,
1931 de ~6663) y Otrosíes debe cubrir el universo COMPLETO de Baía Kristal. Se
pivoteó a módulo y tabla propios (`baia_kristal_otrosies`,
`20260923190000-create-otrosi.js`, `zoho_deal_id` como clave natural única con
upsert `ON CONFLICT`) y las columnas de `oportunidades` se dropearon
(`20260923220000-drop-oportunidad-otrosi-columns.js`, nunca llegaron a
poblarse). Clave de módulo/permiso nueva: `otrosies` (en
`backend/src/config/modulos.js` y en la matriz de
`frontend/src/config/modulosPorProyecto.js`).

Hallazgo técnico real que define la arquitectura del módulo: el campo fileupload
`Otro_si_Contrato_Fiducia` de Zoho da **falsos negativos en consultas bulk**
(dice "sin archivo" cuando sí lo tiene; nunca al revés — investigación en
`hive/reports/baia-kristal-otrosi-contrato-fiducia.md`). Por eso:

- El **sync bulk** (`otrosi.sync.js`, `POST /otrosies/sync` + `GET
  /otrosies/sync/status`) trae solo metadatos (`id`, `Deal_Name`, `Etapa`,
  `Otro_si_Requerido`, `Encargado_Otro_Si`) y deja `otro_si_tiene_archivo` en
  `null` — nunca pide el fileupload. Trae TODOS los Deals con
  `Proyecto:equals:Baia Kristal` SIN el filtro de `pago_separacion`. Estrategia
  de cobertura: tramos por `Etapa` (valores descubiertos en vivo con una muestra
  paginada + los ya en DB) + barrido COMPLETO del criterio base (paginación de
  las ~34 páginas; Meredith descartó empíricamente el límite de 2000 de
  `/search` en esta cuenta). Upsert-if-missing para no pisar lo ya sincronizado
  y chequeo de cobertura final (total traído vs. total del barrido base →
  warning de auditoría si no cuadran). `/Deals/search` no acepta
  negación/vacío/rangos (probado en vivo, 400/204), así que los Deals sin
  `Etapa` solo se cubren con el barrido base. Sin cron todavía (ver hoja de
  ruta) — el sync es manual, y tras terminar auto-dispara el backfill si hay
  pendientes.
- El campo `otro_si_tiene_archivo` se puebla ÚNICAMENTE por **GET individual**
  (`otrosi.backfill.js`, `POST /otrosies/backfill`, solo admin, `?full=true`
  ignora la recencia) — la única vía 100% confiable. Criterio de alcance por
  **recencia**, no por resultado (decisión del Jefe Gabriel: ningún criterio
  por categoría es seguro para excluir a alguien PARA SIEMPRE — hubo archivo=No
  con documento cargado y requerido='No' con archivo real): cada registro se
  re-verifica si `otro_si_archivo_verificado_en` es NULL o venció
  `OTROSI_BACKFILL_VIGENCIA_HORAS` (default 24h). Escribe solo
  `otro_si_tiene_archivo` + `otro_si_archivo_verificado_en`, concurrencia 12
  (~12-15 min sobre los 6664 registros), NUNCA escribe a Zoho.

Descarga del PDF bajo demanda (`GET /otrosies/:id/archivo`): **2 pasos**, 100%
on-demand cuando el usuario hace click, streaming directo al navegador, **nunca
se guarda copia** en BD ni en disco (decisión del Jefe Gabriel — cachear 6663
PDFs no vale la pena): (1) `GET /Deals/{id}?fields=Otro_si_Contrato_Fiducia`
→ sacar `attachment_Id` del primer objeto del array; (2) `GET
/Attachments/{attachment_Id}` con `Authorization: Zoho-oauthtoken <token>` →
binario real. Retry con refresh de token si da 401 (`_clearCache`). Descartadas
en vivo: `actions/download_file` (200 `{}`), `/files/{fileId}` (404) y las URLs
`download_Url`/`preview_Url` del campo (requieren sesión web de Zoho, 302 a
signin). El PDF se entrega SIEMPRE con `Content-Disposition: inline` + el
nombre real decodificado del archivo y `Content-Type: application/pdf` (el
Jefe Gabriel: el click en "Ver PDF" debe abrir el visor del navegador, no
descargar — antes se reenviaba el `Content-Disposition: attachment` de Zoho
tal cual y el navegador descargaba). `GET /otrosies` lista con filtros
`search`/`requerido`/`stage` + la cascada del inmueble (`etapa`/`frente`/`torre`,
ver abajo) + paginación; filtro **DURO y permanente** (Jefe Gabriel,
2026-09-23): el listado expuesto al frontend SOLO devuelve registros con
`otro_si_tiene_archivo = true`, siempre — el param `archivo` quedó sin efecto
(NULL/false se siguen trackeando en la tabla internamente pero jamás salen por
este endpoint).

La tabla muestra 6 columnas — 'Negocio', 'Etapa del Negocio' (con
`StageBadge`), 'Ref. Recaudo', 'Inmueble', 'Otro sí requerido' y 'PDF' — pero
la fila trae **2 campos más que NO se pintan**, por pedido del Jefe Gabriel
(2026-09-24). Los dos siguen intactos en el modelo, en el sync y en la respuesta
de la API (son cambios de UI, revertibles; NO limpiarlos del backend):
- `etapa` = Etapa del **PROYECTO** (fase de construcción, 'Etapa 1'..'Etapa 8' y
  'Vela Village Etapa 1'), la que particiona el sync en tramos. La columna se
  SACÓ de la tabla: para cruzar y conciliar está `referenciaRecaudo` (abajo),
  que es lo que al Jefe le sirve. OJO con el historial: `etapa` se había sacado
  de la API por error, creyendo que era lo mismo que `stage`, y hubo que
  restaurarla — que hoy esté oculta en la tabla NO significa que sobre en el
  contrato.
- `encargado_otro_si` = el `Encargado_Otro_Si` de Zoho, OCULTO **"hasta nuevo
  aviso"** (puede volver a mostrarse). Fuera de la tabla, intacto en
  modelo/sync/backfill y en la respuesta; sigue siendo el 3er campo que trae el
  sync bulk.

El que sí se ve, `stage`, es la Etapa del **NEGOCIO** (pipeline): el `Stage` de
Zoho, que en la UI se llama literalmente 'ETAPA DEL NEGOCIO' ('1 INTERESADO',
'12BC VINCULACION A FIDUCIA EXITOSA', 'DESISTIDO', ...). Es el MISMO campo que
sincroniza `oportunidad.sync.js`, con filtro `stage` de match EXACTO y valores
para el Select en `GET /otrosies/stages` (mismo patrón que
`GET /oportunidades/stages`; limitado al universo visible `archivo = true` para
no ofrecer valores que siempre darían 0).

**OJO, TRES "etapas" distintas conviven en Otrosíes** (la confusión se repitió
en varias sesiones — 2026-09-24 — no volver a mezclarlas):
1. `stage` — Etapa del **NEGOCIO**, el pipeline de Zoho. Campo de la fila Y
   query param del filtro, con mayúscula.
2. `etapa` — Etapa del **PROYECTO** ('Etapa 1'..'Etapa 8'). Campo de la fila;
   ya no se muestra en la tabla pero sigue en la API. Sin filtro.
3. `etapa` como query param — Etapa del **INMUEBLE** ('2', 'Prive', 'Isla
   Laguna', 'Sin proyecto'), el filtro en cascada de abajo. Los valores que
   ofrece el frontend vienen en `etapasDisponibles` y son CRUDOS, sin el prefijo
   'Etapa '. Dentro de `inmueble`, el campo `etapa` es ESTE mismo dato del
   inmueble, no el de la fila.

**Ordenamiento server-side de Otrosíes** (`sortBy`/`sortDir` en `GET
/otrosies`, 2026-09-23): el `useSortableTable` del frontend (copiado de la
plantilla HRMS) ordenaba SOLO en el navegador sobre las filas ya cargadas, así
que en una tabla paginada el sort apenas reordenaba la página actual. El
`ORDER BY` va en el SQL, antes del `LIMIT/OFFSET`, con
`utils/ordenamiento.js#ordenSequelize` y una whitelist por módulo — `sortBy`
viene del cliente y **nunca** se concatena: `{ id, dealName, stage, etapa,
referenciaRecaudo, otroSiRequerido, encargadoOtroSi, otroSiTieneArchivo }`; una
clave desconocida se ignora y queda el orden por defecto (`deal_name` ASC, `id`
ASC), sin romper la request. La dirección se normaliza a `ASC`/`DESC` (cualquier
otra cosa = ASC) y se agregan `NULLS LAST` + desempate por `id` para que el
paginado sea estable. OJO: la whitelist sigue listando `etapa` y
`encargadoOtroSi` aunque sus columnas ya no se pinten (2026-09-24) — el frontend
no manda esos `sortBy`, pero `inmueble` NO está en la lista porque no es
ordenable. Alcance: SOLO Otrosíes. Rubén auditó el resto de las tablas y el bug
no existe ahí — `dashboard-recaudo`/`cartera-mora` (`sortBy`/`sortDir`) y
`fiducia/movimientos` (`sortField`/`sortDir`) YA ordenaban server-side, y
oportunidades/negocios/inventario/oliv nunca tuvieron sort por columna (no estaba
roto: no existía). No agregarles ordenamiento nuevo sin que lo pidan.

La fila también expone `referenciaRecaudo` ('Referencia de Recaudo' de Zoho),
que es el dato de cruce que quedó para conciliar: el Jefe no usa la Etapa del
Proyecto para eso, y por eso la columna `etapa` se quitó de la tabla y esta
sigue visible. Su `api_name` **no** está hardcodeado: se resuelve
dinámicamente en `otrosi.sync.js#resolverApiNameReferenciaRecaudo()` con la
misma cadena de `oportunidad.sync.js` (por `field_label` exacto → por
`api_name` exacto → primer campo de texto cuyo label contenga 'recaudo'),
leyendo `zoho_field_metadata` (NO se vuelve a pedir `/settings/fields` desde
ahí: da 401 sin el scope `ZohoCRM.settings.fields.READ`). Si no aparece, avisa
por log y sigue sincronizando el resto (no es fatal: es una vista de solo
lectura).

Columna **'Inmueble'** (2026-09-24, agregada por pedido del Jefe Gabriel):
pieza de datos resuelta cruzando `referencia_recaudo` contra `inventario_items`
con el MISMO criterio que `dashboard.service.js` (`parseProyectoTorre`/
`obtenerEtapaTorre` sobre `datos->>'Proyecto_Torre'`, nombre de unidad =
`datos->>'Product_Name'`), en UNA sola query por página (`DISTINCT ON
(referencia_recaudo) ... ORDER BY id ASC`, sin N+1, y así elegir el mismo item
que el `LEFT JOIN LATERAL` del Dashboard cuando una referencia tiene más de
uno). Devuelve `inmueble: { etapa, frente, torre, nomenclatura, label }` o
`null` si la referencia no matchea ningún item (70 de 1382) — el frontend pinta
`inmueble.label` o 'Sin inmueble' si es `null`. Cobertura del cruce directo
~95% (1308 de las 1378 filas con referencia). **NO** se usa el fallback por
Nomenclatura del Dashboard: ese solo llega a 602, es subconjunto del directo
(no agrega nada), así que no vale traer `Nomenclatura` a la tabla. `label` ya
viene armado ('Etapa 2 - Prive - Torre 4 - 6-E') y omite el frente cuando es el
mismo texto que la etapa (`obtenerEtapaTorre` cae al nombre del proyecto si la
torre no está en su mapa, p.ej. 'Isla Laguna'). Si se prefiere componerlo,
están las 4 partes sueltas con `etapa` en CRUDO ('2', o 'Prive'), igual que en
el resto de la app. **NO es ordenable**: no está en la whitelist de `sortBy` y
el `<th>` va sin `SortHeader` (sale de un cruce contra inventario, no de una
columna de la tabla propia).

**Búsqueda tolerante: REVERTIDA EN TODOS LOS MÓDULOS (2026-09-24)** — el Jefe
Gabriel: *"Busco nombres y me salen otros, quítalos en todos lados donde lo
aplicaste, yo después soluciono ese tema en otra ocasión"*. Se volvió al
`ILIKE '%término%'` simple en los 10 módulos (otrosies, oportunidad,
negocio list+movimientos, inventario, fiducia ×4, dashboard, cartera-mora y los
4 de oliv) y se eliminó `utils/busquedaTolerante.js` (quedó sin consumidores).
**LO QUE SIGUE VIVO del trabajo**: el ordenamiento server-side de Otrosíes
(`sortBy`/`sortDir`, whitelist) y la búsqueda por `Referencia de Recaudo` en
Otrosíes (se pidió aparte, para buscar por número desde la misma caja).

**NO REINTENTAR la búsqueda tolerante sin corregir antes el umbral.** Lo que
sigue es el diagnóstico de por qué fallaba, para que no se repita a ciegas:
1. **El tokenizador cortaba a 6 palabras y se comía el final del término**: para
   'Baia Kristal - Camila Arcila - KZ1 6-G' usaba `['Baia','Kristal','-',
   'Camila','Arcila','-']` y perdía 'KZ1'/'6-G', que son las que discriminan; el
   token '-' además matcheaba 1929 de 1931 filas.
2. **Los códigos dentro del score de trigramas**: las referencias son 13
   dígitos casi iguales (las vecinas dan 0.55-0.59 contra la buscada), así que
   buscar una referencia devolvía 300 filas en Oportunidades y 275 en Negocios.
3. **La causa de fondo, la que NO se llegó a corregir**: el score se calculaba
   sobre campos CONCATENADOS con umbral fijo 0.2. Con el prefijo común
   'Baia Kristal - ', cualquier deal no relacionado sacaba 0.40-0.45 y el
   correcto 1.000, así que el 95% de la tabla pasaba el filtro (1497 de 1931).
   Si se retoma: (a) `GREATEST(similarity(campo_i, término))` POR CAMPO, nunca
   concatenado; (b) umbral ADAPTATIVO tipo `max(0.2, 0.5 × mejorSim)` o aplicar
   similitud solo con términos de 1-2 palabras; (c) los códigos/referencias
   NUNCA dentro del score; (d) tokenizador sin truncar (el tope de 6 palabras
   se comía 'KZ1 6-G'). Medido: con esas correcciones la referencia daba 1
   resultado y la fila correcta quedaba primera, pero el Jefe prefirió volver
   al substring simple antes de invertir en el fix 2 (umbral adaptativo).

**Filtro en cascada Etapa -> Frente -> Torre en Otrosíes** (2026-09-24, mismo
shape y query params que Negocios: `etapa`, `frente`, `torre`): la respuesta de
`GET /otrosies` agrega `etapasDisponibles`, `frentesDisponibles`,
`frentesPorEtapa`, `torresPorFrente` y `torresPorEtapaFrente` (del helper global
`valoresProyectoTorre()`). Filtra por el `Proyecto_Torre` del inventario
asociado — el MISMO dato que la columna `inmueble` — pero resuelto ANTES del
`LIMIT/OFFSET` (primero se saca de `inventario_items` la lista de
`referencia_recaudo` de la rama elegida de la cascada, y con ella se arma el
where; filtrar en JS sobre la página reproduciría el bug de orden local). Sin
filtrar, los otrosíes sin inmueble siguen apareciendo; al filtrar por cualquiera
de los 3 quedan excluidos. `'Sin proyecto'` = sin `referencia_recaudo`, sin item
asociado, o con item sin `Proyecto_Torre`; es un valor de `etapasDisponibles`
como cualquier otro, y se resuelve como el complemento de las referencias que
SÍ tienen proyecto. Rama vacía -> `IN ()` -> listado sin filas (correcto: se
pidió una rama sin inmuebles).

**La etiqueta del filtro dice 'Etapa del inmueble', NO 'Etapa' a secas**
(decisión del Jefe Gabriel 2026-09-24, preventiva): en la misma pantalla conviven
el filtro 'Etapa del Negocio' (que es `stage`, y sigue visible como columna) y
este, que es la Etapa del INMUEBLE. Ponerlo 'Etapa' a secas era a una confusión
que ya pasó. Los Select se arman con `etiquetaEtapa()` de `utils/etapas.js`
('2' -> 'Etapa 2'), y los tres Selects aparecen a pedido: 'Frente' solo si hay
opciones, 'Torre' solo si ya hay un frente elegido; al cambiar de etapa se
limpian frente/torre si dejan de existir en la nueva rama. Los valores viajan
CRUDOS (sin el prefijo 'Etapa '), que es lo que espera el backend.

**Búsqueda en Otrosíes = substring simple (2026-09-24)**: `ILIKE '%término%'`
con OR sobre `deal_name` Y `referencia_recaudo` (se puede buscar por número de
referencia desde la misma caja), escapando `\`, `%` y `_` del término. SIN
palabras-en-cualquier-posición, SIN trigramas y SIN orden por similitud: todo
eso se revirtió por decisión del Jefe Gabriel ("Busco nombres y me salen
otros"). El `sortBy` explícito manda siempre. Esto ya NO es exclusivo de
Otrosíes: **todos los buscadores de Cartera v2 quedaron en substring simple**
(la tolerante se revertir en los 10 módulos el mismo día y
`utils/busquedaTolerante.js` se eliminó) — ver "Búsqueda tolerante: REVERTIDA
EN TODOS LOS MÓDULOS" más arriba para el diagnóstico y las condiciones para
reintentarla. Rutas reales en `NAV_GROUPS` → Baía Kristal → Otrosíes
(`/otrosies`).

**Búsqueda TOLERANTE GLOBAL (2026-09-23) — REVERTIDA el 2026-09-24, NO la
reimplementes desde acá**: la lógica de Otrosíes se extrajo a
`backend/src/utils/busquedaTolerante.js` y se aplicó a TODOS los buscadores de
Cartera v2 (param `search`): `oportunidad` (deal_name/referencia_recaudo/
contact_name), `negocio` (list CTE + movimientos: referencia/Nomenclatura/
nomenclatura completa/Proyecto_Torre/Product_Name + compradores via EXISTS),
`inventario` (SQL crudo con replacements), `fiducia` (encargos, movimientos,
propietarios, nomenclaturas), `dashboard` (recaudo + cartera-mora, filtro en
memoria) y `olivOportunidad`/`olivInmueble`/`olivNegocio`/`olivEncargo`.
Mecanismo: (1) palabras AND en cualquier posición (cada palabra matchea alguno
de los campos del registro; tolera términos no adyacentes y palabras extra al
inicio, p.ej. 'Claudia Araos' → 'MARIA CLAUDIA ARAOS'); (2) OR con
`GREATEST(similarity(campo_i, término))` (similitud POR CAMPO, no concatenada —
concatenar diluye el score, ver el caso real 'claudea araos' 0.22 en deal_name
solo vs <0.2 concatenado). Umbral default 0.2, override global
`BUSQUEDA_SIMILARITY` y por-módulo con el envKey propio (OPORTUNIDAD_/
NEGOCIO_/INVENTARIO_/FIDUCIA_/DASHBOARD_/OLIV_*_SEARCH_SIMILARITY). Campo cortos
(códigos tipo 'K3 2-G', unidades) usan `conSimilitud: false` (trigramas = ruido).
El helper expone 3 variantes: `buildBusquedaSequelize` (fragmento where),
`clausulaPalabrasSql`/`clausulaSimilitudSql` (SQL crudo, bind posicional o
replacements; soporta exprs compuestas como EXISTS via función `(ph)=>...`) y
`filtroInMemory` (Dice de trigramas en JS para dashboard/olivNegocio). En SQL
crudo usar SIEMPRE `armarBindPalabras(search)` → `{palabras, binds}` (cada
palabra pasada por `escLike()` antes de envolverla en `%...%`: un `_` de una
nomenclatura es literal, no comodín) en vez de rearmar los binds a mano.
`clausulaSimilitudSql` envuelve el placeholder en `lower()` internamente
(`similarity(lower(coalesce(col,'')), lower(ph))`) para no depender de que cada
call-site bindee el término ya en minúsculas — aunque medido en esta BD
pg_trgm YA normaliza a minúsculas internamente (ver la traza literal abajo),
así que el `lower()` es defensa, no fix de un fallo real.

**Traza del hallazgo "pg_trgm es case-insensitive en esta instalación"** — el
`SELECT` ejecutado LITERAL en `cartera_aed_v2` el 2026-09-23 (Gabo pidió pegarlo
textual para que alguien que migre de instancia de Postgres sepa por qué el
código tiene el `lower()` del placeholder si nunca hizo falta aquí):

```sql
SELECT
  similarity('Isla Laguna - Torre 1', 'ISLA LAGUNA - TORRE 1') AS identico_solo_caso,
  similarity('Isla Laguna - Torre 1', lower('ISLA LAGUNA - TORRE 1')) AS con_lower,
  show_trgm('ISLA LAGUNA - TORRE 1')::text AS trigramas_mayus,
  show_trgm('isla laguna - torre 1')::text AS trigramas_minus;
```

Resultado (set de trigramas IDÉNTICO entre mayúsculas y minúsculas, y
`similarity` = 1.0 con dos textos que solo difieren en el caso):

```
identico_solo_caso = 1
con_lower          = 1
trigramas_mayus    = {"  1","  i","  l","  t"," 1 "," is"," la"," to",agu,gun,isl,"la ",lag,"na ",orr,"re ",rre,sla,tor,una}
trigramas_minus    = {"  1","  i","  l","  t"," 1 "," is"," la"," to",agu,gun,isl,"la ",lag,"na ",orr,"re ",rre,sla,tor,una}
```

Contraprueba sobre dato real (columna `inventario_items.torre` =
`'Isla Laguna - Torre 1'` vs término con typo):

```sql
SELECT similarity(lower($1), lower($2)) AS con_lower, similarity(lower($1), $2) AS sin_lower;
```

con `$1='Isla Laguna - Torre 1'`: `termino="isla lagnua"` → con_lower = sin_lower =
**0.3333**; `termino="ISLA LAGNUA"` → con_lower = sin_lower = **0.3333**. O sea,
en ESTA instalación el `lower()` del placeholder no cambia ningún score; queda
por robustez (y porque no cuesta nada), no porque arreglara un fallo observable.
Gabo: "no puede auditar que sea por diseño, podría ser particular de esta
instalación (build/collation)" — por eso queda la traza. Limitación
conocida: typos de UNA palabra corta contra campos muy largos con prefijo
institucional (p.ej. 'gutierez' vs deal_name 'Oliv - Darwin... Gutiérrez')
quedan bajo el umbral — el caso soportado es el nombre mal escrito de 2+
palabras contra el campo del nombre.

**Regla obligatoria: bind parameters posicionales (`$1, $2...`), nunca
`replacements` con nombre, en un upsert de `sequelize.query()` que corre
dentro de un `Promise.all` de un lote.** Encontrado como bug real
migrando `oportunidad.sync.js`: 50 upserts concurrentes con el MISMO texto
de query pero replacements distintos (`:accountName`, etc.) hacían que
Sequelize mezclara valores entre llamadas paralelas ("Named replacement
':accountName' has no entry" con datos que sí la tenían). Bind posicional
(`{ bind: [...] }` con `$1, $2...` en la query, `$N::jsonb` para casts) pasa
directo al driver `pg` sin el parseo intermedio por regex de Sequelize, y no
tiene ese problema. Aplica a cualquier módulo futuro que haga upserts en
lote fuera del `.upsert()` nativo de un Model (Fiducia/Negocios van a
necesitar este mismo patrón para sus imports masivos de Excel).

**Gotcha real: `objeto?.propiedad` sobre un valor `null` da `undefined`, no
`null`** (`typeof null === 'object'` en JS, así que `null?.id` pasa el
optional chaining y da `undefined`). Prisma lo toleraba en el legado
(trata `undefined` como "campo no provisto"); el driver `pg` de Sequelize
rechaza `undefined` en bind parameters con un error que no menciona el
campo real. Siempre `?? null` al final de una cadena `?.` que puede terminar
en `undefined` antes de mandarla a un bind/replacement.

**Módulo `fiducia`** (`modules/fiducia/`) — cuarto módulo migrado. Subida
manual de Excel de fiducia (`POST /fiducia/upload`, `multer` en memoria,
`EXCEL_PASSWORD` para archivos protegidos, `xlsx`/`xlsx-populate`) →
`EncargFiduciario`/`HojaFiduciaria`/`MovimientoFiduciario`, guardados tal
cual. Simplificación deliberada: el legado también poblaba `Negocio`/
`NegocioComprador`/`NegocioMovimiento` como efecto secundario de esta misma
subida (`processResumenSheet`/`processMovPorPropietarioSheet` sobre las
hojas "Movimientos"/"Mov_Por_Propietario") -- eso se porta en la fase de
Negocios, cuando esos modelos existan acá (ver el comentario de cabecera en
`fiducia.upload.js`). El filtro de movimientos por rango de fechas (campo
JSON `Fecha Contable`, formato `DD/MM/YYYY`) usa SQL crudo con bind
parameters posicionales (mismo patrón que Oportunidades). Validado con un
Excel sintético (no hay un archivo real con el formato de fiducia -- header
en la fila 7, primeras 6 filas de metadata -- disponible fuera de la app;
los `.xlsx` en la raíz del repo son reportes manuales de otro formato) --
ojo con `blankrows: false` de `xlsx`: colapsa filas completamente vacías
antes de contar las 6 de metadata, así que una fila de prueba 100% vacía
rompe la detección del header (no pasa en un Excel real, que siempre trae
algo en esas filas). Rutas reales en `NAV_GROUPS` → Baía Kristal → Encargos
(`/fiducia`) y Movimientos (`/fiducia/movimientos`).

**Módulo `negocio`** (`modules/negocio/`) — quinto módulo migrado, el
corazón financiero. `negocio.backfill.js` reconstruye `Negocio`/
`NegocioComprador`/`NegocioMovimiento` desde cero (`TRUNCATE`, no delete
selectivo) leyendo `HojaFiduciaria`/`MovimientoFiduciario` ya migrados --
correrlo (`POST /negocios/backfill`) después de cada Excel de fiducia
nuevo. `negocio.service.js` es el resto de `inventarioNegocioService.js`
del legado: el CTE combinado `InventarioItem` + `Negocio` (incluidos los
"huérfanos" sin inmueble vinculado en Zoho) en SQL crudo con bind
parameters, `findOportunidadByReferencia` (nunca deja que una Oportunidad
DESISTIDO/BACKOUT opaque una vigente con la misma Referencia de Recaudo --
ver `config/estadosOportunidad.js`). Gotcha real de Postgres encontrado acá:
`TRUNCATE` de una sola tabla falla si otra la referencia por FK **aunque
esa tabla ya esté vacía** -- hay que truncar las tablas relacionadas juntas
en un solo statement (`TRUNCATE negocio_movimientos, negocio_compradores,
negocios`), no una por una así el orden respete la jerarquía de FKs.
Alcance de esta fase: CRUD base (`GET /`, `GET /:id`, `GET /:id/movimientos`,
`PATCH /:negocioId/flags`) -- los endpoints que en el legado compartían el
mismo router (`/dashboard-recaudo`, `/cartera-mora`, `/stats`,
`/resumen-etapas*`, todos sobre `dashboardRecaudoService.js`) se portan en
la fase de Dashboard/Resumen/Cartera en Gestión. Validado con un Excel
sintético con hojas "Movimientos"/"Mov_Por_Propietario" reales (mismo
motivo que Fiducia: no hay un archivo real disponible fuera de la app).
Ruta real en `NAV_GROUPS` → Baía Kristal → Negocios (`/negocios`).

**Módulo `dashboard`** (`modules/dashboard/`) -- sexto módulo migrado, puerto
fiel de `dashboardRecaudoService.js` del legado. Alimenta 3 pantallas
distintas montadas todas bajo `/negocios` (mismo prefijo que `negocio`, ver
el comentario de orden de rutas en `routes/index.js`): `GET /dashboard-recaudo`
(Plan vs. Recaudo), `GET /cartera-mora` (Cartera en Gestión), `GET
/resumen-etapas[/meses]` + `POST /resumen-etapas/cerrar-mes` (Resumen
Gerencial / Consolidado de Cartera por Etapa, con snapshot mensual en
`ResumenCarteraMensual`). `conciliacion.js` (motor financiero: `construirPlan`/
`normalizarPagos`/`conciliar`) y `dashboardCache.js` (cache en memoria del
proceso del servidor, invalidada por cualquier módulo que toque Negocio/
Inventario/Oportunidad -- ver `invalidarCacheDashboard()` en cada `.sync.js`/
`.backfill.js`/`updateFlags`) se portaron sin cambios de lógica. Sin cron
todavía (ver hoja de ruta) -- `cerrar-mes` es un trigger manual, solo admin.

**Gotcha real de prueba (no de producción)**: `dashboardCache.js` guarda el
cache en una variable de módulo del PROCESO del servidor -- invalidarlo desde
un script `node -e "..."` suelto (otro proceso) no tiene ningún efecto sobre
el cache del servidor real corriendo con nodemon. Para forzar una
reconstrucción real durante pruebas manuales, o se dispara a través de un
endpoint real que llame `invalidarCacheDashboard()` (`PATCH .../flags`,
`POST /negocios/backfill`, etc.), o se reinicia el proceso (tocar un archivo
que nodemon vigile).

Frontend: `features/dashboard/` (compartido: `Dashboard.module.css`,
`StatTile.jsx`, `charts/{ChartCard,palette,usePrefersReducedMotion,
OrdinalBarChart,EsperadoRecaudadoChart,EtapaRecaudoChart}.jsx` +
`DashboardPage.jsx`), `features/cartera-mora/CarteraMoraPage.jsx`,
`features/resumen/ResumenPage.jsx` -- las 3 paginas importan `Dashboard.module.css`
(page/header/filterRow/table/pagination) porque comparten un solo backend,
pero solo Cartera en Gestión y Resumen usan el sistema de KPIs/graficos
(`statsGrid`/`StatTile`/`charts/`) -- `DashboardPage.jsx` (Plan vs. Recaudo)
es deliberadamente una excepción: es un calco fiel de `ReportePlanRecaudo.jsx`
del legado, que NUNCA tuvo KPIs ni gráfico de tendencia, solo la tabla de
drill-down por inmueble/mes (columnas dinámicas por mes con Proyectado/
Recaudado/Por recaudar, sticky left en Etapa/Frente/Torre/Nomenclatura,
clic derecho para Ver negocio/inmueble/oportunidad y marcar en trámite/canje,
exportar a Excel con estilos vía `exceljs` igual que el legado) armada a
mano con `<colgroup>` de anchos fijos en vez de `@tanstack/react-table` (que
sí usa el legado) -- incluirla habría sido una dependencia nueva solo para
esta página, y sin su algoritmo de layout no hace falta la medición de
anchos por DOM que el legado necesita. `CarteraMoraPage.jsx` tiene el mismo
patrón de clic derecho (Ver negocio/inmueble/oportunidad + Marcar/Quitar en
trámite/canje vía `PATCH /negocios/:id/flags`, actualización optimista) y
alterna entre dos vistas con columnas y KPIs distintos (`Cuota Inicial`: KPIs
+ gráfico de antigüedad de mora + Top 10 colapsable; `Saldo Contraentrega`:
un único callout de alerta, sin KPIs/gráfico/Top10 -- igual que
`CarteraMora.jsx` del legado). `InfoTooltip` (`components/ui/`) se copió del HRMS aed (no
estaba en la plantilla como archivo, solo descrito en
ARQUITECTURA-FRONTEND.md/DESIGN.md §5) -- mismo criterio para
`charts/palette.js`: mismos valores exactos que el HRMS porque es la MISMA
marca aed y el mismo `--color-primary`, ya validados ahí con la skill de
dataviz. Los 5 rangos de mora (`RANGOS_MORA` del backend) necesitaron un
ramp ordinal propio de 5 pasos (`MORA_RAMP`) en vez de reutilizar el
`ORDINAL_RAMP` de 4 pasos del HRMS con módulo -- recorrer un ramp de 4 tonos
con `% 4` para 5 buckets hace que el bucket más grave (90+ días) repita el
tono MÁS CLARO (índice 4 % 4 = 0), rompiendo justo ahí la promesa visual
"claro = leve, oscuro = grave". Rutas reales en `NAV_GROUPS` → Baía Kristal →
Resumen (`/resumen`), Dashboard (`/dashboard`), Cartera (`/cartera-mora`).

**`utils/exportCsv.js`** (copiado tal cual del HRMS -- ver "Exportar a CSV"
en ARQUITECTURA-FRONTEND.md) se introdujo acá, con las 3 pantallas de este
módulo como primeros consumidores (`downloadCsv(filename, rows, columns)`,
`columns: [{ key, header, format? }]`). Cualquier listado nuevo de otro
módulo que necesite exportar reusa este mismo helper, nunca arma el CSV a
mano. El export de Dashboard/Cartera en Gestión vuelve a pedir al backend
el resultado FILTRADO completo con `limit: 9999` (no solo la página
visible) antes de descargar -- ambos endpoints aceptan hasta 9999 por
página, así que alcanza una sola request para el tamaño real del
portafolio (~1800 inmuebles); Resumen exporta directo desde el estado ya
cargado en memoria (no pagina).

**Datos reales**: `backend/scripts/importarDatosLegado.js` importa (solo
lectura sobre `zoho-payment-tracker/`, nunca escribe ahí) los datos reales
que no se sincronizan solos desde Zoho hacia `cartera_aed_v2` --
`ConfiguracionFrente`/`EncargFiduciario`/`HojaFiduciaria`/
`MovimientoFiduciario`/`Negocio`/`NegocioComprador`/`NegocioMovimiento`/
`ResumenCarteraMensual`/`AuditoriaUsuario` (`Usuario`, `Oportunidad` e
`InventarioItem` no hace falta: ya se sincronizan solos o ya se copiaron
antes). Idempotente (`ON CONFLICT ... DO UPDATE`, mismo id/timestamps del
legado) -- correrlo de nuevo más adelante trae lo nuevo sin duplicar.
Requiere `LEGACY_DATABASE_URL` en `.env` (nunca commiteado, ver
`.env.example`). Corriéndolo la primera vez salieron 3 gotchas reales, ya
arreglados, que cualquier módulo futuro con este mismo patrón (SQL crudo +
`datos` JSONB) va a pisar si no los tiene en cuenta:

- **`HojaFiduciaria.filas`** guarda una hoja de Excel entera como JSON (hasta
  ~430KB por fila reales) -- un lote de escritura con el tamaño por defecto
  (500 filas) arma un solo `INSERT` de decenas/cientos de MB y tumba la
  conexión (`Connection terminated unexpectedly`, no es un problema de red).
  Con columnas JSON así de pesadas, lote chico (~10) a propósito.
- **Índices funcionales sobre `datos->>'...'` que el legado SÍ tenía (a
  mano, Prisma no los genera solo) y las migraciones nuevas nunca
  recrearon**: `InventarioItem_codigoInmueble_idx` (`datos->>'C_digo_inmueble'`)
  y `Negocio_nomenclatura_idx` (`datos->>'Nomenclatura'`) -- ver
  `20260829140000-...` y `20260829140100-...` en `db/migrations/`. Sin
  ellos, cualquier `LEFT JOIN LATERAL` que cruce `inventario_items`↔`negocios`
  por esas dos expresiones (hay dos: uno en `dashboard.service.js`, otro en
  `negocio.service.js#list`) hace un seq scan completo de la tabla del lado
  "adentro" del lateral por cada fila del lado "afuera" -- con datos
  sintéticos (0-1 filas) nunca se notaba; con datos reales (~1700 negocios x
  ~1900 inmuebles) literalmente cuelga la query (probado: timeout). **Antes
  de portar cualquier módulo que copie un `LEFT JOIN LATERAL` de un
  service legado, revisar si esa tabla tenía un índice funcional
  (`pg_indexes` del legado, `indexdef LIKE '%->>%'`) y recrearlo.**
- **`DATEONLY` de Sequelize devuelve un string `'YYYY-MM-DD'`, no un
  `Date`** -- `ConfiguracionFrente.fecha_entrega` es `DATEONLY`;
  `obtenerFechasEntregaConfiguradas()` lo pasaba tal cual a
  `dashboard.service.js`, que lo usa como `fechaEstimada` de una cuota y
  llama `.getUTCFullYear()` directo asumiendo que es un `Date` real. Con
  datos sintéticos `fecha_entrega` siempre era `null`, así que nunca se
  ejercitó; con datos reales (fechas configuradas de verdad) explota
  (`fecha.getUTCFullYear is not a function`). Arreglado envolviendo con
  `new Date(...)` en el único punto donde se arma ese mapa -- cualquier otro
  `DATEONLY` que se use como fecha real (no solo se muestre) necesita el
  mismo cuidado.

**Proyecto Oliv** (`modules/olivOportunidad/`) — segundo proyecto de Cartera
(CRM HubSpot, `utils/hubspotClient.js` -- token estático de Private App, sin
OAuth, mismo patrón que tenía planeado Alegra en el legado). Reemplaza a
Alegra: esa nunca llegó a tener módulos reales, solo el placeholder de
`GET /alegra/status` en `zoho-payment-tracker/`. Arranca igual que Baía
Kristal en su momento, un módulo a la vez -- Oportunidades es el primero
(`GET /oliv/oportunidades/status`, de momento solo confirma si hay
`HUBSPOT_ACCESS_TOKEN` configurado; falta definir qué propiedades del Deal
de HubSpot importan y las reglas de negocio reales antes de sincronizar
datos de verdad). Clave de módulo/permiso: `oliv-oportunidades` -- a
diferencia de Alegra (que declaró las 8 claves `alegra-*` de una, todas sin
usar), acá se agrega una clave nueva solo cuando el módulo correspondiente
ya existe.

**Módulos de negocio pendientes de migrar**: el resto de Oliv (Negocios,
Inventario, Encargos, Movimientos, Resumen, Dashboard, Cartera), una vez se
defina su alcance real -- sigue la forma de 5 archivos, igual que el resto.

## Frontend (`frontend/src`)

React + Vite + JavaScript plano (sin TypeScript). Sin UI kit, sin Tailwind —
componentes propios en `components/ui/` y CSS Modules en todo el proyecto,
estilados desde los tokens de `tokens.css` (mantenido en sync con la
frontmatter de `DESIGN.md`). Las rutas nunca usan modales — páginas/rutas
dedicadas en su lugar. Dashboard con ApexCharts (`apexcharts`/
`react-apexcharts`), nunca Recharts (que sí usa `zoho-payment-tracker/`).

Ver `plantilla-arquitectura/arquitectura/ARQUITECTURA-FRONTEND.md` para el
detalle completo: el componente `Field` render-prop, la regla de formularios
en filas anchas, el patrón de Vista/Edición con un solo botón Editar global,
`SimpleListTab`/`CatalogCrudTab` genéricos, cuándo sí vale una página de
edición dedicada, lazy loading de rutas, la regla de máximo 5 KPIs, y el
gotcha de `useEffect` nunca devolviendo una Promise.

`components/layout/AppShell.jsx` — `NAV_GROUPS` tiene 2 categorías (Baía
Kristal / Oliv). Los 9 items de Baía Kristal apuntan a rutas reales (los 8
del legado + Otrosíes, módulo nuevo sin equivalente en `zoho-payment-tracker/`).
Otrosíes (`features/otrosies/OtrosiesPage.jsx`, ruta `/otrosies` en `App.jsx`,
`api/otrosies.js`) es una tabla de SOLO LECTURA — sin formularios ni edición —
con 4 filtros: Buscar, 'Etapa del Negocio' (`stage`), la cascada 'Etapa del
inmueble' → Frente → Torre, y 'Otro sí requerido'. NO hay filtro ni columna de
Archivo: el backend devuelve SIEMPRE solo los registros con archivo=Sí (ver el
filtro duro en el módulo `otrosi` arriba), así que si la fila aparece, tiene el
PDF — la columna 'PDF' con el link "Ver PDF" en pestaña nueva (proxy bajo
demanda) lo deja claro. Filtros y paginación en `usePersistentState`
(`otrosies-list:*`), sort remoto vía `useSortableTable` con `SortHeader` en las
columnas ordenables, `SyncStatusBar` (calco de Oportunidades, polling 15s) y las
6 columnas visibles: 'Negocio', 'Etapa del Negocio' (con `StageBadge`), 'Ref.
Recaudo', 'Inmueble' (no ordenable), 'Otro sí requerido' y 'PDF'.
Oliv arranca con un solo item real (Oportunidades, `oliv-oportunidades`) --
a diferencia de Alegra (reemplazada, ver arriba), no se declaran de una los
otros 7 módulos como `enDesarrollo` hasta que de verdad se vayan a construir
(evita el mismo scaffold especulativo que terminó borrándose). Al portar/
activar un módulo, agrega su item a `{ label, to, permiso }` con la ruta y
la clave real (ver "Roles y permisos dinámicos" en ARQUITECTURA-FRONTEND.md).

`/login-hero.jpg` — foto aérea real del skyline de Cartagena (Bocagrande,
donde operan los proyectos de AED), no un stock genérico ni atada a un solo
proyecto (antes era la laguna de Baía Kristal). Fuente: Wikimedia Commons,
foto de Bernard Gagnon, licencia CC BY-SA 4.0. El titular grande de
`LoginPage.jsx` sobre la foto es un slogan (no el nombre de la app), mismo
criterio que el HRMS -- ver el comentario de cabecera de ese archivo.

## Sistema de diseño

`DESIGN.md` (+ el sidecar `.impeccable/design.json`) es la fuente de verdad
para color, tipo, espaciado, movimiento, y patrones de componentes con
nombre — léelo antes de tocar cualquier archivo de UI. Copiado tal cual de
`Plantilla-Arquitectura-AED` (mismo branding aed que el resto de la familia
de productos).

## Migración de diseño a la identidad del HRMS (2026-10-05)

Objetivo: que Cartera quede visualmente idéntica al HRMS (se copian JSX y CSS del
HRMS y se adaptan solo textos/datos). Se hace por pasos, con el HRMS como modelo
(`3. SISTEMA DE GESTIÓN DE RECURSOS HUMANOS/frontend`).

- **Paso 1 — base + login (hecho):** `tokens.css` e `index.css` copiados del HRMS
  (Inter variable alojada con `@fontsource-variable/inter`, importada en
  `main.jsx`; se quitó Raleway de `index.html`; `--space-xs` pasa a 2px).
  `LoginPage.module.css` y `CambiarPasswordPage.jsx` copiados tal cual;
  `LoginPage.jsx` es el del HRMS con textos de Cartera (slogan, beneficios,
  pie). Se conserva la foto propia de Cartagena en `public/login-hero.jpg`.
- **Paso 2 — sidebar y topbar (hecho):** `AppShell.module.css`, `UserMenu.module.css`
  y `UserMenu.jsx` copiados del HRMS (sin el link "Mi perfil", que en Cartera no
  existe). `AppShell.jsx` conserva `NAV_GROUPS` y la resolución del item activo
  por ruta más específica, y gana: etiqueta "Menú", entrada fija "Inicio",
  migas de pan (grupo > pantalla, derivadas de `NAV_GROUPS`; `/accesos/*` →
  "Configuración") y divisor antes del menú de usuario. No hay campana de
  notificaciones (Cartera no tiene ese módulo) ni badge de pendientes.
- **Paso 3 — componentes base (hecho):** `Button`, `Badge`, `BackLink`, `Checkbox`,
  `CheckboxGroup`, `InfoTooltip`, `Pagination`, `RowIconButtons`, `Field` y
  `SortHeader` (CSS) copiados del HRMS; se agregan `Modal` y `CheckboxListSelect`
  (no existían acá). `SortHeader.jsx` conserva la versión de Cartera (tiene el
  espaciador invisible que centra bien las columnas con `align="center"`, que el
  HRMS no usa). Se conservan los componentes propios de Cartera (`Accordion`,
  `DatosFinancieros`, `ConceptoHint`, `EstadoInventarioBadge`, `StageBadge`).
- **Paso 4a — Accesos: layout + Usuarios (hecho):** `components/layout/AccesosLayout`
  pasa al menú agrupado del HRMS (Accesos: Usuarios/Roles/Historial; Sistema:
  Fechas de entrega/Sincronización) y `WizardLayout.module.css` se copia del HRMS
  tal cual (de ahí salen `.hero*` y `.content`, que reutilizarán las pantallas de
  detalle). Usuarios (lista y ficha) con el diseño del HRMS: KPIs, filtros con
  etiqueta, acciones masivas (generar contraseñas / activar / inactivar), banner
  de detalle, tarjetas por sección. Backend nuevo: columna `usuarios.ultimo_acceso`
  (migración 20261005120000, se estampa en el login), `POST /usuarios/masivo`,
  `POST /usuarios/:id/generar-password` y `generateRandomPassword()`. Diferencia
  con el HRMS: Cartera tiene pocas cuentas, así que búsqueda/orden/paginación son
  del lado del navegador (el HRMS lo hace en el servidor). Se conserva "Eliminar
  permanentemente" (cuentas ya inactivas).
- **Paso 4b — Accesos: Roles (hecho):** lista, detalle y creación con el diseño del
  HRMS (banner de detalle, tarjetas por sección, modal de borrado, árbol de
  permisos con `PermisosPorModulo.module.css`). Backend: `GET /roles` ahora trae
  `total_usuarios` y `es_admin`; nuevo `DELETE /roles/:id` (solo roles
  personalizados sin cuentas). A diferencia del HRMS, los nombres de rol NO se
  fuerzan a mayúsculas (los roles reales de Cartera están en título: "Cartera",
  "Administrador").
- **Paso 4c — Accesos: Historial, Fechas de entrega y Sincronización (hecho):**
  mismo lenguaje (títulos, tarjetas por sección, tabla en tarjeta con paginación,
  botones principal/secundario). Historial pasa a tabla con persona (avatar) y la
  acción como etiqueta. `ConfiguracionFrentesPage` usa las clases de
  `accesos/Usuarios.module.css` (se eliminó su CSS propio) y
  `Accesos.module.css` quedó solo con lo propio de Sincronización (progreso,
  estados, lista de torres). Con esto **Accesos queda completo**.
- **Paso 5 — Oportunidades de Baía Kristal y Oliv (hecho, 2 pasadas):** primero estilos
  (listas con filtros etiquetados y tabla en tarjeta; detalle con banner y tarjetas
  de sección), y luego, a pedido del usuario ("¿no podías aplicar algo más fuerte?"),
  un rediseño estructural. Lista: tarjeta de estado de sync con el botón, celda de
  oportunidad con avatar de iniciales, Oliv con `StageBadge`. Detalle: **cifras
  clave arriba** (BK: valor final / cuota inicial / saldo contra entrega, tomadas
  del plan de pagos por su etiqueta; Oliv: monto / unidad / cotizaciones enviadas)
  y **pestañas** en vez de dos columnas apiladas (BK: Resumen / Plan de pagos /
  Cotización; Oliv: Resumen / Cotizaciones y pagos / Documentos y negociación).
  Los dos listados comparten `OportunidadesListPage.module.css` y los dos detalles
  `OportunidadDetallePage.module.css`.
- **Paso 6 — Negocios de Baía Kristal y Oliv (hecho, rediseño estructural):** ya no es
  lista lateral + panel. `/negocios` (y `/oliv/negocios`) es una **página de lista a
  ancho completo**: encabezado con total y acciones (Exportar / Reconstruir desde
  Fiducia en BK), tarjetas de resumen (KPIs, con el desglose por estado/etapa/frente
  plegado), filtros con etiqueta + "Limpiar filtros" y una tabla paginada (inmueble,
  frente·etapa, comprador con avatar, estado, saldo). `/negocios/:id` es el
  **detalle como ruta propia**: BackLink + banner degradado + pestañas
  (Resumen / Financiero / Conciliación / Movimientos) en vez de 6 acordeones; el
  contenido de cada pestaña solo se monta al abrirla (Conciliación y Movimientos
  cargan datos). Una sola ruta (`NegociosPage`) decide lista vs detalle por `:id`,
  así los enlaces `/negocios/${id}` de otros módulos siguen funcionando. Piezas
  nuevas: `components/ui/Tabs.jsx` y `Accordion collapsible={false}` (tarjeta de
  sección fija). Se eliminaron `NegociosSidebar`, su CSS y `OlivNegociosSidebar`.
  Oliv no tiene KPIs/exportar (no hay endpoint de stats ni sincronización propia).
- **Paso 7 — Inmuebles de Baía Kristal y Oliv (hecho, rediseño estructural):** misma
  receta que Negocios. `/inventario` y `/oliv/inmuebles` pasan a **página de lista a
  ancho completo**: chips de estado como filtro rápido, filtros con etiqueta,
  tabla paginada (BK: inmueble, proyecto·torre, categoría, estado; Oliv: unidad,
  torre, categoría, estado, valor comercial) y las acciones en el encabezado
  (sincronizar; Oliv además exportar a Excel). `/inventario/:id` es un **detalle como
  ruta propia**: banner, cifras clave y "Todas las variables" con **buscador**.
  Reusa los estilos de lista de `negocios/NegociosPage.module.css` (chips y
  `syncError` se agregaron ahí). Se eliminaron los sidebars de inventario y su CSS.
- **Paso 8 — Encargos de Baía Kristal y Oliv (hecho, rediseño estructural):** todo el flujo.
  Lista (`fiducia/EncargosLista.jsx`, compartida y parametrizada por una `config`;
  `EncargosListPage` y `OlivEncargosListPage` son wrappers delgados): **zona de
  importación con arrastrar y soltar**, resumen del total, filtros con etiqueta y
  tabla en tarjeta (ícono de archivo, código y descripción del proyecto, etiquetas de
  hojas, acciones por fila con ícono). Unidades de un encargo (BK,
  `EncargoNomenclaturasPage`): banner + **tabla** de unidades (antes una grilla de
  tarjetas) con comprador, estado, saldo y movimientos. Hojas del Excel y visor
  (`fiducia/HojasVistas.jsx`, compartido BK/Oliv): banner + KPIs (hojas / filas) y
  visor con encabezado fijo. `ApartamentoDetallePage`: banner degradado + pestañas
  (Resumen / Financiero / Movimientos). Estilos propios en
  `fiducia/Encargos.module.css`; la estructura de página sale de
  `negocios/NegociosPage.module.css`. Se eliminaron 4 CSS viejos de fiducia.
- **Paso 9 — Movimientos de Baía Kristal y Oliv (hecho, rediseño estructural):** encabezado con
  total y acción (Exportar a Excel en BK); filtros en una sola grilla etiquetada
  (BK: búsqueda, proyecto, estado, tipo, fechas) con **chips de rango rápido**
  (último mes / 3 / 6 meses / año); la tabla se simplifica de 7–8 columnas (que
  cortaban el valor a 1440px) a 5–6: fecha, **unidad** (nomenclatura + proyecto),
  **comprador con avatar** y referencia, **tipo como etiqueta** y valor
  destacado a la derecha (Oliv: propietario enlazado al negocio con el encargo,
  concepto, valor, inmueble). La fila expandida muestra el detalle del
  movimiento en una tarjeta con la cuadrícula de campos crudos. Estilos en
  `fiducia/MovimientosPage.module.css` (extras) sobre
  `negocios/NegociosPage.module.css`; el export y toda la lógica no cambian.
- **Paso 10 — Resumen de Baía Kristal y Oliv (hecho):** además del layout, se tocó el
  CSS compartido de `dashboard/Dashboard.module.css` (lo usan Dashboard, Cartera en
  mora y Resumen, así que esos dos módulos heredan el cambio): la **cifra de cada
  KPI se ajusta al ancho de su tarjeta** con container query
  (`font-size: clamp(1.05rem, 8.4cqw, 1.75rem)`) -- antes los montos largos
  (`$ 301.770.576.660`) se cortaban --, etiqueta en minúsculas bajo la cifra,
  tarjetas redondeadas, control segmentado para rango/vista/periodo y tablas con
  encabezado discreto. En el Resumen: **una sola barra de filtros** (ubicación +
  periodo, antes dos cajas), cada bloque de KPIs (Cuota inicial / Saldo /
  Inventario) es una tarjeta con título y las cifras sin segundo marco, y el
  Consolidado, la tendencia y el pie de sync son tarjetas del mismo estilo. La
  lógica y los gráficos (ApexCharts) no cambian.
- **Paso 11 — Dashboard de Baía Kristal y Oliv (hecho):** barra de filtros en **dos zonas**
  dentro de una tarjeta (arriba: búsqueda + etapa/frente/torre; abajo: fechas,
  controles segmentados "Ver" y "Plan" y "Solo con movimientos" como `Checkbox`),
  **4 cifras del portafolio filtrado** sobre la tabla (valor, abonado, por recaudar,
  en mora -- salen de `totalesColumnasFijas`, que el backend ya calculaba sobre
  todo el filtro, no solo la página) y la tabla grande en tarjeta con
  **encabezado discreto** (antes una banda azul oscuro) conservando columnas fijas,
  orden, resaltado, menú contextual, pantalla completa y exportación. Estilos en
  `dashboard/DashboardPage.module.css` (compartido con Oliv).
  **Un solo scroll (mismo día):** el Dashboard tenía doble scroll (la página y la
  tabla). Ahora la raíz mide exactamente el alto disponible del AppShell
  (`useAlturaDisponible`, igual que en otras pantallas: `height:100%` no resuelve
  dentro del `.scrollArea` con Lenis) y **solo scrollea la tabla**, con encabezado
  sticky y totales/paginación siempre visibles. Para darle espacio a la tabla, los
  filtros avanzados (fechas, "Ver", "Plan", "Solo con movimientos") se pliegan tras
  el botón "Más filtros"/"Menos filtros" y las 4 cifras se compactan
  (`.kpisCompactos`). En pantalla completa (`enfocado`) no se fija altura.
  **Corrección (mismo día, pedido del usuario):** el "un solo scroll" del Dashboard
  se **revirtió** -- ahora scrollea la página principal (como Cartera) y la tabla
  muestra las 50 filas de la página; solo en pantalla completa (`.enfocado`) la tabla
  scrollea por dentro. Se conservan los filtros avanzados plegables ("Más filtros") y
  las cifras compactas. Ya no se usa `useAlturaDisponible` en el Dashboard.
- **Paso 12 — Cartera en Gestión de Baía Kristal y Oliv (hecho):** vistas
  (Cuota Inicial / Saldo Contraentrega) con el componente `Tabs`; "Antigüedad de la
  mora" en tarjeta blanca; filtros en una tarjeta (grilla con etiquetas) con
  "Trámite / Canje" como control segmentado en la misma tarjeta; Top 10 en tarjeta;
  tabla en tarjeta con paginación dentro. Estilos en `cartera-mora/CarteraMoraPage.module.css`
  (compartido con Oliv). Lógica, exportación y menú contextual sin cambios. Limitación
  conocida: la tabla de Baía Kristal (10 columnas) scrollea en horizontal a 1440px.
- **Paso 13 — Otrosíes (hecho):** encabezado con la barra de sincronización en
  tarjeta a la derecha, filtros en tarjeta (grilla con etiquetas + "Limpiar filtros"),
  tabla en tarjeta con encabezado discreto y paginación dentro, columnas de acción
  (PDF, Verificado) sin partir el texto. Lógica sin cambios (sigue sin persistir filtros
  entre visitas, a pedido). Estilos en `otrosies/OtrosiesPage.module.css`.
- **Rediseño fuerte de Cartera y Otrosíes (mismo día, a pedido: el primer corte
  cambiaba poco):** las filas ahora se leen de un vistazo con celdas compartidas
  (`cartera-mora/CarteraCeldas.jsx`: `CeldaComprador` avatar+nombre+referencia,
  `CeldaInmueble` unidad destacada+ubicación, `ChipDias` por severidad
  (≤30 neutro / ≤60 ámbar / >60 rojo), `BarraMora`, `ValorVencido`). Cartera pasó de
  10 columnas a 7 (4 en Saldo Contraentrega) y ya no scrollea en horizontal a
  1440px; se perdió el orden por Etapa/Referencia (ahora Inmueble ordena por unidad).
  "Antigüedad de la mora" tiñe cada rango de menos a más grave con barra de peso
  relativo, y el Top 10 abre por defecto. Otrosíes reutiliza las mismas celdas
  (Negocio con avatar sin el prefijo/unidad, Inmueble con la unidad destacada, PDF y
  Verificación como chips).
- **Corrección posterior (pedido del usuario):** la tabla de Cartera **vuelve a sus
  columnas originales** (BK: Etapa, Frente/Torre, Nomenclatura, Referencia, Comprador,
  Valor apartamento, Cuotas mora, Días atraso, Valor vencido, % en mora; Oliv: sin Etapa/
  Frente) -- el usuario las necesita todas, incluida Referencia ordenable. Conserva los
  realces (chip de días, valor vencido en rojo, barra de %) y por eso la tabla vuelve a
  scrollear en horizontal en pantallas angostas. Las celdas `CeldaComprador`/
  `CeldaInmueble` quedan solo para Otrosíes.
- **Ajuste final de Cartera:** Frente/Torre en **doble fila** (`CeldaDoble`: frente
  arriba, "Torre N" debajo; en Oliv "Oliv" arriba y la torre debajo) para que todas
  las filas se vean uniformes, y el % en mora con el número arriba y la barra debajo.
- **Orden de Cartera (pedido del usuario):** la referencia va **a la derecha del
  comprador** (tabla y Excel, BK y Oliv) y Baía Kristal arranca ordenada por **Etapa**
  ascendente (clave de estado persistido nueva `cartera-mora:sort-v2` para no heredar
  el orden vacío guardado en los navegadores). Oliv no tiene etapa, queda sin cambio.
- **Etapa también en "Saldo Contraentrega vencido" (Baía Kristal):** esa pestaña no
  tenía columna Etapa, así que el orden por defecto no se notaba ahí. Se agregó
  (ordenable, y también en el Excel). Verificado recorriendo las 9 páginas de Cuota
  Inicial: Etapa 1 > 2 > 3 > 4 > Isla Laguna > The Plaza > Vela Village.
- **Fix: Cartera (BK) nunca queda "sin orden":** el ciclo de clics del encabezado
  (asc -> desc -> sin orden) dejaba `sort = {key: null}` y el backend entonces ordenaba
  por días de atraso (lo que el usuario vio en una captura). Ahora el tercer estado
  vuelve a **Etapa ascendente** (`ORDEN_POR_DEFECTO`) y la clave persistida pasó a
  `cartera-mora:sort-v3` para limpiar cualquier `{key:null}` ya guardado.
- **Top 10 eliminado (pedido del usuario):** se quitó de Cartera (BK y Oliv) el bloque
  "Top 10 — prioridad de gestión" (componente, estado, segunda llamada a
  `getCarteraMora` con `limit=10` y sus estilos). Ya no hay ranking aparte; la tabla
  sigue siendo la única vista de detalle.
- **Auditoría contra el HRMS (2026-10-05):** `tokens.css`, `index.css` y todos los
  `components/ui/*.css` ya eran idénticos al HRMS; lo que faltaba era: (1) el **StatTile
  de los KPIs** -- ahora igual que el HRMS (pastilla de icono tintada por `tone`
  primary/success/warning/neutral arriba a la izquierda, tooltip arriba a la derecha,
  cifra grande, etiqueta debajo, sombra al pasar el mouse; `warning` tiñe la cifra).
  Aplicado a los KPIs del Dashboard y de Cartera (BK y Oliv); la cifra sigue ajustándose
  al ancho con container queries por los montos largos; (2) el **hover de fila**
  (`--color-surface-sunken`) que faltaba en las tablas de `Dashboard.module.css`
  (Cartera/Resumen) y Otrosíes; (3) `DESIGN.md` y `.impeccable/design.json`, que estaban
  desactualizados respecto a la versión actual del HRMS (se copiaron completos). Se
  quitó `.kpisCompactos` (ya no aplica desde que el Dashboard vuelve a scrollear la
  página). No se tocaron los tiles de Resumen (11 cifras dentro de bloques; el
  HRMS limita a 5 KPIs por pantalla) ni los `kpiCard` de las listas, que siguen el
  patrón del listado de Usuarios del HRMS.
- **Iconos en Resumen (a pedido, pese a que el HRMS limita a 5 KPIs):** las 9 cifras
  de Resumen (BK y Oliv) usan el mismo diseño de KPI con pastilla de icono por `tone`
  (Target/primary para las "Totalidad", CheckCircle2 y Wallet/success para lo recaudado,
  Hourglass/neutral para lo por recaudar o pendiente, AlertTriangle/warning para cuotas
  vencidas, Building2 y KeyRound para inmuebles disponibles y vendidos). `StatTileConHint`
  de cada Resumen replica el mismo marcado que `dashboard/StatTile.jsx`.
- **Segunda auditoría contra el HRMS (2026-10-05):** (1) las vistas de **detalle de
  Negocio, Inmueble y Unidad** (BK y Oliv, 5 pantallas) usaban una tarjeta blanca simple
  en vez del **Detail Hero** que el HRMS exige en todo detalle; ahora usan el banner de
  marca (nuevo `components/layout/DetalleHero.jsx` + `HeroBadges`/`HeroBoton`/`HeroSaldo`,
  con el ícono de la entidad como avatar, badges y "Estado de cuenta" a la derecha);
  (2) "Limpiar filtros" era un enlace de texto en Dashboard, Cartera y Otrosíes; ahora es el
  **botón punteado** del resto de listados. **Brechas conocidas que NO se implementaron**
  (requieren datos/decisión del negocio, no solo estilo): el **panel de Alertas** que el HRMS
  pide en todo dashboard, las filas de Cartera/Otrosíes **no son clicables** (el registro se
  abre desde el enlace de la unidad y el menú contextual) y las **acciones de fila con
  `RowIconButtons`** (el componente está copiado pero Cartera no tiene tablas con
  editar/activar).
- **Fechas de entrega como árbol desplegable (Configuración, `/accesos/frentes`):** la tabla
  plana + formulario de texto libre se reemplazó por **Frente > Torre > Piso** desplegables
  (`ConfiguracionFrentesPage.jsx` + `ConfiguracionFrentes.module.css`). El endpoint
  `GET /configuraciones/frentes` ya devolvía una fila por cada nivel; el árbol se arma en el
  cliente. Cada nodo edita su fecha en línea (input de fecha + Guardar/Quitar) y muestra un
  badge ("Fecha única" / "N configuradas"). La exclusión entre niveles que el backend exige
  (409) se refleja en la UI: si un nivel superior tiene fecha, los inferiores quedan bloqueados
  con una nota, y al revés. Hay buscador de frente (persistente), "Expandir todo" y
  "Contraer todo". Sin paginación (es un árbol). No se probó guardar una fecha para no tocar
  datos reales de producción.
- **Paso 14 — Inicio (hecho, pedido y propuesta del usuario):** `/` ya no es un placeholder.
  Por proyecto (selector Baía Kristal / Oliv, recordado en sesión): saludo + fecha +
  chip de la última sincronización del CRM; **4 KPIs** con el `StatTile` del HRMS (Por recaudar,
  Recaudado del mes, Monto en mora con # de negocios, Cuotas en mora) que enlazan al módulo y
  muestran en pequeño el valor del *otro* proyecto; **panel de Alertas** ordenado por
  gravedad (mora >90 días, Saldo Contraentrega vencido, Otrosíes sin verificar [solo BK],
  sincronización con error o >36 h sin actualizar, cuotas que vencen en los próximos 7 días,
  frentes sin fecha de entrega [solo admins, solo BK]) con estado vacío "Estás al día"; y
  **Accesos rápidos** tomados de `NAV_GROUPS` (ahora exportado de `AppShell.jsx`), filtrados por
  permiso. Backend: módulo nuevo `modules/inicio` (`GET /inicio`, solo `requireAuth`) que reusa
  `dashboard.service`/`olivResumen.service` y **omite cada KPI/alerta si el usuario no tiene el
  módulo al que enlaza**. La primera llamada con el cache frío tarda ~20 s (construye el
  cache de cartera; ya se muestra un esqueleto de carga). Las alertas enlazan con filtros
  aplicados: `/cartera-mora?rango=90%2B`, `?vista=contraentrega`, `/otrosies?verificado=no`
  (las 3 pantallas los leen una vez al montar y limpian la URL). No se probó con un usuario de
  permisos reducidos (solo con admin).
- **Pruebas de Inicio con permisos reducidos (2026-10-05):** con 4 roles/usuarios de prueba
  (ya borrados): solo `cartera-mora` ve 2 KPIs + sus 3 alertas + 1 acceso; solo `otrosies` ve
  solo la alerta de otrosíes; solo Oliv (`oliv-dashboard`+`oliv-oportunidades`) ve 2 KPIs y no ve
  Baía Kristal; sin permisos ve el mensaje "todavía no tiene acceso". Hallazgo corregido: la
  alerta de sincronización enlazaba a `/accesos/sincronizacion` (solo admin) -- para no
  administradores ahora se muestra sin enlace (`to: null`). Accesos rápidos: 3 por fila,
  icono arriba y etiqueta debajo.
- **Revisión de pendientes (2026-10-05):**
  - **Precalentado de caches** (`backend/src/modules/precalentar.js`): el cálculo de conciliación
    vive en MEMORIA del proceso y tarda ~20 s; sin precalentar, el primer usuario tras cada
    reinicio/deploy -- y tras cada sync/upload/cambio de configuración que lo invalide -- lo
    esperaba (muy visible en Inicio). Ahora `server.js` calienta Baía Kristal y Oliv 3 s después
    de escuchar, y `invalidarCacheDashboard()`/`invalidarCacheResumenOliv()` reprograman la
    reconstrucción en segundo plano con debounce de 15 s. Seguro: si falla solo se registra y el
    primer request lo reconstruye como siempre. `PRECALENTAR_CACHE=false` lo desactiva. En
    producción (un solo contenedor Node) aplica igual; con varias réplicas cada una calienta el
    suyo (cache por proceso). Verificado: `[precalentar] Baía Kristal listo en 21 s`.
  - **Barrido responsive** (20 pantallas a 1024 y 768 px): ninguna desborda la página. Bug real
    encontrado: el **tooltip oculto** (`InfoTooltip`, `opacity:0` pero con layout) se extendía
    fuera del borde derecho y agrandaba el área de scroll 30-65 px en Cartera/Resumen/Negocios a
    768 px; ahora es `display:none` en reposo (mismo bug existe en el HRMS, que comparte ese
    componente -- no se tocó aquí). `statsGrid` pasó a `minmax(240px)` para que 4 KPIs formen 2x2 en
    vez de 3+1.
  - **Filas de Cartera clicables** (BK y Oliv): clic abre el negocio (BK: `/negocios/:id`, o el
    inmueble si no tiene negocio; Oliv: `/oliv/negocios/:id`); se ignora si el clic fue sobre un
    enlace/botón o hay texto seleccionado; el clic derecho conserva el menú contextual. Otrosíes NO:
    sus filas no traen id de oportunidad/negocio al que abrir.
  - Saldo Contraentrega sin resultados: aviso verde "No hay inmuebles..." en vez de "0 inmuebles ...
    $0" en rojo. Verificadas sin hallazgos: detalle de inmueble de Oliv, Resumen de Oliv, Dashboard en
    pantalla completa (solo scrollea la tabla).
  - **Decidido NO hacer:** columnas fijas (sticky) en la tabla ancha de Cartera de Baía Kristal --
    los anchos de columna son variables y el desfase entre columnas fijas rompería el hover y el menú
    contextual; el scroll horizontal se mantiene.
- **Despliegue con Docker (mismo patrón que el HRMS), verificado con la imagen real (2026-10-05):**
  `Dockerfile` (3 etapas: build Vite, deps de producción del backend, imagen final; `PORT=3000`),
  `entrypoint.sh` (solo `sequelize-cli db:migrate` + `node src/server.js`; **nunca** `db:seed`),
  `.dockerignore`, `.gitattributes` (fuerza LF en `*.sh`/`Dockerfile`: un `entrypoint.sh` con CRLF
  falla en el contenedor) y `README.md` con build-args, variables y primer despliegue.
  `backend/src/app.js` ahora **sirve el build del frontend** (`frontend/dist`) con fallback a
  `index.html` para todo lo que no sea `/api/*`, y `CORS_ORIGIN` acepta varios orígenes separados por
  coma. `sequelize-cli` pasó de devDependency a dependency (el contenedor instala con `--omit=dev` y
  lo necesita para migrar). Frontend: `vite.config.js` toma `base` de `VITE_BASE_PATH`,
  `BrowserRouter basename={import.meta.env.BASE_URL}`, y los `window.open('/negocios/..')` pasan por
  `utils/rutas.js#rutaApp` para respetar el subpath (también el logo del shell y el del PDF de Oliv).
  Compatible con el gateway de "0. PLATAFORMA AED" (que quita el prefijo): build-args
  `VITE_API_BASE_URL=/cartera/api` y `VITE_BASE_PATH=/cartera/` (verificado el build con esos valores).
  Prueba real: imagen construida, contenedor contra la BD de desarrollo, `/api/health` 200, SPA con
  refresh directo, login + Inicio + Negocios sin errores de JS ni de red, precalentado en 25 s.
  `.gitignore` reescrito (secretos `.env*` salvo `.env.example`, builds, logs, uploads, SO, editores,
  herramientas locales); `.impeccable/` pasó a ignorarse (igual que el HRMS) y se destrackeó.
- **Migración a la base de datos NUEVA de producción (2026-10-05):** base `72.62.100.53:5440/postgres`
  (URL en `backend/.env` como `DESTINO_DATABASE_URL`, ignorado por git; NO es la misma que
  `cartera_aed_v2`/legada, que están en el puerto 5436). Fuentes: **Baía Kristal con movimientos
  diarios = base legada `postgres` (Prisma, `LEGACY_DATABASE_URL`)** vía `scripts/importarDatosLegado.js`
  (apuntado al destino con `PG*`); **todo Oliv = `cartera_aed_v2`** y lo que solo existe en la v2
  (usuarios, roles, auditoría, inventario, oportunidades, otrosíes, config de frentes, logs) vía
  `scripts/migracion/copiarDesdeV2.js`. Orígenes siempre en SOLO LECTURA. Pasos y "pasada final"
  en `backend/scripts/migracion/README.md`. Resultado verificado: todas las tablas coinciden fila
  por fila (3.089.180 movimientos fiduciarios, 1.285 hojas, 1.206 encargos, 1.711 negocios, 2.247
  compradores, 48.166 movimientos de negocio, 4 meses de resumen; + 17 tablas de la v2), sin llaves
  huérfanas ni `legacy_id` duplicados; la base nueva pesa ~3,2 GB. **Pendiente del corte:** una
  pasada final cuando Baía Kristal deje de recibir movimientos en la legada (esa base está viva: una
  re-subida de hojas borra/recrea filas, así que la pasada final debe reconciliar también borrados),
  apuntar las variables del despliegue a la base nueva y reiniciar el servidor.
  **Idea pendiente, NO empezar sin orden del usuario:** "Normalización de movimientos fiduciarios"
  (sacar el jsonb `datos` a columnas; ver notas en memoria).
- **Normalización de `movimientos_fiduciarios` (2026-10-05/06) -- pasos 0 a 6 hechos; faltan 7 y 8.** Se sacó el
  jsonb `datos` a 22 columnas reales para las líneas de movimiento (forma A, 96 %); las de estado por unidad
  (forma B, 4 %) y cualquier forma desconocida se quedan en `datos`; lo no convertible va a `datos_extra`. Diseño
  y resultados en `backend/scripts/migracion/normalizacion/DISENO.md`. Migraciones `20261006120000`
  (columnas) y `20261006120100` (disparador `mf_llenar_columnas_tg` + `mf_llenar_columnas()` + `mf_datos()`);
  scripts `paso1_medicion.js`, `paso2_perfil_datos.js`, `paso4_rellenar.js`, `paso5_verificar.js`.
  **Hallazgos:** las fechas del Excel son seriales (`44208` = 2021-01-14), no DD/MM/AAAA; `% Participación 1` viene
  siempre `" "`; el filtro de fechas de `fiducia.service.js` esperaba DD/MM/AAAA y nunca devolvía filas (ahora usa
  `fecha_contable`); `propietario` estaba cortado a 255 (6.567 filas; ahora `text` completo); el endpoint
  `/fiducia/movimientos` NO lo consume ninguna pantalla (la página Movimientos usa `negocio_movimientos` y el visor
  de hojas lee `hojas_fiduciarias.filas`), solo la subida de Excel lo escribe. **Verificado en la base nueva de
  producción (5440):** 0 diferencias al reconstruir `datos` en las 3.089.180 filas, suma de Valor idéntica a la copia
  del respaldo (13.623.342.804.147,70). Respaldo previo: carpeta `Respaldos-Cartera` del usuario (fuera del repo).
  **Código (paso 6, commit `4e6f127`):** modelo + `fiducia.service.js` (devuelve `datos` con `mf_datos()`, búsqueda
  sobre columnas, filtro de fechas); el escritor `fiducia.upload.js` NO cambia (lo cubre el disparador). Probado A/B
  contra el código anterior (9/10 consultas idénticas; las diferencias son las buscadas) y con la app local
  apuntando a la base nueva: 18 pantallas + encargos/hojas/unidad sin errores (hay 560 encargos sin hojas en la base
  vieja y en la nueva por igual: es un dato del origen, no un defecto de la migración). **Pasos 7 y 8 hechos (ver abajo).** El `.env` de desarrollo sigue apuntando a `cartera_aed_v2` (sin las columnas nuevas).
- **Normalización de `movimientos_fiduciarios` -- PASO 8 HECHO en producción (2026-10-06).** Migración
  `20261006130000` (`datos` pasa a admitir NULL y el disparador `mf_llenar_columnas()` lo deja en NULL en las filas
  tipo A solo si `mf_datos(NEW)` reproduce EXACTAMENTE el original; `down` lo re-materializa y es reversible).
  `paso8_vaciar_datos.js` (guarda por fila + VACUUM FULL) y `paso8_verificar.js` (hash por bloques contra una copia
  intacta). Resultado en la base nueva (5440): 2.969.077 filas A vaciadas, 0 conservaron `datos`; **tabla 4.739 MB ->
  1.855 MB y base completa 4.945 MB -> 2.061 MB** (la base de la migración original pesaba 3.245 MB); los 31 bloques
  (3.089.180 filas) idénticos al original; 18 pantallas + encargos/hojas/unidad sin errores. Las filas tipo B y las
  formas desconocidas (y cualquier fila A que no se reconstruya idéntica) conservan su `datos`. Para LEER el objeto
  original siempre `mf_datos(fila)`, nunca la columna `datos` cruda. Respaldos previos en la carpeta
  `Respaldos-Cartera` del usuario (710 MB, 2026-10-06, validado con `pg_restore --list`). La pasada final de la
  migración (`pasadaFinalMovimientos.js`) sigue funcionando: inserta `datos` y el disparador lo convierte/vacía.
- Pendiente: Panel de Alertas con más tipos y filas clicables en Cartera/Otrosíes (ver brechas
  conocidas arriba).
  Cartera ya heredó los estilos de tarjetas/KPIs de `Dashboard.module.css`.

## Carga diaria de la fiduciaria vía n8n (2026-10-06)

Los Excel de la fiduciaria llegan todos los días ~12:00 (hora de Colombia) por n8n a
`POST /api/fiducia/upload`. Antes solo aceptaba sesión por cookie, que n8n no tiene.
`middlewares/auth.js#requireAuthOIntegracion` acepta la sesión normal (con el módulo
`encargos`) **o** la cabecera `X-API-Key` igual a `INTEGRACION_API_KEY` (≥ 32 caracteres,
comparación en tiempo constante). La llave solo abre esa ruta; sin la variable, la vía
queda deshabilitada. Verificado a nivel de middleware (llave correcta/incorrecta/corta/sin credenciales).
n8n debe apuntar a `https://<dominio-gateway>/cartera/api/fiducia/upload` (multipart, campo `archivo`
+ opcionales `nombre, codigo, emailId, emailAsunto, emailFecha`; máx. 50 MB).

## Tipografía más compacta (2026-10-13)

Pedido del usuario: las fuentes se veían muy grandes. Se redujo la escala en `frontend/src/tokens.css` (y se documentó en `DESIGN.md`): Display `clamp(1.375rem, 1.1rem + 0.8vw, 1.75rem)`, Headline 1.125rem, Title 1rem, Body 0.9375rem, Data 0.8125rem; Label queda en 0.75rem. Es el mismo cambio en Solicitudes, Cartera y HRMS (comparten el bloque tipográfico). Todo lo que usa los tokens se ajusta solo; los tamaños escritos a mano en px/rem en algunos CSS no cambian.

## Auditoría de reglas de backend contra la plantilla (2026-10-15)

Se auditó el backend contra las reglas duras de `AED-REGLAS.md`. Hallazgos de Cartera:

- **Corregido:** `otrosi.controller.js#archivo` armaba a mano `res.status(502).json({ success: false, message })` (el `message` fuera de `error`, formato distinto al contrato). Ahora, si el stream de Zoho falla antes de enviar nada, pasa `next(new ApiError(502, ...))` y lo formatea el `errorHandler`.
- **Revisado y NO cambiado, a propósito:** `negocio_movimientos.fecha_contable` (48.318 filas) y `oportunidades.fecha_inicio_plan_pagos` (2.168 filas) son `DataTypes.DATE` (`timestamptz`) pero guardan solo fechas a medianoche UTC, que el código ya trata como "solo fecha UTC" de forma deliberada (`planDePagos.js`, `formatFechaUTC`). Convertirlas a `DATEONLY` tocaría una tabla grande, SQL crudo, la sincronización con Zoho (`new Date(...)` asignado a un `DATEONLY` se formatea en zona local, el gotcha de la regla 5) y los consumidores del frontend: cambio aparte, con su propia verificación. `close_date` (OLIV) y `email_fecha` guardan hora real y están bien como `DATE`.
- **Tolerado:** 28 de 49 migraciones tienen `down` (nunca se corre; la guía ahora dice que no se borran).
