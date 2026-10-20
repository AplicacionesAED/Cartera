// Puerto de zoho-payment-tracker/frontend/src/pages/Ajustes.jsx -- sección
// "Sincronización de datos" (SubformsBackfillCard).
// Backend: POST/GET /oportunidades/backfill-subforms[/status] (ya existía,
// sin frontend hasta ahora).
import { RefreshCw, Check, XCircle } from 'lucide-react';
import { AccesosLayout } from '../../components/layout/AccesosLayout.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { iniciarBackfillSubforms, getBackfillSubformsStatus } from '../../api/oportunidades.js';
import { SyncProgreso } from '../../components/SyncProgreso.jsx';
import { useSyncControl, normalizarEstadoRunning } from '../../hooks/useSyncControl.js';
import styles from './Accesos.module.css';
import shared from './Usuarios.module.css';

// Trae el plan de pagos (Forma de Pago/Propuesta de Pago) de Zoho para las
// oportunidades que todavía no lo tengan cacheado -- el GET masivo de Deals
// nunca lo trae, solo pidiendo el deal individual (ver
// oportunidad.subformsBackfill.js). Seguro de correr varias veces: solo
// procesa lo pendiente.
function BackfillSubformsCard() {
  const syncFaltantes = useSyncControl({
    iniciar: () => iniciarBackfillSubforms(false),
    obtener: getBackfillSubformsStatus,
    normalizar: normalizarEstadoRunning,
  });
  const sync = syncFaltantes;
  const result = sync.estado?.result;
  const enCurso = syncFaltantes.corriendo;

  return (
    <section className={shared.sectionCard}>
      <div>
        <h2 className={shared.sectionTitle}>Plan de pagos desde Zoho</h2>
        <p className={shared.sectionHint}>
          Trae el plan de pagos (Forma de Pago / Propuesta de Pago) de las oportunidades que todavía no lo tienen guardado. Si ya están todos, no hace nada.
          Para volver a leer los planes ya guardados (cuando se cambió uno en Zoho), usa "Actualizar planes de pago" en el módulo Oportunidades.
        </p>
      </div>

      {enCurso ? (
        <SyncProgreso progreso={sync.progreso} recibidoEn={sync.recibidoEn} titulo="Trayendo planes de pago…" />
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={syncFaltantes.ejecutar}>
            <RefreshCw size={13} />
            Traer los que faltan
          </Button>
        </div>
      )}

      {sync.errorInicio && (
        <div className={styles.statusError}>
          <XCircle size={14} />
          <span>No se pudo iniciar: {sync.errorInicio}</span>
        </div>
      )}

      {!enCurso && result?.ok === true && (
        <div className={styles.statusOk}>
          <Check size={14} />
          <span>{result.total === 0 ? 'No había planes pendientes por traer. Para refrescar los ya guardados usa "Releer todos".' : `Listo: ${result.actualizadas} de ${result.total} oportunidades actualizadas en ${result.elapsed}${result.errores > 0 ? ` (${result.errores} errores)` : ''}`}</span>
        </div>
      )}

      {!enCurso && result?.ok === false && (
        <div className={styles.statusError}>
          <XCircle size={14} />
          <span>Error: {result.error}</span>
        </div>
      )}
    </section>
  );
}

export function SincronizacionPage() {
  return (
    <div className={shared.page}>
      <AccesosLayout>
        <div className={shared.listHeader}>
          <div>
            <h1 className={shared.title}>Sincronización</h1>
            <p className={shared.subtitle}>Herramientas de mantenimiento sobre los datos que vienen de Zoho y HubSpot.</p>
          </div>
        </div>

        <BackfillSubformsCard />
      </AccesosLayout>
    </div>
  );
}
