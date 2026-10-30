import { closePostgresPool, initializePostgresSchema } from './PostgresDatabase.js';

try {
  await initializePostgresSchema();
  console.log('Esquema PostgreSQL listo.');
} finally {
  await closePostgresPool();
}
