import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import {
  startAutomationWorker,
  stopAutomationWorker,
} from "./services/automation/automation-worker.js";

// Railway inyecta PORT; 0.0.0.0 para que el proxy pueda alcanzar el proceso.
const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend corriendo en http://localhost:${env.PORT}`);
});

// Worker del motor de automatizaciones (Módulo 0). Se puede apagar con
// AUTOMATION_WORKER_ENABLED=false (p. ej. para dejar una instancia dedicada).
startAutomationWorker();

async function shutdown(signal: string) {
  console.log(`\n${signal} recibido. Cerrando servidor...`);

  // Primero el worker: así no quedan jobs a medio ejecutar en PROCESSING.
  await stopAutomationWorker();

  server.close(async () => {
    await prisma.$disconnect();

    console.log("Servidor cerrado correctamente.");
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
