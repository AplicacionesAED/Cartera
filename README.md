# Cartera AED

Seguimiento de cartera, cobros y estados de cuenta de los proyectos **Baía Kristal** (CRM Zoho) y **Oliv** (CRM HubSpot).

- **Backend:** Node 20 + Express + Sequelize (PostgreSQL), en `backend/`.
- **Frontend:** React + Vite, en `frontend/`.
- **Producción:** un solo contenedor Docker. El proceso de Express sirve la API bajo `/api` y el build estático del frontend (mismo origen, sin nginx aparte).

## Desarrollo local

```bash
npm run install:all          # instala backend y frontend
cp backend/.env.example backend/.env   # y completa los valores
npm run db:migrate           # aplica migraciones
npm run dev                  # backend :3011 + frontend :5183
```

## Despliegue (Docker / Coolify)

La imagen se construye desde el `Dockerfile` de la raíz (3 etapas: build del frontend, dependencias de producción del backend, imagen final). Al arrancar, `entrypoint.sh` aplica las migraciones pendientes (`sequelize-cli db:migrate`) y levanta el servidor en el puerto **3000**.

### Build-args (se incrustan en el frontend al COMPILAR, no al arrancar)

| Build-arg | Default | Para qué |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000/api` | URL de la API. En producción: `https://<tu-dominio>/api` (o `/api` relativo). |
| `VITE_BASE_PATH` | *(vacío = `/`)* | Solo si la app va bajo un subpath de un gateway (ej. `/cartera/`; entonces `VITE_API_BASE_URL=/cartera/api`). |

```bash
docker build --build-arg VITE_API_BASE_URL=https://cartera.tudominio.com/api -t cartera-aed .
```

### Variables de entorno (en tiempo de ejecución)

Mismas que `backend/.env.example`. Las imprescindibles en producción:

| Variable | Notas |
|---|---|
| `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` `PGDATABASE` | Base PostgreSQL de Cartera. |
| `JWT_SECRET` | Obligatorio y **distinto** al de cualquier otro proyecto. |
| `CORS_ORIGIN` | Origen(es) del frontend, separados por coma (en un solo origen = el dominio de la app). |
| `ZOHO_CLIENT_ID` `ZOHO_CLIENT_SECRET` `ZOHO_REFRESH_TOKEN` `ZOHO_API_BASE` `ZOHO_ACCOUNTS_URL` | Sync de Baía Kristal. |
| `HUBSPOT_ACCESS_TOKEN` `HUBSPOT_API_BASE` | Sync de Oliv. |
| `EXCEL_PASSWORD` | Clave de los Excel de la fiduciaria. |
| `CENTRO_APLICACIONES_DATABASE_URL` | Solo lectura (plan de pago de la cotización aceptada de Oliv). |
| `PRECALENTAR_CACHE` | `false` desactiva el precalentado del cálculo de cartera al arrancar. |

`PORT` ya queda en `3000` dentro de la imagen; `NODE_ENV=production` también.
### Primer despliegue

1. Crea la base PostgreSQL vacía y configura las variables.
2. Despliega: las migraciones crean el esquema y siembran el rol ADMIN.
3. Crea el usuario administrador **una sola vez** (el entrypoint nunca corre seeders):
   ```bash
   docker exec -it <contenedor> sh -c "cd /app/backend && npx sequelize-cli db:seed:all"
   ```
   (usa `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NOMBRE` del entorno).
4. Entra con ese usuario y crea las demás cuentas desde *Configuración → Usuarios*.

Al arrancar, el servidor precalienta en segundo plano el cálculo de cartera (~20 s) para que la primera visita no espere.

## Prueba local de la imagen

```bash
docker build -t cartera-aed .
docker run --rm -p 3000:3000 --env-file backend/.env -e NODE_ENV=production -e CORS_ORIGIN=http://localhost:3000 cartera-aed
# abrir http://localhost:3000
```

> En **Git Bash para Windows**, un build-arg que empieza con `/` (ej. `VITE_BASE_PATH=/cartera/`) se convierte en una ruta de Windows; antepón `MSYS_NO_PATHCONV=1` al comando. Desde PowerShell o desde Coolify no pasa.
>
> Si el `docker build` se hace desde Windows, `.gitattributes` fuerza fin de línea LF en `entrypoint.sh` y el `Dockerfile`; sin eso el contenedor falla con `/bin/bash^M: bad interpreter`.

## Despliegue en Coolify detrás del gateway (Plataforma AED)

Probado localmente (2026-10-06) con la imagen real de Cartera detrás de un nginx que quita el prefijo `/cartera/`
(igual que el gateway): landing -> tarjeta -> login -> Inicio -> Dashboard/Cartera/Negocios/Encargos/Unidad/Oliv,
refresco directo en ruta profunda, logo, API y cookies (`path=/cartera/`, `Secure`, `HttpOnly`), sin errores de JS ni de red.

**Orden:**
1. **Cartera (recurso propio en Coolify):** repositorio `Gestion-servicios-TI-AED/Cartera`, rama `main`, *Build Pack: Dockerfile*,
   Base Directory `/`, Ports Exposes `3000`, y un **dominio público propio** (es el `CARTERA_UPSTREAM` del gateway).
   *Build arguments:* `VITE_API_BASE_URL=/cartera/api` y `VITE_BASE_PATH=/cartera/`. *Variables de entorno:* las de `backend/.env`
   salvo `PORT`, `NODE_ENV`, `FRONTEND_URL`, `ADMIN_*`; `PG*` apuntan a la base nueva;
   `JWT_SECRET` nuevo y propio; `CORS_ORIGIN` = dominio del gateway (con `https://`).
2. **Gateway:** definir `CARTERA_UPSTREAM` = dominio público de Cartera **sin** `https://`, y redeployar.
3. Los usuarios entran por `https://<dominio-del-gateway>/cartera/`. Con `VITE_BASE_PATH=/cartera/` el dominio propio de
   Cartera ya **no** sirve la app directamente (los assets quedan bajo `/cartera/`); solo sirve de upstream.

**Antes de que los usuarios la usen (corte):** correr la pasada final de `backend/scripts/migracion/README.md`
(Baía Kristal sigue recibiendo movimientos en la base legada hasta ese momento).

### Carga automática desde n8n

Variable de entorno `INTEGRACION_API_KEY` (≥ 32 caracteres). n8n envía `X-API-Key: <llave>` a
`POST /cartera/api/fiducia/upload` (multipart, campo `archivo`).
