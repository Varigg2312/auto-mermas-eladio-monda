#!/usr/bin/env node
'use strict';

const path   = require('path');
const fs     = require('fs');
const yargs  = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk  = require('chalk');

const { getDb, getCliente, withTransaction } = require('./src/db/database');
const { parsearTxt }             = require('./src/parsers/txt-parser');
const { diarioSchema }           = require('./src/validators/schema');
const { calcularKPIs }           = require('./src/calculators/mermas');
const { generarPDF }             = require('./src/generators/pdf-generator');
const { generarRegistroHTML }    = require('./src/generators/html-generator');

// ── Configuración por cliente ─────────────────────────────────────────────────
const CLIENTES = {
    eladio: {
        slug:             'eladio',
        nombre:           'El Hortelano',
        nombre_expedidor: 'Alimentos El Hortelano',
        merma_defecto:    5,
        operador_entradas: 'Frutas Y Verduras Eladio',
        operador_salidas:  'Alimentos El Hortelano',
        pdf_dir:          'C:\\Users\\User\\Desktop\\Hortelano\\INFORMES MERMAS',
        pdf_prefix:       'Mermas_ElHortelano',
        txt:              path.join(__dirname, 'clientes', 'eladio', 'DATOS DEL DIA.txt'),
        registro_html:    path.join(__dirname, 'registro', 'eladio.html'),
    },
    monda: {
        slug:             'monda',
        nombre:           'Monda Gazpacho',
        nombre_expedidor: 'Alimentos El Hortelano',
        merma_defecto:    5,
        operador_entradas: 'Juan Gonzalez Agua',
        operador_salidas:  'Alimentos El Hortelano',
        pdf_dir:          'C:\\Users\\User\\Desktop\\Hortelano\\INFORMES MERMAS',
        pdf_prefix:       'Mermas_MondaGazpacho',
        txt:              path.join(__dirname, 'clientes', 'monda', 'DATOS DEL DIA.txt'),
        registro_html:    path.join(__dirname, 'registro', 'monda.html'),
    },
};

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = yargs(hideBin(process.argv))
    .usage('Uso: node generar_informe.js --cliente <eladio|monda> [--archivo ruta.txt]')
    .option('cliente', {
        alias:    'c',
        type:     'string',
        choices:  ['eladio', 'monda'],
        demandOption: true,
        describe: 'Cliente para el que generar el informe',
    })
    .option('archivo', {
        alias:  'f',
        type:   'string',
        describe: 'Ruta al archivo DATOS DEL DIA.txt (por defecto usa la ruta del cliente)',
    })
    .help()
    .argv;

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const cfg = CLIENTES[argv.cliente];
    if (!cfg) {
        console.error(chalk.red(`Cliente desconocido: ${argv.cliente}`));
        process.exit(1);
    }

    const rutaTxt = argv.archivo ? path.resolve(argv.archivo) : cfg.txt;

    console.log(chalk.bold(`\n── Generando informe para ${chalk.yellow(cfg.nombre)} ──`));
    console.log(chalk.gray(`Leyendo: ${rutaTxt}`));

    // 1. Parsear TXT
    let raw;
    try {
        raw = parsearTxt(rutaTxt);
    } catch (err) {
        console.error(chalk.red(`Error leyendo el archivo:\n  ${err.message}`));
        process.exit(1);
    }

    // 2. Validar con Zod
    const resultado = diarioSchema.safeParse(raw);
    if (!resultado.success) {
        console.error(chalk.red('Datos inválidos en el parte:'));
        for (const issue of resultado.error.issues) {
            console.error(chalk.red(`  • ${issue.path.join('.')}: ${issue.message}`));
        }
        process.exit(1);
    }
    const datos = resultado.data;
    console.log(chalk.green(`✓ Parte del ${chalk.bold(datos.fecha)} validado`));

    // 3. Conectar a SQLite
    const db       = getDb();
    const clienteDb = getCliente(db, cfg.slug);

    // 4. Verificar duplicados (misma fecha ya registrada hoy)
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
        const duplicados = [
            yaEntrada   && 'entrada de tomate',
            yaSalidaGaz && 'salida de gazpacho',
            yaSalidaSal && 'salida de salmorejo',
        ].filter(Boolean).join(', ');
        console.error(chalk.yellow(`⚠ Ya existe un registro para el ${datos.fecha} (${duplicados}). Operación cancelada.`));
        process.exit(1);
    }

    // 5. Insertar en DB con transacción ACID
    withTransaction(db, () => {
        if (datos.entrada) {
            db.prepare(`
                INSERT INTO entradas (cliente_id, fecha, referencia, kilos_brutos, operador)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                clienteDb.id,
                datos.fecha,
                datos.entrada.albaran || '',
                datos.entrada.kilos_recibidos,
                cfg.operador_entradas,
            );
            console.log(chalk.green(`  ✓ Entrada: ${datos.entrada.kilos_recibidos} kg`));
        }

        if (datos.gazpacho) {
            const merma = datos.gazpacho.porcentaje_merma ?? cfg.merma_defecto;
            db.prepare(`
                INSERT INTO salidas (cliente_id, fecha, tipo, referencia, cantidad, porcentaje_merma, operador)
                VALUES (?, ?, 'GAZ', ?, ?, ?, ?)
            `).run(
                clienteDb.id,
                datos.fecha,
                datos.gazpacho.albaran || '',
                datos.gazpacho.litros,
                merma,
                cfg.operador_salidas,
            );
            console.log(chalk.green(`  ✓ Gazpacho: ${datos.gazpacho.litros} L (merma ${merma}%)`));
        }

        if (datos.salmorejo) {
            const merma = datos.salmorejo.porcentaje_merma ?? cfg.merma_defecto;
            db.prepare(`
                INSERT INTO salidas (cliente_id, fecha, tipo, referencia, cantidad, porcentaje_merma, operador)
                VALUES (?, ?, 'SAL', ?, ?, ?, ?)
            `).run(
                clienteDb.id,
                datos.fecha,
                datos.salmorejo.albaran || '',
                datos.salmorejo.kilos,
                merma,
                cfg.operador_salidas,
            );
            console.log(chalk.green(`  ✓ Salmorejo: ${datos.salmorejo.kilos} kg (merma ${merma}%)`));
        }
    });

    // 6. Leer todos los datos para el informe
    const entradas = db.prepare('SELECT * FROM entradas WHERE cliente_id = ? ORDER BY fecha').all(clienteDb.id);
    const salidas  = db.prepare('SELECT * FROM salidas  WHERE cliente_id = ? ORDER BY fecha').all(clienteDb.id);
    const kpis     = calcularKPIs(entradas, salidas, cfg.merma_defecto);

    console.log(chalk.bold(`\nKPIs actuales:`));
    console.log(`  Stock bruto:   ${kpis.totalBruto.toFixed(2)} kg`);
    console.log(`  Consumido:     ${kpis.totalConsumo.toFixed(2)} kg`);
    const balColor = kpis.balance >= 0 ? chalk.green : chalk.red;
    console.log(`  Balance:       ${balColor((kpis.balance >= 0 ? '+' : '') + kpis.balance.toFixed(2) + ' kg')}`);
    console.log(`  Desperdicio:   ${kpis.totalDesperdicio.toFixed(2)} kg`);

    const now = new Date();
    const fechaGeneracion = now.toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    // 7. Generar PDF
    fs.mkdirSync(cfg.pdf_dir, { recursive: true });
    const fechaPdf  = datos.fecha.replace(/\//g, '-');
    const rutaPdf   = path.join(cfg.pdf_dir, `${cfg.pdf_prefix}_${fechaPdf}.pdf`);
    const clientePdf = { ...cfg, id: clienteDb.id, merma_defecto: cfg.merma_defecto };

    try {
        await generarPDF({ cliente: clientePdf, entradas, salidas, kpis, fechaGeneracion, rutaSalida: rutaPdf });
        console.log(chalk.green(`\n✓ PDF generado: ${rutaPdf}`));
    } catch (err) {
        console.error(chalk.red(`Error generando PDF: ${err.message}`));
    }

    // 8. Generar REGISTRO.html
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
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
});
