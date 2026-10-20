// Franja "Vinculados" bajo el encabezado de los detalles de Oportunidad,
// Negocio e Inmueble: las tres piezas siempre en el mismo orden, la actual
// marcada y las otras dos como enlaces (con un dato clave) para saltar sin
// pasar por los listados. Estados de cada pieza: actual, enlace, sin vínculo
// (deshabilitada) o sin acceso al módulo (bloqueada, sin revelar el nombre).
// Si falla la consulta no muestra nada: es un atajo, nunca debe estorbar.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Briefcase, ChevronRight, Lock, Target, Warehouse } from 'lucide-react';
import { getVinculos } from '../api/vinculos.js';
import styles from './Vinculados.module.css';

const PIEZAS = [
  { tipo: 'oportunidad', label: 'Oportunidad', icon: Target, sin: 'Sin oportunidad vinculada' },
  { tipo: 'negocio', label: 'Negocio', icon: Briefcase, sin: 'Sin negocio vinculado' },
  { tipo: 'inmueble', label: 'Inmueble', icon: Warehouse, sin: 'Sin inmueble vinculado' },
];

export function Vinculados({ proyecto, tipo, id }) {
  const [vinculos, setVinculos] = useState(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setVinculos(null);
    setFallo(false);
    getVinculos(proyecto, tipo, id)
      .then((res) => { if (vigente) setVinculos(res.data); })
      .catch(() => { if (vigente) setFallo(true); });
    return () => { vigente = false; };
  }, [proyecto, tipo, id]);

  if (fallo) return null;

  return (
    <nav className={styles.franja} aria-label="Registros vinculados">
      <span className={styles.titulo}>Vinculados</span>
      <div className={styles.piezas}>
        {PIEZAS.map(({ tipo: t, label, icon: Icono, sin }) => {
          const v = vinculos?.[t];
          const cuerpo = (extra) => (
            <>
              <span className={styles.icono}><Icono size={18} strokeWidth={1.75} aria-hidden="true" /></span>
              <span className={styles.texto}>
                <span className={styles.etiqueta}>{label}</span>
                {extra}
              </span>
            </>
          );

          if (t === tipo) {
            return (
              <div key={t} className={`${styles.pieza} ${styles.actual}`} aria-current="page">
                {cuerpo(<span className={styles.detalle}>Estás aquí</span>)}
              </div>
            );
          }
          if (!vinculos) {
            return <div key={t} className={`${styles.pieza} ${styles.cargando}`}>{cuerpo(<span className={styles.detalle}>Cargando…</span>)}</div>;
          }
          if (v?.restringido) {
            return (
              <div key={t} className={`${styles.pieza} ${styles.bloqueada}`} title="No tienes acceso a este módulo">
                {cuerpo(<span className={styles.detalle}><Lock size={12} aria-hidden="true" /> Sin acceso</span>)}
              </div>
            );
          }
          if (!v) {
            return <div key={t} className={`${styles.pieza} ${styles.vacia}`}>{cuerpo(<span className={styles.detalle}>{sin}</span>)}</div>;
          }
          return (
            <Link key={t} to={v.to} className={`${styles.pieza} ${styles.enlace}`} title={[v.titulo, v.detalle, v.via].filter(Boolean).join(' · ')}>
              {cuerpo(
                <>
                  <span className={styles.valor}>{v.titulo}</span>
                  {v.detalle && <span className={styles.detalle}>{v.detalle}</span>}
                  {v.via && <span className={styles.via}>{v.via}</span>}
                </>
              )}
              <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
            </Link>
          );
        })}
        {vinculos?.cartera?.restringido && (
          <div className={`${styles.pieza} ${styles.bloqueada}`} title="No tienes acceso a este módulo">
            <span className={styles.icono}><AlertTriangle size={18} strokeWidth={1.75} aria-hidden="true" /></span>
            <span className={styles.texto}>
              <span className={styles.etiqueta}>Cartera</span>
              <span className={styles.detalle}><Lock size={12} aria-hidden="true" /> Sin acceso</span>
            </span>
          </div>
        )}
        {vinculos?.cartera && !vinculos.cartera.restringido && (
          <Link to={vinculos.cartera.to} className={`${styles.pieza} ${styles.enlace} ${styles.mora}`} title={[vinculos.cartera.titulo, vinculos.cartera.detalle, vinculos.cartera.via].filter(Boolean).join(' · ')}>
            <span className={styles.icono}><AlertTriangle size={18} strokeWidth={1.75} aria-hidden="true" /></span>
            <span className={styles.texto}>
              <span className={styles.etiqueta}>Cartera</span>
              <span className={styles.valor}>{vinculos.cartera.titulo}</span>
              {vinculos.cartera.detalle && <span className={styles.detalle}>{vinculos.cartera.detalle}</span>}
              {vinculos.cartera.via && <span className={styles.via}>{vinculos.cartera.via}</span>}
            </span>
            <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  );
}
