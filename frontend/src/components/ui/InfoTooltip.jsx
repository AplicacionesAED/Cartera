import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './InfoTooltip.module.css';

const MARGEN = 8;
const SEPARACION = 8;

// Icono "i" con tooltip al hover/focus, para explicar que muestra un KPI o
// grafico sin ocupar espacio permanente en la interfaz -- ver "Info Tooltip"
// en DESIGN.md §5 Componentes. `tabIndex={0}` + `:focus-visible` lo hacen
// alcanzable por teclado, no solo por mouse; `role="tooltip"` +
// `aria-describedby` lo conectan para lectores de pantalla.
//
// La burbuja se dibuja con `position: fixed` en un portal (el <body>, o el <dialog> abierto que contiene el
// icono), no como hija del icono: dentro de una tabla con scroll, una tarjeta con `overflow` o un panel, una burbuja
// `absolute` queda recortada por el contenedor y no se ve. Se coloca arriba del icono (abajo si no cabe) y se ajusta
// para no salirse de la pantalla.
export function InfoTooltip({ text, titulo }) {
  const id = useId();
  const disparador = useRef(null);
  const burbuja = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!abierto || !disparador.current || !burbuja.current) return undefined;
    const colocar = () => {
      const r = disparador.current.getBoundingClientRect();
      const b = burbuja.current.getBoundingClientRect();
      const arriba = r.top - b.height - SEPARACION >= MARGEN;
      const top = arriba ? r.top - b.height - SEPARACION : r.bottom + SEPARACION;
      const centro = r.left + r.width / 2;
      const left = Math.min(Math.max(centro - b.width / 2, MARGEN), window.innerWidth - b.width - MARGEN);
      const flecha = Math.min(Math.max(centro - left, 14), b.width - 14);
      setPos({ top, left, arriba, flecha });
    };
    colocar();
    // Un scroll (de la página o de la tabla que contiene el icono) mueve el icono: se cierra en vez de dejar la burbuja suelta.
    const cerrar = () => setAbierto(false);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto, text]);

  const abrir = () => setAbierto(true);
  const cerrar = () => { setAbierto(false); setPos(null); };
  const anfitrion = abierto ? (disparador.current?.closest('dialog') ?? document.body) : null;

  return (
    <span
      ref={disparador}
      className={styles.wrapper}
      tabIndex={0}
      aria-describedby={abierto ? id : undefined}
      onMouseEnter={abrir}
      onMouseLeave={cerrar}
      onFocus={abrir}
      onBlur={cerrar}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 6.4V10.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="7" cy="4.2" r="0.9" fill="currentColor" />
      </svg>
      {anfitrion && createPortal(
        <span
          ref={burbuja}
          role="tooltip"
          id={id}
          className={`${styles.bubble} ${pos ? styles.visible : ''} ${pos && !pos.arriba ? styles.debajo : ''}`}
          style={pos ? { top: pos.top, left: pos.left, '--flecha-x': `${pos.flecha}px` } : { top: 0, left: 0 }}
        >
          {titulo && <span className={styles.titulo}>{titulo}</span>}
          {text}
        </span>,
        anfitrion
      )}
    </span>
  );
}
