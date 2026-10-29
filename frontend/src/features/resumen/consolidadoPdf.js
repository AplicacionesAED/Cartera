// PDF horizontal (A4 apaisado) del Consolidado de Cartera por Etapa, con los MISMOS valores ya
// formateados que se ven en pantalla (col.render) y el mismo color por grupo. Recibe las columnas y
// grupos de ResumenPage para no duplicar la definición de la tabla.
//
// Nombre del archivo: "Consolidado Cartera - <Mes del consolidado> - exportado <AAAA-MM-DD>.pdf"
// (mes que se está viendo, y fecha en que se exportó, en hora de Bogotá).
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const hexARgb = (argb) => [parseInt(argb.slice(2, 4), 16), parseInt(argb.slice(4, 6), 16), parseInt(argb.slice(6, 8), 16)];

// AAAA-MM-DD en hora de Bogotá (no la del equipo, para que el nombre sea el mismo para todos).
function fechaBogota(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

function fechaLargaBogota(fecha = new Date()) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(fecha);
}

export function nombreArchivoConsolidadoPdf(etiquetaMes, fecha = new Date()) {
  const mes = String(etiquetaMes || 'sin mes').replace(/[\\/:*?"<>|]/g, '').trim();
  return `Consolidado Cartera - ${mes} - exportado ${fechaBogota(fecha)}.pdf`;
}

async function cargarLogo() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}aed-logo.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const NOTA_BAIA_KRISTAL =
  'Réplica del Excel "CONSOLIDADO DE CARTERA" que arma Gerencia cada mes. ' +
  'Vendidas: inmuebles con estado fiducia distinto de Libre. Disponibles: inmuebles con estado fiducia Libre, valorados con su precio unitario de Zoho. ' +
  'Ventas fiduciaria y cuotas iniciales: valores de la fiducia. Recaudado: Total pagado de la conciliación. Cartera > 5 días: plan de pagos de Zoho.';

// Por defecto arma el consolidado por ETAPA de Baía Kristal; Oliv (consolidado por TORRE) pasa `titulo`,
// `encabezadoPrimera`, `filasDatos`, `etiquetaFila`, `nota` y `prefijoArchivo`.
export async function exportarConsolidadoPdf({
  datos, columnas, grupos, tonos, etiquetaEtapa,
  titulo = 'Consolidado de Cartera por Etapa — Baía Kristal',
  encabezadoPrimera = 'ETAPA',
  filasDatos = datos.etapas,
  etiquetaFila = (fila) => etiquetaEtapa(fila.etapa),
  nota: textoNota = NOTA_BAIA_KRISTAL,
  prefijoArchivo = 'Consolidado Cartera',
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 8;
  const ahora = new Date();

  // Encabezado del documento
  const logo = await cargarLogo();
  let xTitulo = margen;
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', margen, 6, 24, 8);
      xTitulo = margen + 28;
    } catch {
      xTitulo = margen;
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(titulo, xTitulo, 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Consolidado de ${datos.etiqueta}${datos.enVivo ? ' (en vivo)' : ' (cierre de mes)'}`, xTitulo, 15.5);
  doc.text(`Exportado el ${fechaLargaBogota(ahora)}`, ancho - margen, 10.5, { align: 'right' });

  // Encabezados de dos niveles: grupos (con su color) y nombre de cada columna
  const colorGrupo = (g) => hexARgb(tonos[g.tono].bg);
  const tintaGrupo = (g) => hexARgb(tonos[g.tono].ink);
  const filaGrupos = [
    { content: encabezadoPrimera, rowSpan: 2, styles: { halign: 'left', valign: 'middle', fillColor: [241, 245, 249], textColor: [30, 41, 59] } },
    ...grupos.map((g) => ({
      content: g.label.toUpperCase(),
      colSpan: g.span,
      styles: { halign: 'center', fillColor: colorGrupo(g), textColor: tintaGrupo(g), fontSize: 7 },
    })),
  ];
  const filaColumnas = columnas.map((col) => {
    const g = grupos[col.grupo];
    // Los '+' llevan espacios para que el texto parta por palabras y no a media palabra en columnas angostas.
    return { content: col.label.replace(/\+/g, ' + '), styles: { halign: 'center', valign: 'middle', fillColor: colorGrupo(g), textColor: tintaGrupo(g), fontSize: 5.2, cellPadding: 0.8 } };
  });

  const filas = [...filasDatos, datos.total];
  const cuerpo = filas.map((fila, idx) => {
    const esTotal = idx === filas.length - 1;
    return [
      { content: esTotal ? 'TOTAL GENERAL' : etiquetaFila(fila), styles: { fontStyle: 'bold', halign: 'left', fillColor: esTotal ? [238, 241, 245] : [255, 255, 255] } },
      ...columnas.map((col) => {
        const g = grupos[col.grupo];
        return {
          content: String(col.render(fila)),
          styles: esTotal
            ? { halign: 'center', fontStyle: 'bold', fillColor: [238, 241, 245], textColor: [30, 41, 59] }
            : { halign: 'center', fillColor: colorGrupo(g), textColor: tintaGrupo(g) },
        };
      }),
    ];
  });

  const anchoEtapa = 24;
  const anchoDato = (ancho - margen * 2 - anchoEtapa) / columnas.length;
  const columnStyles = { 0: { cellWidth: anchoEtapa } };
  columnas.forEach((_, i) => { columnStyles[i + 1] = { cellWidth: anchoDato }; });

  autoTable(doc, {
    startY: 20,
    head: [filaGrupos, filaColumnas],
    body: cuerpo,
    theme: 'grid',
    margin: { left: margen, right: margen },
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.6, lineColor: [203, 213, 225], lineWidth: 0.1, overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.1 },
    columnStyles,
  });

  const yFin = doc.lastAutoTable?.finalY ?? 60;
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const nota = doc.splitTextToSize(textoNota, ancho - margen * 2);
  doc.text(nota, margen, yFin + 5);

  doc.save(nombreArchivoConsolidadoPdf(datos.etiqueta, ahora, prefijoArchivo));
}
