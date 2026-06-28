'use strict';
const fs = require('fs');

// Extrae el valor a la derecha del primer ':' y descarta notas inline (← ...)
function extraerValor(linea) {
    const idx = linea.indexOf(':');
    if (idx < 0) return '';
    return linea.slice(idx + 1).replace(/←.*$/, '').trim();
}

// Devuelve un objeto crudo sin validar — la validación la hace Zod en schema.js
function parsearTxt(rutaArchivo) {
    if (!fs.existsSync(rutaArchivo)) {
        throw new Error(`Archivo no encontrado: ${rutaArchivo}`);
    }

    const lineas = fs
        .readFileSync(rutaArchivo, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    const raw = {
        fecha:     null,
        operador:  null,
        entrada:   undefined,
        gazpacho:  undefined,
        salmorejo: undefined,
    };

    let seccion = null;
    let cur     = {};

    function guardarSeccion() {
        if (!seccion) return;
        const qty = cur.qty;
        if (!qty || qty <= 0) { cur = {}; return; }

        const base = { albaran: cur.albaran || '' };
        if (cur.merma !== undefined) base.porcentaje_merma = cur.merma;

        if (seccion === 'IN')  raw.entrada   = { kilos_recibidos: qty, ...base };
        if (seccion === 'GAZ') raw.gazpacho  = { litros: qty, ...base };
        if (seccion === 'SAL') raw.salmorejo = { kilos:  qty, ...base };
        cur = {};
    }

    for (const linea of lineas) {
        // Detectar secciones (sin regex: comparación de subcadena)
        if (linea.toUpperCase().includes('TOMATE RECIBIDO'))    { guardarSeccion(); seccion = 'IN';  continue; }
        if (linea.toUpperCase().includes('GAZPACHO EXPEDIDO'))  { guardarSeccion(); seccion = 'GAZ'; continue; }
        if (linea.toUpperCase().includes('SALMOREJO EXPEDIDO')) { guardarSeccion(); seccion = 'SAL'; continue; }

        // Ignorar separadores decorativos
        if (linea.startsWith('━') || linea.startsWith('▌')) continue;

        // Campos de cabecera (fuera de sección)
        const lUp = linea.toUpperCase();
        if (lUp.startsWith('FECHA DE HOY:')) { raw.fecha    = extraerValor(linea); continue; }
        if (lUp.startsWith('OPERADOR:'))     { raw.operador = extraerValor(linea); continue; }

        if (!seccion) continue;

        // Campos dentro de sección
        if (lUp.includes('KILOS RECIBIDOS:') ||
            lUp.includes('LITROS EXPEDIDOS:') ||
            lUp.includes('KILOS EXPEDIDOS:')) {
            const v = extraerValor(linea);
            cur.qty = v ? parseFloat(v) || 0 : 0;
        } else if (lUp.includes('NÚMERO DE ALBARÁN:') || lUp.includes('NUMERO DE ALBARAN:')) {
            cur.albaran = extraerValor(linea);
        } else if (lUp.includes('% DE MERMA:')) {
            const v = extraerValor(linea);
            if (v) cur.merma = parseFloat(v);
        }
    }
    guardarSeccion();

    return raw;
}

module.exports = { parsearTxt };
