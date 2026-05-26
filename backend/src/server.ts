import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} recibido. Cerrando servidor...`);

  server.close(async () => {
    await prisma.$disconnect();

    console.log("Servidor cerrado correctamente.");
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));