#!/usr/bin/env node
'use strict';
/**
 * migrate.js — Importa datos históricos de ELADIO/datos_acumulados.json
 * y MONDA/datos_acumulados.json a la base de datos SQLite.
 * Ejecución única. Si ya existen datos, aborta para evitar duplicados.
 */

const fs   = require('fs');
const path = require('path');
const { getDb, getCliente, withTransaction } = require('./src/db/database');

const FUENTES = [
    {
        slug:              'eladio',
        json:              path.join(__dirname, 'ELADIO', 'datos_acumulados.json'),
        operador_entradas: 'Frutas Y Verduras Eladio',
        operador_salidas:  'Alimentos El Hortelano',
        merma_defecto:     5,
    },
    {
        slug:              'monda',
        json:              path.join(__dirname, 'MONDA', 'datos_acumulados.json'),
        operador_entradas: 'Juan Gonzalez Agua',
        operador_salidas:  'Alimentos El Hortelano',
        merma_defecto:     5,
    },
];

function normalizarFecha(str) {
    // Acepta DD/MM/YYYY o YYYY-MM-DD y devuelve DD/MM/YYYY
    if (!str) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    }
    return str;
}

function mapTipo(tipo) {
    // El JSON antiguo puede tener 'GAZ', 'SAL', 'GAZPACHO', 'SALMOREJO'
    const t = (tipo || '').toUpperCase();
    if (t.startsWith('GAZ')) return 'GAZ';
    if (t.startsWith('SAL')) return 'SAL';
    throw new Error(`Tipo de salida desconocido: ${tipo}`);
}

const db = getDb();

for (const fuente of FUENTES) {
    console.log(`\n── Migrando ${fuente.slug.toUpperCase()} ──`);

    if (!fs.existsSync(fuente.json)) {
        console.log(`  ⚠ No encontrado: ${fuente.json} — omitiendo.`);
        continue;
    }

    const cliente = getCliente(db, fuente.slug);

    // Comprobar si ya hay datos
    const nEntradas = db.prepare('SELECT COUNT(*) as n FROM entradas WHERE cliente_id = ?').get(cliente.id).n;
    const nSalidas  = db.prepare('SELECT COUNT(*) as n FROM salidas  WHERE cliente_id = ?').get(cliente.id).n;

    if (nEntradas > 0 || nSalidas > 0) {
        console.log(`  ⚠ Ya existen datos (${nEntradas} entradas, ${nSalidas} salidas). Omitiendo ${fuente.slug}.`);
        console.log(`    Si quieres re-migrar, borra los datos primero con:`);
        console.log(`    DELETE FROM entradas WHERE cliente_id = ${cliente.id};`);
        console.log(`    DELETE FROM salidas  WHERE cliente_id = ${cliente.id};`);
        continue;
    }

    const json = JSON.parse(fs.readFileSync(fuente.json, 'utf-8'));

    let ne = 0, ns = 0;

    withTransaction(db, () => {
        for (const e of (json.entradas || [])) {
            const fecha = normalizarFecha(e.date || e.fecha);
            if (!fecha) { console.log(`  ⚠ Entrada sin fecha, omitida`); return; }

            db.prepare(`
                INSERT INTO entradas (cliente_id, fecha, referencia, kilos_brutos, operador)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                cliente.id,
                fecha,
                e.ref || e.referencia || '',
                e.qty || e.kilos_brutos,
                e.operator || e.operador || fuente.operador_entradas,
            );
            ne++;
        }

        for (const s of (json.salidas || [])) {
            const fecha = normalizarFecha(s.date || s.fecha);
            if (!fecha) { console.log(`  ⚠ Salida sin fecha, omitida`); return; }

            let tipo;
            try { tipo = mapTipo(s.type || s.tipo); }
            catch (err) { console.log(`  ⚠ ${err.message}, omitida`); return; }

            const merma = s.merma ?? s.porcentaje_merma ?? fuente.merma_defecto;

            db.prepare(`
                INSERT INTO salidas (cliente_id, fecha, tipo, referencia, cantidad, porcentaje_merma, operador)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                cliente.id,
                fecha,
                tipo,
                s.ref || s.referencia || '',
                s.qty || s.cantidad,
                merma,
                s.operator || s.operador || fuente.operador_salidas,
            );
            ns++;
        }
    });

    console.log(`  ✓ ${ne} entradas, ${ns} salidas importadas`);
}

db.close();
console.log('\n✔ Migración completada.\n');
