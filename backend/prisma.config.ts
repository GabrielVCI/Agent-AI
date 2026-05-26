import { defineConfig } from '@prisma/config'

export default defineConfig({
  datasource: {
    // Aquí sí va 'url' según la definición del tipo PrismaConfig de la v7
    url: process.env.DATABASE_URL, 
  },
})