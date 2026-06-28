'use strict';
const PdfPrinter   = require('pdfmake');
const fs           = require('fs');
const { calcularConsumo, nivelMerma } = require('../calculators/mermas');

// pdfmake con fuentes built-in de PDF (sin archivos externos)
const FONTS = {
    Helvetica: {
        normal:      'Helvetica',
        bold:        'Helvetica-Bold',
        italics:     'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
    },
};
const printer = new PdfPrinter(FONTS);

const COLORES = {
    normal:   { texto: '#27ae60', fondo: '#f0fff4' },
    elevada:  { texto: '#e67e22', fondo: '#fff9f0' },
    alta:     { texto: '#8b0000', fondo: '#fff5f5' },
    rojo:     '#8b0000',
    oscuro:   '#1a1a2e',
    slate:    '#2c3e50',
    gris:     '#f5f5f5',
    grisCab:  '#f0f2f5',
    linea:    '#ddd',
    sublinea: '#f0f0f0',
};

function fmt(n) {
    return typeof n === 'number'
        ? n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';
}

// Cabecera de sección con fondo oscuro
function seccion(titulo) {
    return {
        table: {
            widths: ['*'],
            body: [[{ text: titulo, bold: true, fontSize: 10, color: '#ffffff', fillColor: COLORES.slate }]],
        },
        layout: {
            defaultBorder:  false,
            paddingTop:     () => 7,
            paddingBottom:  () => 7,
            paddingLeft:    () => 10,
            paddingRight:   () => 10,
        },
        margin: [0, 12, 0, 0],
    };
}

// Tarjeta KPI individual
function kpiCard(etiqueta, valor, bgColor, colorValor) {
    return {
        stack: [
            { text: etiqueta.toUpperCase(), fontSize: 6.5, color: bgColor === COLORES.oscuro || bgColor === COLORES.slate ? '#aaaaaa' : '#777777', bold: true },
            { text: valor, fontSize: 14, bold: true, color: colorValor, margin: [0, 4, 0, 0] },
        ],
        fillColor: bgColor,
        margin: [0, 0, 0, 0],
    };
}

