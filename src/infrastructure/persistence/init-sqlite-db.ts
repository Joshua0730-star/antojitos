// src/infrastructure/persistence/init-sqlite-db.ts
/*********************************************************************
 *  Inicializa la base de datos SQLite usada por el proyecto.
 *  Crea la carpeta ./data si no existe y genera la tabla `conversations`
 *  con la estructura necesaria para la coexistencia.
 *********************************************************************/

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// Ruta configurada en .env (DEFAULT ./data/antojitos.db)
const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/antojitos.db');

// Garantizar que la carpeta ./data exista
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁  Created data directory:', dataDir);
}

export function initializeSqliteSchema(): void {
  // Conectar / crear la base de datos
  const db = new Database(dbPath);

  // Crear tabla si no existe
  db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    phoneNumber            TEXT    PRIMARY KEY,
    messages               TEXT,   -- JSON stringified array de ChatMessage
    currentStep            INTEGER NOT NULL DEFAULT 1,
    currentOrderId         TEXT,
    coexistenceStatus     TEXT    NOT NULL DEFAULT 'BOT_ACTIVE',
    lastHumanInteraction   TEXT,   -- ISO string o NULL
    humanTakeoverStartedAt TEXT,   -- ISO string o NULL
    humanPauseUntil        TEXT,   -- ISO string o NULL
    botPausedIndefinitely  BOOLEAN NOT NULL DEFAULT 0,
    updatedAt              TEXT    NOT NULL
  );
`);
  try { db.exec('ALTER TABLE conversations ADD COLUMN humanPauseUntil TEXT'); } catch { /* columna ya existe */ }
  try { db.exec('ALTER TABLE conversations ADD COLUMN humanTakeoverStartedAt TEXT'); } catch { /* columna ya existe */ }

  console.log('✅  SQLite DB ready at', dbPath);
  db.close();
}

