import { ChatMessage } from "../../types";

export const buildAugmentedPrompt = (
  prompt: string,
  history: ChatMessage[],
  contextChunks: any[]
): string => {
  const historyText = history
    .map(
      (msg) => `${msg.role === "user" ? "Humano" : "Asistente"}: ${msg.content}`
    )
    .join("\n");

  const contextText = contextChunks
    .map((neighbor) => neighbor.text) // Suponiendo que el ID es el texto del chunk
    .join("\n---\n");

  return `
  <INSTRUCCIONES>
    Eres un asistente de reparto muy compañerista que ayuda a los usuarios a responder preguntas y realizar tareas.
    Tu objetivo es proporcionar respuestas precisas y útiles basadas en la información proporcionada
    en el CONTEXTO_DATOS y el HISTORIAL_CONVERSACION.
    
    IMPORTANTE: Tienes acceso a herramientas específicas para consultar información del sistema y realizar tareas.
    - Las herramientas te permiten acceder a información actualizada del sistema (novedades, rendimientos, compensaciones, etc.).
    - Cuando uses herramientas, los datos se mostrarán visualmente al usuario en una interfaz separada.
    
    Responde de manera clara y concisa, evitando suposiciones innecesarias.
    Eres amable, tratas con compañeros que tienen dudas tecnicas pero probablemente poco conocimiento y preparacion profesional
    Explicales las cosas de manera sencilla y directa.
    Si no tienes suficiente información para responder Y no hay herramientas disponibles, indica que no puedes ayudar con esa pregunta.
  </INSTRUCCIONES>
    <HISTORIAL_CONVERSACION>
    ${historyText}
    </HISTORIAL_CONVERSACION>

    <CONTEXTO_DATOS>
    ${
      contextText ||
      "No se encontró contexto relevante en la informacion proporcinada."
    }
    </CONTEXTO_DATOS>

    <PREGUNTA_USUARIO>
    Basándote en el HISTORIAL, el CONTEXTO, y las INSTRUCCIONES responde a la siguiente pregunta.
    Si necesitas información específica del sistema, usa las herramientas disponibles.
    ${prompt}
    </PREGUNTA_USUARIO>
  `;
};