import "dotenv/config";
import { defineConfig } from '@prisma/config'

export default defineConfig({
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migraciones/db push SIEMPRE por conexión directa: PgBouncer en
    // transaction mode no soporta los locks de Prisma Migrate.
    // En dev local DIRECT_URL no existe y se usa DATABASE_URL como siempre.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
})
