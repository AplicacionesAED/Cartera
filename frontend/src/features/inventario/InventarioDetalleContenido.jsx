import { useEffect, useMemo, useState } from 'react';

import { EstadoInventarioBadge } from '../../components/ui/EstadoInventarioBadge.jsx';
import { EstadoFiduciaBadge } from '../../components/ui/EstadoFiduciaBadge.jsx';
import { getInventarioItem } from '../../api/inventario.js';
import styles from './InventarioDetallePage.module.css';
import { Vinculados } from '../../components/Vinculados.jsx';
import { DetalleHero } from '../../components/layout/DetalleHero.jsx';
import { Warehouse } from 'lucide-react';
import { formatCOP } from '../../utils/format.js';

import {
  VARIABLES_OCULTAS,
  etiquetaVariable,
  obtenerVariablesOrdenadas,
  GRUPOS_TITULOS,
  esVariableMoneda,
} from './variablesInmueble.js';

function parseMonto(v) {
  if (v == null) return null;

  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }

  const s = String(v).trim();

  if (s === '') return null;

  const plano = Number(s);

  if (!Number.isNaN(plano)) {
    return plano;
  }

  const solo = s.replace(/[^0-9.,-]/g, '');

  if (solo === '' || solo === '-') {
    return null;
  }

  const ultimaComa = solo.lastIndexOf(',');

  const n =
    ultimaComa !== -1
      ? parseFloat(
          `${solo
            .slice(0, ultimaComa)
            .replace(/\./g, '')}.${solo.slice(ultimaComa + 1)}`
        )
      : parseFloat(solo.replace(/\./g, ''));

  return Number.isNaN(n) ? null : n;
}

function formatValor(key, v) {
  if (v == null || v === '') return null;

  if (typeof v === 'boolean') {
    return v ? 'Sí' : 'No';
  }

  if (Array.isArray(v)) {
    return v.length
      ? v
          .map((x) =>
            typeof x === 'object'
              ? x.name || JSON.stringify(x)
              : String(x)
          )
          .join(', ')
      : null;
  }

  if (typeof v === 'object') {
    return v.name || v.display_label || JSON.stringify(v);
  }

  if (esVariableMoneda(key)) {
    const n = parseMonto(v);

    return n != null ? formatCOP(n) : String(v);
  }

  return String(v);
}

// Clave sintética para la variable "Nomenclatura completa".
const NOMENCLATURA_COMPLETA_KEY = '__nomenclatura_completa__';

function nomenclaturaCompleta(item) {
  const torreRaw = item?.datos?.Block_Tower || item?.torre || null;

  const torre =
    torreRaw &&
    (!item?.proyecto ||
      !String(torreRaw).startsWith(String(item?.proyecto)))
      ? String(torreRaw).trim()
      : null;

  const partes = [
    item?.proyecto,
    torre,
    item?.piso,
    item?.nombre,
  ]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).trim());

  return partes.length ? partes.join(' ') : null;
}

