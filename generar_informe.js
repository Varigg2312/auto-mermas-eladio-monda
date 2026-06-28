#!/usr/bin/env node
'use strict';

const path   = require('path');
const fs     = require('fs');
const yargs  = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk  = require('chalk');

const { getDb, getCliente, withTransaction } = require('./src/db/database');
const { diarioSchema }         = require('./src/validators/schema');
const { calcularKPIs }         = require('./src/calculators/mermas');
const { generarPDF }           = require('./src/generators/pdf-generator');
const { generarRegistroHTML }  = require('./src/generators/html-generator');

// ── Configuración por cliente ─────────────────────────────────────────────────
const CLIENTES = {
    eladio: {
        slug:              'eladio',
        nombre:            'El Hortelano',
        nombre_expedidor:  'Alimentos El Hortelano',
        merma_defecto:     5,
        operador_entradas: 'Frutas Y Verduras Eladio',
        operador_salidas:  'Alimentos El Hortelano',
        pdf_dir:           'C:\\Users\\User\\Desktop\\Hortelano\\INFORMES MERMAS',
        pdf_prefix:        'Mermas_ElHortelano',
        registro_html:     path.join(__dirname, 'registro', 'eladio.html'),
    },
    monda: {
        slug:              'monda',
        nombre:            'Monda Gazpacho',
        nombre_expedidor:  'Alimentos El Hortelano',
        merma_defecto:     5,
        operador_entradas: 'Juan Gonzalez Agua',
        operador_salidas:  'Alimentos El Hortelano',
        pdf_dir:           'C:\\Users\\User\\Desktop\\Hortelano\\INFORMES MERMAS',
        pdf_prefix:        'Mermas_MondaGazpacho',
        registro_html:     path.join(__dirname, 'registro', 'monda.html'),
    },
};

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = yargs(hideBin(process.argv))
    .usage('Uso: node generar_informe.js --cliente <eladio|monda> [opciones de datos]')
    .option('cliente', {
        alias: 'c', type: 'string', choices: ['eladio', 'monda'],
        demandOption: true, describe: 'Cliente',
    })
    .option('fecha', {
        type: 'string', describe: 'Fecha DD/MM/YYYY (por defecto: hoy)',
    })
    // Entrada de tomate
    .option('ke', {
        alias: 'kilos-entrada', type: 'number',
        describe: 'Kilos de tomate recibidos',
    })
    .option('ae', {
        alias: 'albaran-entrada', type: 'string',
        describe: 'Nº albarán de entrada de tomate',
    })
    // Gazpacho
    .option('lg', {
        alias: 'litros-gaz', type: 'number',
        describe: 'Litros de gazpacho expedidos',
    })
    .option('ag', {
        alias: 'albaran-gaz', type: 'string',
        describe: 'Nº albarán de gazpacho',
    })
    .option('mg', {
        alias: 'merma-gaz', type: 'number',
        describe: '% de merma para gazpacho (por defecto: 5)',
    })
    // Salmorejo
    .option('ks', {
        alias: 'kilos-sal', type: 'number',
        describe: 'Kilos de salmorejo expedidos',
    })
    .option('as', {
        alias: 'albaran-sal', type: 'string',
        describe: 'Nº albarán de salmorejo',
    })
    .option('ms', {
        alias: 'merma-sal', type: 'number',
        describe: '% de merma para salmorejo (por defecto: 5)',
    })
    .example('node generar_informe.js --cliente eladio --ke 500 --ae ALB-001 --lg 750 --ag ALB-002')
    .example('node generar_informe.js --cliente monda  --lg 1200 --ag ALB-010 --mg 6')
    .help()
    .argv;

