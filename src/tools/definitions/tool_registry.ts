// import { ToolDefinition } from "shared-types"; // ¡Ventaja del Monorepo!

// Temporary interface until shared-types is available
interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
}

// Podríamos hacer que el registro sea más seguro con tipos
type ToolRegistry = {
  [toolName: string]: {
    type: "LOCAL" | "EXTERNAL_MCP";
    handlerPath: string;
    definition: ToolDefinition; // Incluimos la definición completa
  };
};

export const toolRegistry: ToolRegistry = {
  buscar_informacion_operacional: {
    type: "LOCAL",
    handlerPath: "../implementations/local/ragSearch",
    definition: {
      name: "buscar_informacion_operacional",
      description: "Busca información operacional sobre procesos, procedimientos, políticas y conocimiento técnico necesario para resolver las necesidades y consultas del usuario. Utiliza esta herramienta cuando el usuario requiera información específica sobre operaciones, procesos de trabajo, normativas o cualquier conocimiento técnico operacional.",
      parameters: {
        type: "object",
        properties: {
          consulta: {
            type: "string",
            description: "Información operacional que necesitas buscar para resolver la consulta del usuario sobre procesos, procedimientos, normativas o conocimiento técnico"
          }
        },
        required: ["consulta"]
      }
    }
  }
};
