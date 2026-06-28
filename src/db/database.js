'use strict';
const path = require('path');
const fs   = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '../../data/mermas.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db = null;

function getDb() {
    if (_db) return _db;

    _db = new DatabaseSync(DB_PATH);

    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');

    _db.exec(`
        CREATE TABLE IF NOT EXISTS clientes (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            slug              TEXT    NOT NULL UNIQUE,
            nombre            TEXT    NOT NULL,
            nombre_proveedor  TEXT    NOT NULL,
            nombre_expedidor  TEXT    NOT NULL DEFAULT 'Alimentos El Hortelano',
            merma_defecto     REAL    NOT NULL DEFAULT 5.0,
            created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    `);

    _db.exec(`
        CREATE TABLE IF NOT EXISTS entradas (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id   INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
            fecha        TEXT    NOT NULL,
            referencia   TEXT    NOT NULL DEFAULT '',
            kilos_brutos REAL    NOT NULL CHECK(kilos_brutos > 0),
            operador     TEXT    NOT NULL,
            created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    `);

    _db.exec(`
        CREATE TABLE IF NOT EXISTS salidas (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id       INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
            fecha            TEXT    NOT NULL,
            tipo             TEXT    NOT NULL CHECK(tipo IN ('GAZ','SAL')),
            referencia       TEXT    NOT NULL DEFAULT '',
            cantidad         REAL    NOT NULL CHECK(cantidad > 0),
            porcentaje_merma REAL    NOT NULL,
            operador         TEXT    NOT NULL,
            created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    `);

    _db.exec(`CREATE INDEX IF NOT EXISTS idx_entradas_cliente_fecha ON entradas(cliente_id, fecha)`);
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_salidas_cliente_fecha  ON salidas(cliente_id, fecha)`);

    // Seed clientes base
    _db.exec(`INSERT OR IGNORE INTO clientes (slug, nombre, nombre_proveedor, nombre_expedidor, merma_defecto) VALUES ('eladio', 'El Hortelano', 'Frutas Y Verduras Eladio', 'Alimentos El Hortelano', 5.0)`);
    _db.exec(`INSERT OR IGNORE INTO clientes (slug, nombre, nombre_proveedor, nombre_expedidor, merma_defecto) VALUES ('monda', 'Monda Gazpacho', 'Juan Gonzalez Agua', 'Alimentos El Hortelano', 5.0)`);

    return _db;
}

function getCliente(db, slug) {
    const cliente = db.prepare('SELECT * FROM clientes WHERE slug = ?').get(slug);
    if (!cliente) throw new Error(`Cliente no encontrado: ${slug}`);
    return cliente;
}

// Wrapper ACID: emula better-sqlite3's .transaction()
function withTransaction(db, fn) {
    db.exec('BEGIN');
    try {
        fn();
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

module.exports = { getDb, getCliente, withTransaction };
