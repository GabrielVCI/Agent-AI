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
    // Base "sombra" desechable que Prisma usa para reproducir el historial de
    // migraciones (`migrate diff --from-migrations`, `migrate dev`). Prisma la
    // vacía cada vez: NUNCA apuntarla a una base con datos.
    // Opcional: si SHADOW_DATABASE_URL no está definida, el comportamiento es
    // idéntico al de antes.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
