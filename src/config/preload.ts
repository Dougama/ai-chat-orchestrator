// packages/orchestrator-api/src/config/preload.ts

import dotenv from "dotenv";
import path from "path";

// Construimos la ruta al archivo .env desde la ubicación de este archivo
// Después de compilar, estará en `dist/config`, por lo que subimos 2 niveles.
const envPath = path.resolve(__dirname, "../../.env");

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error(
    "Error Crítico: No se pudo cargar el archivo .env. Asegúrate de que existe en la raíz de orchestrator-api."
  );
  console.error(result.error);
  process.exit(1); // Detenemos la ejecución si no podemos cargar la configuración
}

console.log(`✅ Variables de entorno cargadas con éxito desde: ${envPath}`);
