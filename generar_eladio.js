'use strict';
const { chromium } = require('C:/Users/User/Desktop/AUTO LOTES TRAZABILIDAD EL HORTELANO/node_modules/playwright');
const fs   = require('fs');
const path = require('path');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const EMPRESA    = 'El Hortelano';
const DATOS_FILE = path.join(__dirname, 'ELADIO', 'DATOS DEL DIA.txt');
const JSON_FILE  = path.join(__dirname, 'ELADIO', 'datos_acumulados.json');
const OUT_DIR    = 'C:\\Users\\User\\Desktop\\Hortelano\\INFORMES MERMAS';
const FIRMA_DEF      = 'Alimentos El Hortelano';
const FIRMA_PROVEEDOR = 'Frutas Y Verduras Eladio';
const REGISTRO_FILE  = path.join(__dirname, 'ELADIO', 'REGISTRO.html');

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmt(n) {
    return typeof n === 'number'
        ? n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(n || '—');
}
function fmtFecha(str) {
    if (!str) return '—';
    const p = str.split(/[\/\-]/);
    if (p.length === 3 && p[0].length === 4)
        return `${p[2].padStart(2,'0')}/${p[1].padStart(2,'0')}/${p[0]}`;
    return str;
}
function fmtArchivo(str) {
    if (!str) return new Date().toLocaleDateString('es-ES').replace(/\//g,'-');
    const p = str.split(/[\/\-]/);
    if (p.length === 3) {
        if (p[0].length === 4) return `${p[2].padStart(2,'0')}-${p[1].padStart(2,'0')}-${p[0]}`;
        return `${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}-${p[2]}`;
    }
    return str.replace(/\//g,'-');
}
function parseDate(str) {
    const [d,m,y] = str.split('/');
    return new Date(+y, +m-1, +d);
}
function calcConsumido(r, def) {
    const neto  = r.type === 'GAZ' ? r.qty / 1.5 : r.qty;
    const merma = (r.merma !== undefined && r.merma !== null && !isNaN(r.merma)) ? r.merma : def;
    const bruto = neto / (1 - merma / 100);
    return { neto, merma, bruto, basura: bruto - neto };
}

// ── PARSEAR TXT ───────────────────────────────────────────────────────────────
function leerHoy() {
    const texto = fs.readFileSync(DATOS_FILE, 'utf-8');
    const lines = texto.split('\n').map(l => l.trim());
    const r = { fecha: null, operador: FIRMA_DEF, merma_defecto: 5, entradas: [], salidas: [] };

    let section = null;
    let cur = {};

    function val(line) {
        const i = line.indexOf(':');
        return i < 0 ? '' : line.slice(i + 1).replace(/←.*$/, '').trim();
    }
    function guardar() {
        if (!section || !cur.qty || cur.qty <= 0) return;
        if (section === 'IN')  r.entradas.push({ qty: cur.qty, ref: cur.ref || 'Manual' });
        if (section === 'GAZ') r.salidas.push({ type: 'GAZ', qty: cur.qty, ref: cur.ref || 'Manual', merma: cur.merma ?? null });
        if (section === 'SAL') r.salidas.push({ type: 'SAL', qty: cur.qty, ref: cur.ref || 'Manual', merma: cur.merma ?? null });
    }

    for (const line of lines) {
        if (!line) continue;

        if (/TOMATE RECIBIDO/i.test(line))    { guardar(); section = 'IN';  cur = {}; continue; }
        if (/GAZPACHO EXPEDIDO/i.test(line))  { guardar(); section = 'GAZ'; cur = {}; continue; }
        if (/SALMOREJO EXPEDIDO/i.test(line)) { guardar(); section = 'SAL'; cur = {}; continue; }
        if (/^[━▌]/.test(line)) continue;

        const mFecha = line.match(/^Fecha de hoy:\s*(.+)/i);
        const mOp    = line.match(/^Operador:\s*(.+)/i);
        if (mFecha) { r.fecha    = mFecha[1].replace(/←.*$/, '').trim(); continue; }
        if (mOp)    { r.operador = mOp[1].replace(/←.*$/, '').trim();    continue; }

        if (!section) continue;

        if (/Kilos recibidos:|Litros expedidos:|Kilos expedidos:/i.test(line)) {
            const v = val(line); cur.qty = v ? (parseFloat(v) || 0) : 0;
        } else if (/Número de albarán:/i.test(line)) {
            const v = val(line); cur.ref = v || 'Manual';
        } else if (/% de merma:/i.test(line)) {
            const v = val(line); cur.merma = v ? parseFloat(v) : null;
        }
    }
    guardar();
    return r;
}

// ── CALCULAR KPIs ─────────────────────────────────────────────────────────────
function calcKPIs(datos) {
    const def = datos.merma_defecto || 20;
    let tBruto = 0, tConsumo = 0, tBasura = 0, vGaz = 0, kSalm = 0;
    datos.entradas.forEach(r => tBruto += r.qty);
    datos.salidas.forEach(r => {
        const { bruto, basura } = calcConsumido(r, def);
        tConsumo += bruto; tBasura += basura;
        if (r.type === 'GAZ') vGaz += r.qty; else kSalm += r.qty;
    });
    return { tBruto, tConsumo, tBasura, vGaz, kSalm, balance: tBruto - tConsumo };
}

// ── GENERAR HTML ──────────────────────────────────────────────────────────────
function generarHTML(datos, kpis, fechaHoy) {
    const def = datos.merma_defecto || 20;
    const balColor = kpis.balance < 0 ? '#8b0000' : '#27ae60';
    const balSign  = kpis.balance >= 0 ? '+' : '';

    const sortE = [...datos.entradas].sort((a,b) => parseDate(a.date) - parseDate(b.date));
    const sortS = [...datos.salidas ].sort((a,b) => parseDate(a.date) - parseDate(b.date));

    const filasE = sortE.length
        ? sortE.map(r => `<tr>
            <td>${r.date}</td>
            <td>${r.ref}</td>
            <td>${r.operator || '—'}</td>
            <td class="num">${fmt(r.qty)} kg</td>
          </tr>`).join('')
        : `<tr><td colspan="4" class="empty">Sin entradas registradas</td></tr>`;

    const filasS = sortS.length
        ? sortS.map(r => {
            const { merma, bruto } = calcConsumido(r, def);
            const cls = merma > def*1.4 ? 'bad' : merma > def*1.15 ? 'warn' : 'ok';
            return `<tr>
                <td>${r.date}</td>
                <td><strong>${r.type === 'GAZ' ? 'GAZPACHO' : 'SALMOREJO'}</strong></td>
                <td>${r.ref}</td>
                <td>${r.operator || '—'}</td>
                <td class="num">${fmt(r.qty)} ${r.type === 'GAZ' ? 'L' : 'kg'}</td>
                <td class="num ${cls}">${fmt(merma)} %</td>
                <td class="num">${fmt(bruto)} kg</td>
              </tr>`;
        }).join('')
        : `<tr><td colspan="7" class="empty">Sin salidas registradas</td></tr>`;

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 8.5px; color: #111; padding: 16px; }

  .header { border-bottom: 3px solid #8b0000; padding-bottom: 10px; margin-bottom: 14px; display:flex; justify-content:space-between; align-items:flex-end; }
  .header h1 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #8b0000; }
  .header .sub { font-size: 9px; color: #666; margin-top: 3px; }
  .header .meta { text-align: right; font-size: 8px; color: #555; line-height: 1.6; }

  .kpi-row { display: flex; gap: 8px; margin-bottom: 14px; }
  .kpi { flex: 1; border: 1px solid #ddd; padding: 8px 10px; border-radius: 3px; text-align: center; }
  .kpi .lbl { font-size: 7px; text-transform: uppercase; color: #777; font-weight: bold; margin-bottom: 4px; display: block; }
  .kpi .val { font-size: 13px; font-weight: bold; font-family: monospace; display:block; }
  .kpi-dark { background: #111; color: #fff; border-color: #111; }
  .kpi-dark .lbl { color: #ccc; }
  .kpi-acc  { background: #2c3e50; color: #fff; border-color: #2c3e50; }
  .kpi-acc .lbl  { color: #ccc; }
  .kpi-gain { background: #eafaf1; border-color: #27ae60; }
  .kpi-loss { background: #fdf2f2; border-color: #8b0000; }

  h3 { font-size: 10px; text-transform: uppercase; font-weight: bold; background: #111; color: #fff; padding: 6px 10px; margin: 14px 0 0; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #f5f5f5; color: #555; padding: 6px 6px; text-align: center; font-size: 8px; border-bottom: 2px solid #ddd; white-space: nowrap; }
  td { padding: 5px 6px; border-bottom: 1px solid #f0f0f0; text-align: center; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:last-child td { border-bottom: none; }
  tr { page-break-inside: avoid; }
  .num { font-family: monospace; text-align: right; font-weight: bold; }
  .ok  { color: #27ae60; font-weight: bold; }
  .warn{ color: #e67e22; font-weight: bold; }
  .bad { color: #8b0000; font-weight: bold; background: #fff5f5; }
  .empty { text-align: center; color: #bbb; font-style: italic; padding: 12px; }

  .footer { margin-top: 18px; border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 8px; color: #555; }
  .firma-box { text-align: center; }
  .firma-line { border-bottom: 1px solid #999; width: 200px; margin: 0 auto 4px; height: 22px; }
</style>
</head><body>

<div class="header">
  <div>
    <h1>Auditoría de Mermas — ${EMPRESA}</h1>
    <div class="sub">Control de Mermas en Expedición &nbsp;|&nbsp; Generado: ${fechaHoy}</div>
  </div>
  <div class="meta">
    Registros totales: ${datos.entradas.length} entrada${datos.entradas.length !== 1 ? 's' : ''} &nbsp;|&nbsp; ${datos.salidas.length} salida${datos.salidas.length !== 1 ? 's' : ''}<br>
    Merma por defecto: ${def} %
  </div>
</div>

<div class="kpi-row">
  <div class="kpi"><span class="lbl">Tomate Stock Bruto</span><span class="val">${fmt(kpis.tBruto)} kg</span></div>
  <div class="kpi"><span class="lbl">Tomate Consumido</span><span class="val">${fmt(kpis.tConsumo)} kg</span></div>
  <div class="kpi ${kpis.balance < 0 ? 'kpi-loss' : 'kpi-gain'}"><span class="lbl">Balance Inventario</span><span class="val" style="color:${balColor}">${balSign}${fmt(kpis.balance)} kg</span></div>
  <div class="kpi"><span class="lbl">Desperdicio Total</span><span class="val" style="color:#aaa">${fmt(kpis.tBasura)} kg</span></div>
  <div class="kpi kpi-dark"><span class="lbl">Total Gazpacho</span><span class="val">${fmt(kpis.vGaz)} L</span></div>
  <div class="kpi kpi-acc"><span class="lbl">Total Salmorejo</span><span class="val">${fmt(kpis.kSalm)} kg</span></div>
</div>

<h3>Recepción de Tomate Bruto</h3>
<table>
  <thead><tr><th>Fecha</th><th>Ref. / Albarán</th><th>Operador</th><th>Masa Bruta</th></tr></thead>
  <tbody>${filasE}</tbody>
</table>

<h3>Expedición de Producto Terminado</h3>
<table>
  <thead><tr>
    <th>Fecha</th><th>Tipo</th><th>Ref. / Albarán</th><th>Operador</th>
    <th>Cantidad</th><th>Merma %</th><th>Tomate cons.</th>
  </tr></thead>
  <tbody>${filasS}</tbody>
</table>

<div class="footer">
  <div>Ratio base: Gazpacho 1,5 L/kg neto &nbsp;|&nbsp; Salmorejo 1 kg/kg neto<br>Colores merma: <span style="color:#27ae60">■</span> Normal &nbsp; <span style="color:#e67e22">■</span> Elevada (&gt;${(def*1.15).toFixed(1)}%) &nbsp; <span style="color:#8b0000">■</span> Alta (&gt;${(def*1.4).toFixed(1)}%)</div>
  <div class="firma-box">
    <div class="firma-line"></div>
    <div>${FIRMA_DEF} — Responsable de Producción</div>
  </div>
</div>

</body></html>`;
}

// ── GENERAR REGISTRO HTML (tabla navegador) ───────────────────────────────────
function generarRegistroHTML(datos, kpis, fechaHoy) {
    const def = datos.merma_defecto || 20;
    const balSign = kpis.balance >= 0 ? '+' : '';

    const sortE = [...datos.entradas].sort((a,b) => parseDate(b.date) - parseDate(a.date));
    const sortS = [...datos.salidas ].sort((a,b) => parseDate(b.date) - parseDate(a.date));

    const filasE = sortE.length
        ? sortE.map((r, i) => `<tr>
            <td class="n">${i+1}</td>
            <td>${r.date}</td>
            <td>${r.ref || '—'}</td>
            <td>${r.operator || '—'}</td>
            <td class="num">${fmt(r.qty)} kg</td>
          </tr>`).join('')
        : `<tr><td colspan="5" class="empty">Sin entradas registradas</td></tr>`;

    const filasS = sortS.length
        ? sortS.map((r, i) => {
            const { merma, bruto } = calcConsumido(r, def);
            const cls = merma > def*1.4 ? 'bad' : merma > def*1.15 ? 'warn' : 'ok';
            return `<tr>
                <td class="n">${i+1}</td>
                <td>${r.date}</td>
                <td class="tipo-${r.type.toLowerCase()}">${r.type === 'GAZ' ? 'GAZPACHO' : 'SALMOREJO'}</td>
                <td>${r.ref || '—'}</td>
                <td>${r.operator || '—'}</td>
                <td class="num">${fmt(r.qty)} ${r.type === 'GAZ' ? 'L' : 'kg'}</td>
                <td class="num ${cls}">${fmt(merma)} %</td>
                <td class="num">${fmt(bruto)} kg</td>
              </tr>`;
        }).join('')
        : `<tr><td colspan="8" class="empty">Sin salidas registradas</td></tr>`;

    return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registro — ${EMPRESA}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#222;background:#f4f6f8}
  .topbar{background:#1a1a2e;color:#fff;padding:18px 28px;display:flex;justify-content:space-between;align-items:center}
  .topbar h1{font-size:20px;font-weight:700;letter-spacing:1px}
  .topbar h1 span{color:#e74c3c}
  .topbar .upd{font-size:12px;color:#aaa;text-align:right}
  .kpis{display:flex;gap:14px;padding:18px 28px;background:#fff;border-bottom:1px solid #e0e0e0;flex-wrap:wrap}
  .kpi{flex:1;min-width:120px;border:1px solid #e0e0e0;padding:14px 16px;border-radius:8px;text-align:center;background:#fff}
  .kpi .lbl{font-size:11px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:6px;display:block;letter-spacing:.5px}
  .kpi .val{font-size:22px;font-weight:700;font-family:monospace;display:block}
  .kpi-gain{background:#eafaf1;border-color:#27ae60}.kpi-gain .val{color:#27ae60}
  .kpi-loss{background:#fdf2f2;border-color:#c0392b}.kpi-loss .val{color:#c0392b}
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
  tr:last-child td{border-bottom:none}
  tfoot td{background:#f0f2f5!important;font-weight:700;border-top:2px solid #ddd;color:#333}
  .num{font-family:monospace;text-align:right;font-weight:600}
  .n{color:#bbb;font-size:11px}
  .ok{color:#27ae60;font-weight:700}.warn{color:#e67e22;font-weight:700}.bad{color:#c0392b;font-weight:700;background:#fff8f8}
  .tipo-gaz{color:#2980b9;font-weight:700;font-size:11px;letter-spacing:.5px}
  .tipo-sal{color:#8e44ad;font-weight:700;font-size:11px;letter-spacing:.5px}
  .empty{text-align:center;color:#bbb;font-style:italic;padding:20px}
  .foot{text-align:center;padding:16px;font-size:11px;color:#aaa;margin-bottom:10px}
</style>
</head><body>

<div class="topbar">
  <div>
    <h1>REGISTRO ACUMULADO &nbsp;—&nbsp; <span>${EMPRESA.toUpperCase()}</span></h1>
    <div style="font-size:12px;color:#aaa;margin-top:4px">Control de Mermas en Expedición</div>
  </div>
  <div class="upd">Última actualización:<br><strong style="color:#fff">${fechaHoy}</strong></div>
</div>

<div class="kpis">
  <div class="kpi"><span class="lbl">Tomate Stock Bruto</span><span class="val">${fmt(kpis.tBruto)} kg</span></div>
  <div class="kpi"><span class="lbl">Tomate Consumido</span><span class="val">${fmt(kpis.tConsumo)} kg</span></div>
  <div class="kpi ${kpis.balance < 0 ? 'kpi-loss' : 'kpi-gain'}"><span class="lbl">Balance Inventario</span><span class="val">${balSign}${fmt(kpis.balance)} kg</span></div>
  <div class="kpi"><span class="lbl">Desperdicio Total</span><span class="val" style="color:#aaa">${fmt(kpis.tBasura)} kg</span></div>
  <div class="kpi kpi-dark"><span class="lbl">Total Gazpacho</span><span class="val">${fmt(kpis.vGaz)} L</span></div>
  <div class="kpi kpi-slate"><span class="lbl">Total Salmorejo</span><span class="val">${fmt(kpis.kSalm)} kg</span></div>
</div>

<div class="sec">
  <div class="sec-title">Recepción de Tomate Bruto <span class="cnt">${datos.entradas.length} entradas</span></div>
  <div class="twrap"><table>
    <thead><tr><th>#</th><th>Fecha</th><th>Ref. / Albarán</th><th>Operador</th><th>Masa Bruta</th></tr></thead>
    <tbody>${filasE}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right">TOTAL RECIBIDO</td><td class="num">${fmt(kpis.tBruto)} kg</td></tr></tfoot>
  </table></div>
</div>

<div class="sec">
  <div class="sec-title">Expedición de Producto Terminado <span class="cnt">${datos.salidas.length} salidas</span></div>
  <div class="twrap"><table>
    <thead><tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Ref. / Albarán</th><th>Operador</th><th>Cantidad</th><th>Merma %</th><th>Tomate cons.</th></tr></thead>
    <tbody>${filasS}</tbody>
    <tfoot><tr><td colspan="5" style="text-align:right">TOTAL EXPEDIDO / CONSUMIDO</td><td class="num">${fmt(kpis.vGaz)} L + ${fmt(kpis.kSalm)} kg</td><td></td><td class="num">${fmt(kpis.tConsumo)} kg</td></tr></tfoot>
  </table></div>
</div>

<div class="foot">
  Colores merma: <span style="color:#27ae60">■</span> Normal &nbsp;
  <span style="color:#e67e22">■</span> Elevada (&gt;${(def*1.15).toFixed(1)}%) &nbsp;
  <span style="color:#c0392b">■</span> Alta (&gt;${(def*1.4).toFixed(1)}%) &nbsp;|&nbsp;
  Ratio: Gazpacho 1,5 L/kg neto · Salmorejo 1 kg/kg neto
</div>

</body></html>`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\n══════════════════════════════════════════════');
    console.log(`  AUTO MERMAS — ${EMPRESA}`);
    console.log('══════════════════════════════════════════════\n');

    console.log('📂 Leyendo DATOS DEL DIA.txt...');
    const hoy = leerHoy();

    if (!hoy.fecha) {
        console.error('❌ No se encontró FECHA en el archivo. Revisa el txt.');
        process.exit(1);
    }

    const fechaFmt = fmtFecha(hoy.fecha);
    console.log(`   Fecha:    ${fechaFmt}`);
    console.log(`   Operador: ${hoy.operador}`);
    console.log(`   Entradas: ${hoy.entradas.length} | Salidas: ${hoy.salidas.length}`);

    // Cargar histórico
    let datos;
    if (fs.existsSync(JSON_FILE)) {
        datos = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
    } else {
        datos = { entradas: [], salidas: [], merma_defecto: hoy.merma_defecto };
    }
    datos.merma_defecto = hoy.merma_defecto;

    // Comprobar si el día ya existe
    const yaExisteE = datos.entradas.some(r => r.date === fechaFmt);
    const yaExisteS = datos.salidas.some(r  => r.date === fechaFmt);

    if (yaExisteE || yaExisteS) {
        console.log(`\n⚠️  El día ${fechaFmt} ya existe en el histórico. Regenerando PDF sin duplicar.`);
    } else if (hoy.entradas.length === 0 && hoy.salidas.length === 0) {
        console.log('\n⚠️  No hay operaciones en el txt. Generando PDF con el histórico actual.');
    } else {
        console.log('\n📝 Añadiendo al histórico:');
        hoy.entradas.forEach(e => {
            datos.entradas.push({ date: fechaFmt, ref: e.ref, qty: e.qty, operator: FIRMA_PROVEEDOR });
            console.log(`   ✅ ENTRADA  ${fmt(e.qty)} kg  (${e.ref})`);
        });
        hoy.salidas.forEach(s => {
            const merma = (s.merma !== null && !isNaN(s.merma)) ? s.merma : hoy.merma_defecto;
            datos.salidas.push({ date: fechaFmt, type: s.type, ref: s.ref, qty: s.qty, merma, operator: hoy.operador });
            const lbl = s.type === 'GAZ' ? `${fmt(s.qty)} L Gazpacho` : `${fmt(s.qty)} kg Salmorejo`;
            console.log(`   ✅ SALIDA   ${lbl}  merma ${fmt(merma)}%  (${s.ref})`);
        });
        fs.writeFileSync(JSON_FILE, JSON.stringify(datos, null, 2), 'utf-8');
        console.log(`\n💾 Histórico guardado en ELADIO/datos_acumulados.json`);
    }

    // Calcular KPIs
    const kpis = calcKPIs(datos);

    // Crear directorio de salida si no existe
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    // Generar PDF
    const fechaHoy  = new Date().toLocaleDateString('es-ES');
    const html      = generarHTML(datos, kpis, fechaHoy);
    const nombrePDF = `Mermas_ElHortelano_${fmtArchivo(hoy.fecha)}.pdf`;
    const rutaPDF   = path.join(OUT_DIR, nombrePDF);

    console.log('\n📄 Generando PDF...');
    const browser = await chromium.launch({ headless: true });
    const page    = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.pdf({
        path:            rutaPDF,
        format:          'A4',
        landscape:       true,
        margin:          { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
        printBackground: true
    });
    await browser.close();

    // Generar REGISTRO.html
    const registroHTML = generarRegistroHTML(datos, kpis, fechaHoy);
    fs.writeFileSync(REGISTRO_FILE, registroHTML, 'utf-8');
    console.log(`\n✅ PDF generado: ${rutaPDF}`);
    console.log(`📊 Registro actualizado: ${REGISTRO_FILE}`);
    console.log('\n── RESUMEN ACUMULADO ─────────────────────────────────────────');
    console.log(`   Stock bruto:     ${fmt(kpis.tBruto)} kg`);
    console.log(`   Consumido:       ${fmt(kpis.tConsumo)} kg`);
    console.log(`   Balance:         ${kpis.balance >= 0 ? '+' : ''}${fmt(kpis.balance)} kg ${kpis.balance < 0 ? '⚠️' : '✅'}`);
    console.log(`   Gazpacho total:  ${fmt(kpis.vGaz)} L`);
    console.log(`   Salmorejo total: ${fmt(kpis.kSalm)} kg`);
    console.log(`   Desperdicio:     ${fmt(kpis.tBasura)} kg`);
    console.log('──────────────────────────────────────────────────────────────\n');
})();