// ── Construir objeto raw desde argumentos CLI ─────────────────────────────────
function buildRaw(argv, cfg) {
    const hoy   = new Date();
    const hoySt = [
        String(hoy.getDate()).padStart(2, '0'),
        String(hoy.getMonth() + 1).padStart(2, '0'),
        hoy.getFullYear(),
    ].join('/');

    return {
        fecha:    argv.fecha || hoySt,
        operador: cfg.nombre_expedidor,
        entrada: argv.ke > 0 ? {
            kilos_recibidos: argv.ke,
            albaran:         argv.ae || '',
        } : undefined,
        gazpacho: argv.lg > 0 ? {
            litros:           argv.lg,
            albaran:          argv.ag || '',
            porcentaje_merma: argv.mg,       // undefined → Zod lo ignora → default del cliente
        } : undefined,
        salmorejo: argv.ks > 0 ? {
            kilos:            argv.ks,
            albaran:          argv.as || '',
            porcentaje_merma: argv.ms,
        } : undefined,
    };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const cfg = CLIENTES[argv.cliente];
    if (!cfg) {
        console.error(chalk.red(`Cliente desconocido: ${argv.cliente}`));
        process.exit(1);
    }

    // Verificar que hay al menos un dato
    if (!argv.ke && !argv.lg && !argv.ks) {
        console.error(chalk.red('Sin datos. Proporciona al menos --ke, --lg o --ks.'));
        console.error(chalk.gray('Ejecuta: node generar_informe.js --help'));
        process.exit(1);
    }

    console.log(chalk.bold(`\n── Generando informe para ${chalk.yellow(cfg.nombre)} ──`));

    // 1. Construir y validar con Zod
    const raw      = buildRaw(argv, cfg);
    const resultado = diarioSchema.safeParse(raw);

    if (!resultado.success) {
        console.error(chalk.red('Datos inválidos:'));
        for (const issue of resultado.error.issues) {
            console.error(chalk.red(`  • ${issue.path.join('.')}: ${issue.message}`));
        }
        process.exit(1);
    }

    const datos = resultado.data;
    console.log(chalk.green(`✓ Datos del ${chalk.bold(datos.fecha)} validados`));

    // 2. Conectar a SQLite
    const db        = getDb();
    const clienteDb = getCliente(db, cfg.slug);

    // 3. Detectar duplicados
    const yaEntrada = datos.entrada && db.prepare(
        'SELECT 1 FROM entradas WHERE cliente_id = ? AND fecha = ? LIMIT 1'
    ).get(clienteDb.id, datos.fecha);

    const yaSalidaGaz = datos.gazpacho && db.prepare(
        "SELECT 1 FROM salidas WHERE cliente_id = ? AND fecha = ? AND tipo = 'GAZ' LIMIT 1"
    ).get(clienteDb.id, datos.fecha);

    const yaSalidaSal = datos.salmorejo && db.prepare(
        "SELECT 1 FROM salidas WHERE cliente_id = ? AND fecha = ? AND tipo = 'SAL' LIMIT 1"
    ).get(clienteDb.id, datos.fecha);

    if (yaEntrada || yaSalidaGaz || yaSalidaSal) {
        const cuales = [
            yaEntrada    && 'entrada de tomate',
            yaSalidaGaz  && 'salida de gazpacho',
            yaSalidaSal  && 'salida de salmorejo',
        ].filter(Boolean).join(', ');
        console.error(chalk.yellow(`⚠ Ya existe registro para el ${datos.fecha} (${cuales}). Operación cancelada.`));
        process.exit(1);
    }

    // 4. Insertar con transacción ACID
    withTransaction(db, () => {
        if (datos.entrada) {
            db.prepare(`
                INSERT INTO entradas (cliente_id, fecha, referencia, kilos_brutos, operador)
                VALUES (?, ?, ?, ?, ?)
            `).run(clienteDb.id, datos.fecha, datos.entrada.albaran || '', datos.entrada.kilos_recibidos, cfg.operador_entradas);
            console.log(chalk.green(`  ✓ Entrada: ${datos.entrada.kilos_recibidos} kg — albarán: ${datos.entrada.albaran || '—'}`));
        }

        if (datos.gazpacho) {
            const merma = datos.gazpacho.porcentaje_merma ?? cfg.merma_defecto;
            db.prepare(`
                INSERT INTO salidas (cliente_id, fecha, tipo, referencia, cantidad, porcentaje_merma, operador)
                VALUES (?, ?, 'GAZ', ?, ?, ?, ?)
            `).run(clienteDb.id, datos.fecha, datos.gazpacho.albaran || '', datos.gazpacho.litros, merma, cfg.operador_salidas);
            console.log(chalk.green(`  ✓ Gazpacho: ${datos.gazpacho.litros} L — merma: ${merma}%`));
        }

        if (datos.salmorejo) {
            const merma = datos.salmorejo.porcentaje_merma ?? cfg.merma_defecto;
            db.prepare(`
                INSERT INTO salidas (cliente_id, fecha, tipo, referencia, cantidad, porcentaje_merma, operador)
                VALUES (?, ?, 'SAL', ?, ?, ?, ?)
            `).run(clienteDb.id, datos.fecha, datos.salmorejo.albaran || '', datos.salmorejo.kilos, merma, cfg.operador_salidas);
            console.log(chalk.green(`  ✓ Salmorejo: ${datos.salmorejo.kilos} kg — merma: ${merma}%`));
        }
    });

    // 5. KPIs globales
    const entradas = db.prepare('SELECT * FROM entradas WHERE cliente_id = ? ORDER BY fecha').all(clienteDb.id);
    const salidas  = db.prepare('SELECT * FROM salidas  WHERE cliente_id = ? ORDER BY fecha').all(clienteDb.id);
    const kpis     = calcularKPIs(entradas, salidas, cfg.merma_defecto);

    console.log(chalk.bold('\nKPIs acumulados:'));
    console.log(`  Stock bruto total: ${kpis.totalBruto.toFixed(2)} kg`);
    console.log(`  Consumido total:   ${kpis.totalConsumo.toFixed(2)} kg`);
    const balColor = kpis.balance >= 0 ? chalk.green : chalk.red;
    console.log(`  Balance:           ${balColor((kpis.balance >= 0 ? '+' : '') + kpis.balance.toFixed(2) + ' kg')}`);
    console.log(`  Desperdicio:       ${kpis.totalDesperdicio.toFixed(2)} kg`);

    const now = new Date();
    const fechaGeneracion = now.toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const clientePdf = { ...cfg, id: clienteDb.id };

    // 6. Generar PDF
    fs.mkdirSync(cfg.pdf_dir, { recursive: true });
    const fechaPdf = datos.fecha.replace(/\//g, '-');
    const rutaPdf  = path.join(cfg.pdf_dir, `${cfg.pdf_prefix}_${fechaPdf}.pdf`);

    try {
        await generarPDF({ cliente: clientePdf, entradas, salidas, kpis, fechaGeneracion, rutaSalida: rutaPdf });
        console.log(chalk.green(`\n✓ PDF: ${rutaPdf}`));
    } catch (err) {
        console.error(chalk.red(`Error generando PDF: ${err.message}`));
    }

    // 7. Actualizar REGISTRO.html
    try {
        fs.mkdirSync(path.dirname(cfg.registro_html), { recursive: true });
        generarRegistroHTML({ cliente: clientePdf, entradas, salidas, kpis, fechaGeneracion, rutaSalida: cfg.registro_html });
        console.log(chalk.green(`✓ Registro HTML: ${cfg.registro_html}`));
    } catch (err) {
        console.error(chalk.red(`Error generando HTML: ${err.message}`));
    }

    db.close();
    console.log(chalk.bold.green(`\n✔ Informe completado para ${cfg.nombre}\n`));
}

main().catch(err => {
    console.error(chalk.red(`\nError inesperado: ${err.message}`));
    process.exit(1);
});