// Layout de tabla con líneas horizontales y filas alternas
function layoutTabla() {
    return {
        hLineWidth:   (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
        vLineWidth:   () => 0,
        hLineColor:   (i) => i <= 1 ? COLORES.linea : COLORES.sublinea,
        fillColor:    (row) => row > 0 && row % 2 === 0 ? '#fafafa' : null,
        paddingTop:   () => 5,
        paddingBottom:() => 5,
        paddingLeft:  () => 6,
        paddingRight: () => 6,
    };
}

function generarPDF({ cliente, entradas, salidas, kpis, fechaGeneracion, rutaSalida }) {
    const def      = cliente.merma_defecto;
    const balSign  = kpis.balance >= 0 ? '+' : '';
    const balColor = kpis.balance >= 0 ? '#27ae60' : COLORES.rojo;
    const balFondo = kpis.balance >= 0 ? '#eafaf1' : '#fdf2f2';

    // ── Filas tabla entradas ──────────────────────────────────────────────────
    const TH = (text, align = 'center') => ({ text, bold: true, fontSize: 8, color: '#555555', fillColor: COLORES.grisCab, alignment: align });

    const filasEntradas = entradas.length > 0
        ? entradas.map((e, i) => [
            { text: i + 1, alignment: 'center', fontSize: 8, color: '#bbbbbb' },
            { text: e.fecha, alignment: 'center', fontSize: 9 },
            { text: e.referencia || '—', fontSize: 9 },
            { text: e.operador, fontSize: 9 },
            { text: fmt(e.kilos_brutos) + ' kg', alignment: 'right', bold: true, fontSize: 9 },
        ])
        : [[{ text: 'Sin entradas registradas', colSpan: 5, italics: true, color: '#bbbbbb', alignment: 'center', fontSize: 9 }, {}, {}, {}, {}]];

    const totalEntradas = [
        { text: 'TOTAL RECIBIDO', colSpan: 4, alignment: 'right', bold: true, fontSize: 9, fillColor: COLORES.grisCab },
        {}, {}, {},
        { text: fmt(kpis.totalBruto) + ' kg', alignment: 'right', bold: true, fontSize: 9, fillColor: COLORES.grisCab },
    ];

    // ── Filas tabla salidas ───────────────────────────────────────────────────
    const filasSalidas = salidas.length > 0
        ? salidas.map((s, i) => {
            const { bruto } = calcularConsumo(s.tipo, s.cantidad, s.porcentaje_merma);
            const nivel     = nivelMerma(s.porcentaje_merma, def);
            const col       = COLORES[nivel];
            return [
                { text: i + 1, alignment: 'center', fontSize: 8, color: '#bbbbbb' },
                { text: s.fecha, alignment: 'center', fontSize: 9 },
                { text: s.tipo === 'GAZ' ? 'GAZPACHO' : 'SALMOREJO', alignment: 'center', bold: true, fontSize: 8, color: s.tipo === 'GAZ' ? '#2980b9' : '#8e44ad' },
                { text: s.referencia || '—', fontSize: 9 },
                { text: s.operador, fontSize: 9 },
                { text: fmt(s.cantidad) + (s.tipo === 'GAZ' ? ' L' : ' kg'), alignment: 'right', bold: true, fontSize: 9 },
                { text: fmt(s.porcentaje_merma) + ' %', alignment: 'right', bold: true, fontSize: 9, color: col.texto, fillColor: col.fondo },
                { text: fmt(bruto) + ' kg', alignment: 'right', fontSize: 9 },
            ];
        })
        : [[{ text: 'Sin salidas registradas', colSpan: 8, italics: true, color: '#bbbbbb', alignment: 'center', fontSize: 9 }, {}, {}, {}, {}, {}, {}, {}]];

    const totalSalidas = [
        { text: 'TOTAL EXPEDIDO / CONSUMIDO', colSpan: 5, alignment: 'right', bold: true, fontSize: 9, fillColor: COLORES.grisCab },
        {}, {}, {}, {},
        { text: fmt(kpis.totalGazpacho) + ' L\n' + fmt(kpis.totalSalmorejo) + ' kg', alignment: 'right', bold: true, fontSize: 8, fillColor: COLORES.grisCab },
        { text: '', fillColor: COLORES.grisCab },
        { text: fmt(kpis.totalConsumo) + ' kg', alignment: 'right', bold: true, fontSize: 9, fillColor: COLORES.grisCab },
    ];

    // ── Documento ─────────────────────────────────────────────────────────────
    const docDefinition = {
        pageSize:        'A4',
        pageOrientation: 'landscape',
        pageMargins:     [20, 20, 20, 20],
        defaultStyle:    { font: 'Helvetica', fontSize: 9 },

        content: [
            // Cabecera
            {
                columns: [
                    {
                        stack: [
                            { text: 'AUDITORÍA Y GESTIÓN DE MERMAS', fontSize: 15, bold: true, color: COLORES.rojo },
                            { text: `${cliente.nombre.toUpperCase()} — CONTROL DE MERMAS EN EXPEDICIÓN`, fontSize: 9, color: '#555555', margin: [0, 3, 0, 0] },
                        ],
                    },
                    {
                        text: `Generado: ${fechaGeneracion}\nRegistros: ${entradas.length} entradas | ${salidas.length} salidas\nMerma por defecto: ${def} %`,
                        alignment: 'right',
                        fontSize: 8,
                        color: '#666666',
                    },
                ],
                margin: [0, 0, 0, 6],
            },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 802, y2: 0, lineWidth: 2, lineColor: COLORES.rojo }], margin: [0, 0, 0, 10] },

            // KPIs
            {
                table: {
                    widths: ['*', '*', '*', '*', '*', '*'],
                    body: [[
                        kpiCard('Tomate Stock Bruto',  fmt(kpis.totalBruto)      + ' kg', COLORES.gris,  '#333333'),
                        kpiCard('Tomate Consumido',    fmt(kpis.totalConsumo)    + ' kg', COLORES.gris,  '#333333'),
                        kpiCard('Balance Inventario',  balSign + fmt(kpis.balance) + ' kg', balFondo, balColor),
                        kpiCard('Desperdicio Total',   fmt(kpis.totalDesperdicio) + ' kg', COLORES.gris, '#aaaaaa'),
                        kpiCard('Total Gazpacho',      fmt(kpis.totalGazpacho)   + ' L',  COLORES.oscuro, '#ffffff'),
                        kpiCard('Total Salmorejo',     fmt(kpis.totalSalmorejo)  + ' kg', COLORES.slate,  '#ffffff'),
                    ]],
                },
                layout: {
                    defaultBorder:  false,
                    hLineWidth:     () => 1,
                    vLineWidth:     () => 1,
                    hLineColor:     () => '#dddddd',
                    vLineColor:     () => '#dddddd',
                    paddingTop:     () => 8,
                    paddingBottom:  () => 8,
                    paddingLeft:    () => 10,
                    paddingRight:   () => 10,
                },
                margin: [0, 0, 0, 0],
            },

            // Tabla entradas
            seccion(`RECEPCIÓN DE TOMATE BRUTO — ${entradas.length} entrada${entradas.length !== 1 ? 's' : ''}`),
            {
                table: {
                    headerRows: 1,
                    widths: [16, 58, '*', 130, 72],
                    body: [
                        [TH('#'), TH('Fecha'), TH('Ref. / Albarán', 'left'), TH('Operador', 'left'), TH('Masa Bruta', 'right')],
                        ...filasEntradas,
                        totalEntradas,
                    ],
                },
                layout:  layoutTabla(),
                margin: [0, 2, 0, 0],
            },

            // Tabla salidas
            seccion(`EXPEDICIÓN DE PRODUCTO TERMINADO — ${salidas.length} salida${salidas.length !== 1 ? 's' : ''}`),
            {
                table: {
                    headerRows: 1,
                    widths: [16, 58, 62, '*', 120, 58, 46, 68],
                    body: [
                        [TH('#'), TH('Fecha'), TH('Tipo'), TH('Ref. / Albarán', 'left'), TH('Operador', 'left'), TH('Cantidad', 'right'), TH('Merma %', 'right'), TH('Tomate cons.', 'right')],
                        ...filasSalidas,
                        totalSalidas,
                    ],
                },
                layout:  layoutTabla(),
                margin: [0, 2, 0, 0],
            },

            // Pie
            {
                columns: [
                    {
                        text: `Ratio base: Gazpacho ${1.5} L/kg neto · Salmorejo 1 kg/kg neto\nColores merma: ■ Normal  ■ Elevada (>${(def * 1.15).toFixed(1)} %)  ■ Alta (>${(def * 1.4).toFixed(1)} %)`,
                        fontSize: 7,
                        color: '#888888',
                    },
                    {
                        stack: [
                            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 170, y2: 0, lineWidth: 0.5, lineColor: '#aaaaaa' }] },
                            { text: cliente.nombre_expedidor + ' — Responsable de Producción', fontSize: 8, color: '#555555', margin: [0, 4, 0, 0] },
                        ],
                        alignment: 'right',
                        width: 200,
                    },
                ],
                margin: [0, 14, 0, 0],
            },
        ],
    };

    return new Promise((resolve, reject) => {
        const doc    = printer.createPdfKitDocument(docDefinition);
        const stream = fs.createWriteStream(rutaSalida);
        doc.pipe(stream);
        doc.end();
        stream.on('finish', () => resolve(rutaSalida));
        stream.on('error',  reject);
    });
}

module.exports = { generarPDF };