export function InventarioDetalleContenido({ id }) {
  const [item, setItem] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    setCargando(true);
    setError(null);

    getInventarioItem(id)
      .then((res) => setItem(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [id]);

  const datosCompletos = useMemo(() => {
    const datos = { ...(item?.datos || {}) };

    const completa = nomenclaturaCompleta(item);

    if (completa != null) {
      datos[NOMENCLATURA_COMPLETA_KEY] = completa;
    }

    return datos;
  }, [item]);

  const entries = useMemo(() => {
    const filtradas = Object.entries(datosCompletos).filter(
      ([k, v]) =>
        !VARIABLES_OCULTAS.has(k) &&
        formatValor(k, v) !== null
    );

    // La nomenclatura completa queda primero.
    const completaIdx = filtradas.findIndex(
      ([k]) => k === NOMENCLATURA_COMPLETA_KEY
    );

    if (completaIdx > 0) {
      const [nomenclatura] = filtradas.splice(completaIdx, 1);
      filtradas.unshift(nomenclatura);
    }

    // El ID queda último.
    const idIdx = filtradas.findIndex(([k]) => k === 'id');

    if (idIdx !== -1 && idIdx !== filtradas.length - 1) {
      const [idEntry] = filtradas.splice(idIdx, 1);
      filtradas.push(idEntry);
    }

    return filtradas;
  }, [datosCompletos]);

  const { grupos, gruposOrden } = useMemo(() => {
    const resultado = usarVariablesOrdenadas(entries, busqueda);

    if (resultado.grupos.identificacion) {
      const identificacion = [
        ...resultado.grupos.identificacion,
      ];

      // Nomenclatura completa primero.
      const idxNomenclatura = identificacion.indexOf(
        NOMENCLATURA_COMPLETA_KEY
      );

      if (idxNomenclatura !== -1) {
        const [nomenclatura] = identificacion.splice(
          idxNomenclatura,
          1
        );

        identificacion.unshift(nomenclatura);
      }

      // ID último.
      const idxId = identificacion.indexOf('id');

      if (idxId !== -1) {
        const [idEntry] = identificacion.splice(idxId, 1);
        identificacion.push(idEntry);
      }

      resultado.grupos.identificacion = identificacion;
    }

    return resultado;
  }, [entries, busqueda]);

  const totalVisible = gruposOrden.reduce(
    (suma, grupo) => suma + grupos[grupo].length,
    0
  );

  if (cargando) {
    return (
      <div className={styles.centrado}>
        <p className={styles.cargando}>Cargando…</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className={styles.centrado}>
        <p className={styles.error}>
          {error || 'No encontrado'}
        </p>
      </div>
    );
  }

  const kpis = [
    ['Proyecto', item.proyecto],
    ['Torre', item.torre],
    ['Piso', item.piso],
    ['Categoría', item.categoria],
    ['Estado CRM', item.estado ? <EstadoInventarioBadge estado={item.estado} /> : null],
    ['Estado fiducia', item.estadoFiducia ? <EstadoFiduciaBadge estado={item.estadoFiducia} libreSinVinculo={item.libreSinVinculo} /> : null],
  ].filter(
    ([, valor]) => valor != null && valor !== ''
  );

  return (
    <div className={styles.detalle}>
      <DetalleHero
        icon={Warehouse}
        titulo={item.nombre || '—'}
        subtitulo={
          [
            item.torre &&
            item.proyecto &&
            item.torre.startsWith(item.proyecto)
              ? item.torre
              : [item.proyecto, item.torre]
                  .filter(Boolean)
                  .join(' · '),
            item.piso,
          ]
            .filter(Boolean)
            .join(' · ') || 'Inmueble'
        }
        meta={
          item.referenciaRecaudo
            ? `Ref. recaudo: ${item.referenciaRecaudo}`
            : undefined
        }
      />

      <Vinculados
        proyecto="baia"
        tipo="inmueble"
        id={id}
      />

      {kpis.length > 0 && (
        <div className={styles.kpiGrid}>
          {kpis.map(([label, valor]) => (
            <div key={label} className={styles.kpiCard}>
              <p className={styles.kpiLabel}>{label}</p>
              <p className={styles.kpiValor}>{valor}</p>
            </div>
          ))}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitulo}>
            Todas las variables
          </span>

          <span className={styles.contador}>
            {totalVisible === entries.length
              ? entries.length
              : `${totalVisible} / ${entries.length}`}
          </span>
        </div>

        <div className={styles.busquedaContenedor}>
          <input
            type="search"
            className={styles.buscador}
            placeholder="Buscar una variable…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar una variable"
          />
        </div>

        {mostrarGruposVariables(
          grupos,
          gruposOrden,
          datosCompletos,
          busqueda.trim() !== ''
        )}
      </div>
    </div>
  );
}

/* --- Helpers internos para renderizado agrupado --- */

/**
 * Filtra `entries` por la búsqueda y las agrupa.
 */
function usarVariablesOrdenadas(entries, busqueda) {
  const q = busqueda.trim().toLowerCase();

  const filtradas = q
    ? entries.filter(([k, v]) =>
        `${etiquetaVariable(k)} ${formatValor(k, v)}`
          .toLowerCase()
          .includes(q)
      )
    : entries;

  return obtenerVariablesOrdenadas(filtradas);
}

/**
 * Renderiza las variables agrupadas en secciones visuales.
 */
function mostrarGruposVariables(
  grupos,
  gruposOrden,
  datos,
  conBusqueda
) {
  if (gruposOrden.length === 0) {
    return (
      <p className={styles.sinResultados}>
        {conBusqueda
          ? 'Ninguna variable coincide con la búsqueda.'
          : 'Este inmueble no tiene variables visibles.'}
      </p>
    );
  }

  return (
    <div className={styles.contenedorGrupos}>
      {gruposOrden.map((grupoNombre) => (
        <div
          key={grupoNombre}
          className={styles.seccionGrupo}
        >
          <h3 className={styles.tituloSeccion}>
            {GRUPOS_TITULOS[grupoNombre] || grupoNombre}
          </h3>

          <div className={styles.contenidoFilas}>
            {grupos[grupoNombre].map((key) => {
              const valor = formatValor(key, datos[key]);

              if (valor == null) return null;

              return (
                <div
                  key={key}
                  className={styles.fila}
                >
                  <span className={styles.miniLabel}>
                    {etiquetaVariable(key)}
                  </span>

                  <span className={styles.valor}>
                    {valor}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}