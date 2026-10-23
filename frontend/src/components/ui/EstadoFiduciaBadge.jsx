// ESTADO FIDUCIA de un inmueble: el estado del negocio vinculado en la fiducia, VIP (respeta el del CRM) o LIBRE.
// Un LIBRE sin negocio vinculado lleva una alerta pequeña: puede ser un inmueble realmente libre o uno que no se logró
// vincular con la fiducia.
import { TriangleAlert } from 'lucide-react';
import { Badge } from './Badge.jsx';
import { EstadoInventarioBadge } from './EstadoInventarioBadge.jsx';
import { estadoToken } from '../../utils/estados.js';

export function EstadoFiduciaBadge({ estado, libreSinVinculo }) {
  if (!estado) return null;
  if (estado === 'VIP') return <EstadoInventarioBadge estado="VIP" />;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Badge variant={estadoToken(estado)}>{estado.replace(/_/g, ' ')}</Badge>
      {libreSinVinculo && (
        <span
          title="Sin negocio vinculado en la fiducia: se marca como LIBRE."
          aria-label="Sin negocio vinculado en la fiducia"
          style={{ display: 'inline-flex', color: 'var(--color-warning, #b45309)' }}
        >
          <TriangleAlert size={14} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
