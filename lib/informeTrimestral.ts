// Presentación (.pptx) del informe trimestral: KPIs del trimestre comparados con el mismo trimestre del año
// anterior, evolución mensual, canales, reservas a futuro y facturación. Se genera en el navegador y se descarga.

import {
  CANALES,
  COLORES_CANAL,
  COLOR_ACTUAL,
  COLOR_ANTERIOR,
  MESES,
  MESES_CORTOS,
  calcularTrimestre,
  eur0,
  pct,
  signo,
  valorFuturo,
  type Anual,
} from "./reporting";

export type DatosFacturacion = {
  iva: { anio: number; trimestre: number; base_ingresos: number; iva_repercutido: number; base_gastos: number; iva_soportado: number; iva_a_pagar: number; resultado: number }[];
  facturas: { cliente: string; total: number; base: number }[]; // emitidas en el trimestre, por destinatario
};

const TINTA = "1C2321";
const SUAVE = "6B6B6B";
const MARINO = "002060";
const hex = (c: string) => c.replace("#", "");

export async function generarInformeTrimestral(opts: {
  actual: Anual;
  anterior: Anual;
  trimestre: number;
  nombreCliente: string;
  facturacion: DatosFacturacion;
}) {
  const { actual, anterior, trimestre: t, nombreCliente, facturacion } = opts;
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = `Informe ${t}T ${actual.anio} · ${nombreCliente}`;
  const A = actual.anio;
  const P = anterior.anio;
  const qa = calcularTrimestre(actual, t);
  const qp = calcularTrimestre(anterior, t);
  const mesesQ = [0, 1, 2].map((i) => (t - 1) * 3 + i); // índices 0-11
  const nombreQ = `${t}T ${A}`;

  const titulo = (s: ReturnType<typeof pptx.addSlide>, texto: string, sub?: string) => {
    s.addText(texto, { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontSize: 24, bold: true, color: TINTA, fontFace: "Arial" });
    if (sub) s.addText(sub, { x: 0.5, y: 0.85, w: 12.3, h: 0.4, fontSize: 12, color: SUAVE, fontFace: "Arial" });
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.3, w: 12.3, h: 0, line: { color: "DEDAD1", width: 1 } });
  };
  const celda = (text: string, o: Record<string, unknown> = {}) => ({ text, options: { fontSize: 11, fontFace: "Arial", color: TINTA, ...o } });
  const cab = (text: string) => celda(text, { bold: true, color: "FFFFFF", fill: { color: MARINO } });

  // 1. Portada
  {
    const s = pptx.addSlide();
    s.background = { color: "F7F6F2" };
    s.addText("Informe trimestral", { x: 0.8, y: 2.2, w: 11.5, h: 0.8, fontSize: 40, bold: true, color: TINTA, fontFace: "Arial" });
    s.addText(`${nombreQ} · ${MESES[mesesQ[0]]} – ${MESES[mesesQ[2]]}`, { x: 0.8, y: 3.1, w: 11.5, h: 0.6, fontSize: 22, color: TINTA, fontFace: "Arial" });
    s.addText(`${nombreCliente} · comparado con el ${t}T ${P}`, { x: 0.8, y: 3.8, w: 11.5, h: 0.5, fontSize: 16, color: SUAVE, fontFace: "Arial" });
    s.addText(`El Botones Madrid · generado el ${new Date().toLocaleDateString("es-ES")}`, { x: 0.8, y: 6.6, w: 11.5, h: 0.4, fontSize: 11, color: SUAVE, fontFace: "Arial" });
  }

  // 2. KPIs del trimestre vs año anterior
  {
    const s = pptx.addSlide();
    titulo(s, `KPIs clave · ${nombreQ}`, `Comparación con el ${t}T ${P}`);
    const fila = (k: string, a: string, p: string, d: string) => [celda(k, { bold: true }), celda(a, { align: "right" }), celda(p, { align: "right" }), celda(d, { align: "right", bold: true })];
    const dif = (a: number | null, p: number | null, f: (x: number) => string) => (a == null || p == null ? "—" : signo(a - p, f));
    const rows = [
      [cab("Indicador"), cab(`${t}T ${A}`), cab(`${t}T ${P}`), cab("Diferencia")],
      fila("Ingresos", eur0(qa.ingresos), eur0(qp.ingresos), dif(qa.ingresos, qp.ingresos, (x) => eur0(x))),
      fila("Nº de reservas", String(qa.reservas), String(qp.reservas), dif(qa.reservas, qp.reservas, (x) => String(x))),
      fila("Noches ocupadas", String(qa.nochesOcupadas), String(qp.nochesOcupadas), dif(qa.nochesOcupadas, qp.nochesOcupadas, (x) => String(x))),
      fila("Ocupación media", pct(qa.ocupacionMedia), pct(qp.ocupacionMedia), dif(qa.ocupacionMedia, qp.ocupacionMedia, (x) => `${(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} p.p.`)),
      fila("Precio medio noche", eur0(qa.precioNocheMedio), eur0(qp.precioNocheMedio), dif(qa.precioNocheMedio, qp.precioNocheMedio, (x) => eur0(x))),
      fila("Valor medio reserva", eur0(qa.valorMedioReserva), eur0(qp.valorMedioReserva), dif(qa.valorMedioReserva, qp.valorMedioReserva, (x) => eur0(x))),
      fila(
        "Reservas a futuro (fin de trimestre)",
        eur0(valorFuturo(actual, mesesQ[2] + 1)),
        eur0(valorFuturo(anterior, mesesQ[2] + 1)),
        dif(valorFuturo(actual, mesesQ[2] + 1), valorFuturo(anterior, mesesQ[2] + 1), (x) => eur0(x)),
      ),
    ];
    s.addTable(rows, { x: 0.8, y: 1.7, w: 11.7, colW: [4.5, 2.4, 2.4, 2.4], rowH: 0.5, border: { type: "solid", color: "DEDAD1", pt: 0.75 } });
  }

  // 3. Ingresos mensuales del año vs año anterior (hasta el fin del trimestre)
  const hasta = t * 3;
  const etiquetas = MESES_CORTOS.slice(0, hasta);
  const barras = (s: ReturnType<typeof pptx.addSlide>, valores: [number[], number[]], fmt: string, pos: { x: number; y: number; w: number; h: number }, tituloEje?: string) => {
    s.addChart(
      pptx.ChartType.bar,
      [
        { name: String(A), labels: etiquetas, values: valores[0] },
        { name: String(P), labels: etiquetas, values: valores[1] },
      ],
      {
        ...pos,
        barDir: "col",
        barGrouping: "clustered",
        chartColors: [hex(COLOR_ACTUAL), hex(COLOR_ANTERIOR)],
        showLegend: true,
        legendPos: "t",
        legendFontSize: 11,
        catAxisLabelFontSize: 11,
        valAxisLabelFontSize: 10,
        valAxisLabelFormatCode: fmt,
        valGridLine: { color: "E8E6E0", size: 0.5 }, valAxisMinVal: 0,
        showValAxisTitle: !!tituloEje,
        valAxisTitle: tituloEje,
        barGapWidthPct: 60,
      },
    );
  };
  {
    const s = pptx.addSlide();
    titulo(s, "Ingresos por mes", `Enero – ${MESES[hasta - 1]} · ${A} frente a ${P}`);
    barras(s, [actual.meses.slice(0, hasta).map((m) => Math.round(m.ingresos)), anterior.meses.slice(0, hasta).map((m) => Math.round(m.ingresos))], "#,##0 €", { x: 0.6, y: 1.5, w: 12.1, h: 5.6 });
  }

  // 4. Ocupación y precio medio por noche (dos gráficos: escalas distintas)
  {
    const s = pptx.addSlide();
    titulo(s, "Ocupación y precio medio por noche", `Enero – ${MESES[hasta - 1]} · ${A} frente a ${P}`);
    barras(
      s,
      [actual.meses.slice(0, hasta).map((m) => Math.round((m.ocupacion ?? 0) * 1000) / 10), anterior.meses.slice(0, hasta).map((m) => Math.round((m.ocupacion ?? 0) * 1000) / 10)],
      '0"%"',
      { x: 0.5, y: 1.5, w: 6.1, h: 5.4 },
      "Ocupación (%)",
    );
    barras(
      s,
      [actual.meses.slice(0, hasta).map((m) => Math.round(m.precioNoche ?? 0)), anterior.meses.slice(0, hasta).map((m) => Math.round(m.precioNoche ?? 0))],
      "#,##0 €",
      { x: 6.8, y: 1.5, w: 6.1, h: 5.4 },
      "Precio medio noche (€)",
    );
  }

  // 5. Ingresos por canal en el trimestre
  {
    const s = pptx.addSlide();
    titulo(s, `Ingresos por canal · ${nombreQ}`, `Comparación con el ${t}T ${P}`);
    const canales = CANALES.filter((c) => qa.canales[c].reservas || qp.canales[c].reservas);
    s.addChart(
      pptx.ChartType.bar,
      [
        { name: String(A), labels: canales, values: canales.map((c) => Math.round(qa.canales[c].ingresos)) },
        { name: String(P), labels: canales, values: canales.map((c) => Math.round(qp.canales[c].ingresos)) },
      ],
      {
        x: 0.5, y: 1.5, w: 6.6, h: 5.4, barDir: "bar", barGrouping: "clustered",
        chartColors: [hex(COLOR_ACTUAL), hex(COLOR_ANTERIOR)], showLegend: true, legendPos: "t", legendFontSize: 11,
        catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "#,##0 €", valGridLine: { color: "E8E6E0", size: 0.5 }, valAxisMinVal: 0, barGapWidthPct: 60,
      },
    );
    const rows = [
      [cab("Canal"), cab(`Nº res. ${A}`), cab(`Ingresos ${A}`), cab(`Nº res. ${P}`), cab(`Ingresos ${P}`)],
      ...canales.map((c) => [
        celda(c, { bold: true }),
        celda(String(qa.canales[c].reservas), { align: "right" }),
        celda(eur0(qa.canales[c].ingresos), { align: "right" }),
        celda(String(qp.canales[c].reservas), { align: "right" }),
        celda(eur0(qp.canales[c].ingresos), { align: "right" }),
      ]),
      [celda("Total", { bold: true }), celda(String(qa.reservas), { align: "right", bold: true }), celda(eur0(qa.ingresos), { align: "right", bold: true }), celda(String(qp.reservas), { align: "right", bold: true }), celda(eur0(qp.ingresos), { align: "right", bold: true })],
    ];
    s.addTable(rows, { x: 7.3, y: 1.6, w: 5.6, colW: [1.7, 0.9, 1.1, 0.9, 1.0], fontSize: 10, rowH: 0.38, border: { type: "solid", color: "DEDAD1", pt: 0.75 } });
  }

  // 6. Valor de reservas a futuro por canal (tabla informada a mano; si no, reservas registradas)
  {
    const s = pptx.addSlide();
    const idx = Array.from({ length: 12 - hasta }, (_, i) => hasta + i);
    const valor = (c: string, i: number) => (actual.futuro && Object.keys(actual.futuro).length ? Number(actual.futuro[c]?.[i] ?? 0) : actual.meses[i].canales[c].ingresos);
    titulo(s, "Valor de reservas a futuro por canal", idx.length ? `${MESES[hasta]} – Diciembre ${A}` : `Año ${A + 1}`);
    const canales = CANALES.filter((c) => idx.some((i) => valor(c, i)));
    if (!idx.length || !canales.length) {
      s.addText(idx.length ? "No hay valor de reservas informado para los próximos meses." : `Valor a futuro ${A + 1}: ${eur0(valorFuturo(actual, 12))}`, {
        x: 0.8, y: 2, w: 11.5, h: 0.6, fontSize: 16, color: SUAVE, fontFace: "Arial",
      });
    } else {
      s.addChart(
        pptx.ChartType.bar,
        canales.map((c) => ({ name: c, labels: idx.map((i) => MESES_CORTOS[i]), values: idx.map((i) => Math.round(valor(c, i))) })),
        {
          x: 0.5, y: 1.5, w: 8.2, h: 5.4, barDir: "col", barGrouping: "stacked",
          chartColors: canales.map((c) => hex(COLORES_CANAL[c])), showLegend: true, legendPos: "t", legendFontSize: 11,
          catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "#,##0 €", valGridLine: { color: "E8E6E0", size: 0.5 }, valAxisMinVal: 0, barGapWidthPct: 50,
        },
      );
      const rows = [
        [cab("Mes"), cab("Valor")],
        ...idx.map((i) => [celda(MESES[i]), celda(eur0(canales.reduce((t, c) => t + valor(c, i), 0)), { align: "right" })]),
        [celda(`Año ${A + 1}`), celda(eur0(valorFuturo(actual, 12)), { align: "right" })],
      ];
      s.addTable(rows, { x: 9.0, y: 1.6, w: 3.9, colW: [2.0, 1.9], fontSize: 11, rowH: 0.38, border: { type: "solid", color: "DEDAD1", pt: 0.75 } });
    }
  }

  // 7. Facturación del trimestre
  {
    const s = pptx.addSlide();
    titulo(s, `Facturación · ${nombreQ}`, `Libro de facturas e IVA, comparado con el ${t}T ${P}`);
    const ia = facturacion.iva.find((x) => x.anio === A && x.trimestre === t);
    const ip = facturacion.iva.find((x) => x.anio === P && x.trimestre === t);
    const v = (r: typeof ia, k: keyof NonNullable<typeof ia>) => (r ? Number(r[k]) : 0);
    const rows = [
      [cab(""), cab(`${t}T ${A}`), cab(`${t}T ${P}`), cab("Diferencia")],
      ...(
        [
          ["Base facturada (ingresos)", "base_ingresos"],
          ["IVA repercutido", "iva_repercutido"],
          ["Base gastos", "base_gastos"],
          ["IVA soportado", "iva_soportado"],
          ["IVA a pagar", "iva_a_pagar"],
          ["Resultado (ingresos − gastos)", "resultado"],
        ] as [string, keyof NonNullable<typeof ia>][]
      ).map(([k, c]) => [celda(k, { bold: true }), celda(eur0(v(ia, c)), { align: "right" }), celda(eur0(v(ip, c)), { align: "right" }), celda(signo(v(ia, c) - v(ip, c), (x) => eur0(x)), { align: "right", bold: true })]),
    ];
    s.addTable(rows, { x: 0.5, y: 1.6, w: 7.2, colW: [3.0, 1.4, 1.4, 1.4], rowH: 0.45, border: { type: "solid", color: "DEDAD1", pt: 0.75 } });
    if (facturacion.facturas.length) {
      const fr = [
        [cab("Facturas emitidas"), cab("Base"), cab("Total")],
        ...facturacion.facturas.map((f) => [celda(f.cliente), celda(eur0(f.base), { align: "right" }), celda(eur0(f.total), { align: "right" })]),
      ];
      s.addTable(fr, { x: 8.0, y: 1.6, w: 4.9, colW: [2.5, 1.2, 1.2], fontSize: 10, rowH: 0.38, border: { type: "solid", color: "DEDAD1", pt: 0.75 } });
    }
  }

  await pptx.writeFile({ fileName: `Informe_${t}T_${A}_${nombreCliente.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "_")}.pptx` });
}
