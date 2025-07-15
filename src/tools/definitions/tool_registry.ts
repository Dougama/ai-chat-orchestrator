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
  buscar_en_protocolos_pdf: {
    type: "LOCAL",
    handlerPath: "../implementations/local/protocolSearch",
    definition: {
      name: "buscar_en_protocolos_pdf",
      description:
        "Busca información específica en los manuales de protocolos de logística.",
      parameters: {
        /* ... JSON Schema ... */
      },
    },
  },
};
