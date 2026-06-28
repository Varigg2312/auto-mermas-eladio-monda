'use strict';

const RATIO_GAZPACHO = 1.5; // Litros de gazpacho por kg de tomate neto

// Dada una salida, calcula tomate bruto consumido y desperdicio
function calcularConsumo(tipo, cantidad, porcentajeMerma) {
    const neto       = tipo === 'GAZ' ? cantidad / RATIO_GAZPACHO : cantidad;
    const bruto      = neto / (1 - porcentajeMerma / 100);
    const desperdicio = bruto - neto;
    return { neto, bruto, desperdicio };
}

// KPIs globales a partir de arrays de entradas y salidas de la DB
function calcularKPIs(entradas, salidas, mermaDefecto) {
    let totalBruto      = 0;
    let totalConsumo    = 0;
    let totalDesperdicio = 0;
    let totalGazpacho   = 0;
    let totalSalmorejo  = 0;

    for (const e of entradas) {
        totalBruto += e.kilos_brutos;
    }

    for (const s of salidas) {
        const merma = s.porcentaje_merma ?? mermaDefecto;
        const { bruto, desperdicio } = calcularConsumo(s.tipo, s.cantidad, merma);
        totalConsumo     += bruto;
        totalDesperdicio += desperdicio;
        if (s.tipo === 'GAZ') totalGazpacho  += s.cantidad;
        else                  totalSalmorejo += s.cantidad;
    }

    return {
        totalBruto,
        totalConsumo,
        balance: totalBruto - totalConsumo,
        totalDesperdicio,
        totalGazpacho,
        totalSalmorejo,
    };
}

// Clasifica el porcentaje de merma en 3 niveles según umbral base
function nivelMerma(merma, defecto) {
    if (merma > defecto * 1.4)  return 'alta';
    if (merma > defecto * 1.15) return 'elevada';
    return 'normal';
}

module.exports = { calcularConsumo, calcularKPIs, nivelMerma, RATIO_GAZPACHO };
