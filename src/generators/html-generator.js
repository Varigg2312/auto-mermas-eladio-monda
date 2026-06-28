'use strict';
const fs = require('fs');
const { calcularConsumo, nivelMerma } = require('../calculators/mermas');

function fmt(n) {
    return typeof n === 'number'
        ? n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';
}

const COLOR_NIVEL = {
    normal:  { texto: '#27ae60', fondo: '#f0fff4' },
    elevada: { texto: '#e67e22', fondo: '#fff9f0' },
    alta:    { texto: '#8b0000', fondo: '#fff5f5' },
};

function generarRegistroHTML({ cliente, entradas, salidas, kpis, fechaGeneracion, rutaSalida }) {
    const def     = cliente.merma_defecto;
    const balSign = kpis.balance >= 0 ? '+' : '';

    const sortE = [...entradas].sort((a, b) => compareFecha(b.fecha, a.fecha));
    const sortS = [...salidas ].sort((a, b) => compareFecha(b.fecha, a.fecha));

    const filasE = sortE.length
        ? sortE.map((e, i) => `
            <tr>
                <td class="n">${i + 1}</td>
                <td>${e.fecha}</td>
                <td>${e.referencia || '—'}</td>
                <td>${e.operador}</td>
                <td class="num">${fmt(e.kilos_brutos)} kg</td>
            </tr>`).join('')
        : `<tr><td colspan="5" class="empty">Sin entradas registradas</td></tr>`;

    const filasS = sortS.length
        ? sortS.map((s, i) => {
            const { bruto } = calcularConsumo(s.tipo, s.cantidad, s.porcentaje_merma);
            const nivel = nivelMerma(s.porcentaje_merma, def);
            const col   = COLOR_NIVEL[nivel];
            return `
            <tr>
                <td class="n">${i + 1}</td>
                <td>${s.fecha}</td>
                <td class="tipo-${s.tipo.toLowerCase()}">${s.tipo === 'GAZ' ? 'GAZPACHO' : 'SALMOREJO'}</td>
                <td>${s.referencia || '—'}</td>
                <td>${s.operador}</td>
                <td class="num">${fmt(s.cantidad)} ${s.tipo === 'GAZ' ? 'L' : 'kg'}</td>
                <td class="num" style="color:${col.texto};background:${col.fondo};font-weight:700">${fmt(s.porcentaje_merma)} %</td>
                <td class="num">${fmt(bruto)} kg</td>
            </tr>`;
        }).join('')
        : `<tr><td colspan="8" class="empty">Sin salidas registradas</td></tr>`;

    const balColor = kpis.balance >= 0 ? '#27ae60' : '#c0392b';
    const balBg    = kpis.balance >= 0 ? '#eafaf1'  : '#fdf2f2';

    const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registro — ${cliente.nombre}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#222;background:#f4f6f8}
.topbar{background:#1a1a2e;color:#fff;padding:18px 28px;display:flex;justify-content:space-between;align-items:center}
.topbar h1{font-size:20px;font-weight:700;letter-spacing:1px}
.topbar h1 span{color:#e74c3c}
.kpis{display:flex;gap:14px;padding:18px 28px;background:#fff;border-bottom:1px solid #e0e0e0;flex-wrap:wrap}
.kpi{flex:1;min-width:120px;border:1px solid #e0e0e0;padding:14px 16px;border-radius:8px;text-align:center}
.kpi .lbl{font-size:11px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:6px;display:block;letter-spacing:.5px}
.kpi .val{font-size:22px;font-weight:700;font-family:monospace;display:block}
.kpi-dark{background:#1a1a2e;border-color:#1a1a2e}.kpi-dark .lbl,.kpi-dark .val{color:#fff}
.kpi-slate{background:#2c3e50;border-color:#2c3e50}.kpi-slate .lbl,.kpi-slate .val{color:#fff}
.sec{margin:20px 28px}
.sec-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#fff;background:#2c3e50;padding:10px 16px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center}
.sec-title .cnt{font-size:11px;font-weight:400;background:rgba(255,255,255,.2);padding:2px 8px;border-radius:10px}
.twrap{overflow-x:auto;background:#fff;border-radius:0 0 6px 6px;box-shadow:0 2px 8px rgba(0,0,0,.07)}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{background:#f0f2f5;color:#555;padding:10px 12px;text-align:center;font-size:12px;font-weight:600;border-bottom:2px solid #ddd;white-space:nowrap;position:sticky;top:0;z-index:1}
td{padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;vertical-align:middle}
tr:hover td{background:#f7f9fc!important}
tfoot td{background:#f0f2f5!important;font-weight:700;border-top:2px solid #ddd}
.num{font-family:monospace;text-align:right;font-weight:600}
.n{color:#bbb;font-size:11px}
.tipo-gaz{color:#2980b9;font-weight:700;font-size:11px}
.tipo-sal{color:#8e44ad;font-weight:700;font-size:11px}
.empty{text-align:center;color:#bbb;font-style:italic;padding:20px}
.foot{text-align:center;padding:16px;font-size:11px;color:#aaa}
</style>
</head><body>

<div class="topbar">
    <div>
        <h1>REGISTRO ACUMULADO — <span>${cliente.nombre.toUpperCase()}</span></h1>
        <div style="font-size:12px;color:#aaa;margin-top:4px">Control de Mermas en Expedición</div>
    </div>
    <div style="font-size:12px;color:#aaa;text-align:right">
        Última actualización:<br><strong style="color:#fff">${fechaGeneracion}</strong>
    </div>
</div>

<div class="kpis">
    <div class="kpi"><span class="lbl">Tomate Stock Bruto</span><span class="val">${fmt(kpis.totalBruto)} kg</span></div>
    <div class="kpi"><span class="lbl">Tomate Consumido</span><span class="val">${fmt(kpis.totalConsumo)} kg</span></div>
    <div class="kpi" style="background:${balBg};border-color:${balColor}"><span class="lbl">Balance Inventario</span><span class="val" style="color:${balColor}">${balSign}${fmt(kpis.balance)} kg</span></div>
    <div class="kpi"><span class="lbl">Desperdicio Total</span><span class="val" style="color:#aaa">${fmt(kpis.totalDesperdicio)} kg</span></div>
    <div class="kpi kpi-dark"><span class="lbl">Total Gazpacho</span><span class="val">${fmt(kpis.totalGazpacho)} L</span></div>
    <div class="kpi kpi-slate"><span class="lbl">Total Salmorejo</span><span class="val">${fmt(kpis.totalSalmorejo)} kg</span></div>
</div>

<div class="sec">
    <div class="sec-title">Recepción de Tomate Bruto<span class="cnt">${entradas.length} entradas</span></div>
    <div class="twrap"><table>
        <thead><tr><th>#</th><th>Fecha</th><th>Ref. / Albarán</th><th>Operador</th><th>Masa Bruta</th></tr></thead>
        <tbody>${filasE}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right">TOTAL RECIBIDO</td><td class="num">${fmt(kpis.totalBruto)} kg</td></tr></tfoot>
    </table></div>
</div>

<div class="sec">
    <div class="sec-title">Expedición de Producto Terminado<span class="cnt">${salidas.length} salidas</span></div>
    <div class="twrap"><table>
        <thead><tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Ref. / Albarán</th><th>Operador</th><th>Cantidad</th><th>Merma %</th><th>Tomate cons.</th></tr></thead>
        <tbody>${filasS}</tbody>
        <tfoot><tr>
            <td colspan="5" style="text-align:right">TOTAL EXPEDIDO / CONSUMIDO</td>
            <td class="num">${fmt(kpis.totalGazpacho)} L + ${fmt(kpis.totalSalmorejo)} kg</td>
            <td></td>
            <td class="num">${fmt(kpis.totalConsumo)} kg</td>
        </tr></tfoot>
    </table></div>
</div>

<div class="foot">
    Merma: <span style="color:#27ae60">■</span> Normal &nbsp;
    <span style="color:#e67e22">■</span> Elevada (&gt;${(def * 1.15).toFixed(1)} %) &nbsp;
    <span style="color:#8b0000">■</span> Alta (&gt;${(def * 1.4).toFixed(1)} %) &nbsp;|&nbsp;
    Gazpacho: ${1.5} L/kg neto · Salmorejo: 1 kg/kg neto
</div>

</body></html>`;

    fs.writeFileSync(rutaSalida, html, 'utf-8');
}

// Compara fechas DD/MM/YYYY para ordenar
function compareFecha(a, b) {
    const p = s => { const [d,m,y] = s.split('/'); return new Date(+y, +m-1, +d); };
    return p(a) - p(b);
}

module.exports = { generarRegistroHTML };
