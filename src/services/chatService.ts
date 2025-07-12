import { ChatMessage } from "../types";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import { aiGenerateContent } from "./genaiService";
import { searchSimilarEmbeddingsVector } from "../lib/process-query";

const firestore = new Firestore();

interface ChatRequest {
  prompt: string;
  chatId?: string;
}

const buildAugmentedPrompt = (
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
    Eres un asistente de reparto muy compañerista que ayuda a los usuarios a responder preguntas basadas en un contexto dado.
    Tu objetivo es proporcionar respuestas precisas y útiles basadas en la información proporcionada
    en el CONTEXTO_DATOS y el HISTORIAL_CONVERSACION.
    Responde de manera clara y concisa, evitando suposiciones innecesarias.
    Eres amable, tratas con compañeros que tienen dudas tecnicas pero probablemente poco conocimiento y preparacion profesional
    Explicales las cosas de manera sencilla y directa.
    Si no tienes suficiente información para responder, indica que no puedes ayudar con esa pregunta.
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
    Basándote en el HISTORIAL y el CONTEXTO, y las INSTRUCCIONES responde a la siguiente pregunta:
    ${prompt}
    </PREGUNTA_USUARIO>
  `;
};

interface ChatRequest {
  prompt: string;
  history: ChatMessage[];
  chatId?: string;
}

export const handleChatPrompt = async (
  request: ChatRequest
): Promise<ChatMessage & { chatId: string }> => {
  console.log(
    `Recibido prompt: "${request.prompt}", para el chat ID: ${
      request.chatId || "Nuevo Chat"
    }`
  );

  let chatId = request.chatId;
  const chatsCollection = firestore.collection("chats");

  // 1. Si no hay chatId, creamos una nueva conversación
  if (!chatId) {
    const chatDocRef = await chatsCollection.add({
      title: request.prompt.substring(0, 40) + "...",
      createdAt: Timestamp.now(),
    });
    chatId = chatDocRef.id;
    console.log(`Nuevo chat creado con ID: ${chatId}`);
  }

  const messagesCollection = chatsCollection.doc(chatId).collection("messages");

  // 2. Guardamos el nuevo mensaje del usuario
  const userMessageData = {
    role: "user" as const,
    content: request.prompt,
    timestamp: Timestamp.now(),
  };
  await messagesCollection.add(userMessageData);

  // 3. Recuperamos el historial reciente para el contexto
  const historySnapshot = await messagesCollection
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();
  const history = historySnapshot.docs
    .map((doc) => doc.data() as ChatMessage)
    .reverse();
  // 4. Ejecutamos el pipeline de RAG

  const similarChunks = await searchSimilarEmbeddingsVector(request.prompt);
  const augmentedPrompt = buildAugmentedPrompt(
    request.prompt,
    history,
    similarChunks
  );

  const assistantText = await aiGenerateContent(augmentedPrompt);

  // 5. Guardamos la respuesta del asistente
  const assistantMessageData = {
    role: "assistant" as const,
    content: assistantText,
    timestamp: Timestamp.now(),
  };
  const assistantDocRef = await messagesCollection.add(assistantMessageData);

  // 6. Actualizamos la fecha del chat y devolvemos la respuesta
  await chatsCollection.doc(chatId).update({ lastUpdatedAt: Timestamp.now() });

  return {
    id: assistantDocRef.id,
    role: "assistant",
    content: assistantText,
    timestamp: new Date(),
    chatId: chatId,
  };
};

// en chatService.ts

// La función ahora acepta un cursor opcional
export const listUserChats = async (
  userId: string,
  lastChatTimestamp?: string
) => {
  console.log(
    `Buscando chats para ${userId}, empezando después de ${
      lastChatTimestamp || "el inicio"
    }`
  );
  const chatsCollection = firestore.collection("chats");
  const PAGE_SIZE = 15; // Mostraremos los chats en lotes de 15

  // Construimos la consulta base
  let query: FirebaseFirestore.Query = chatsCollection
    // TODO: Descomentar cuando la autenticación esté implementada
    // .where('userId', '==', userId)
    .orderBy("lastUpdatedAt", "desc"); // Siempre ordenamos por el más reciente

  // Si nos proporcionan un cursor (el timestamp del último chat visto),
  // le decimos a Firestore que empiece a buscar DESPUÉS de ese documento.
  if (lastChatTimestamp) {
    const lastTimestamp = Timestamp.fromMillis(parseInt(lastChatTimestamp, 10));
    query = query.startAfter(lastTimestamp);
  }

  // Limitamos el resultado al tamaño de nuestra página
  const snapshot = await query.limit(PAGE_SIZE).get();

  if (snapshot.empty) {
    return [];
  }

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

// Nueva función para obtener mensajes
export const getMessagesForChat = async (chatId: string) => {
  console.log(`Obteniendo mensajes para el chat: ${chatId}`);
  const messagesCollection = firestore
    .collection("chats")
    .doc(chatId)
    .collection("messages");
  const snapshot = await messagesCollection.orderBy("timestamp", "asc").get();

  if (snapshot.empty) {
    return [];
  }

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};
// Añade esta función en chatService.ts
async function deleteCollection(collectionPath: string, batchSize: number) {
  const collectionRef = firestore.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(
  query: FirebaseFirestore.Query,
  resolve: (value?: unknown) => void
) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = firestore.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}

export const deleteUserChat = async (chatId: string): Promise<void> => {
  console.log(`Eliminando chat con ID: ${chatId}`);
  const chatDocRef = firestore.collection("chats").doc(chatId);
  // Primero, eliminar la subcolección de mensajes
  await deleteCollection(`chats/${chatId}/messages`, 50);
  // Luego, eliminar el documento principal del chat
  await chatDocRef.delete();
};

//     <INSTRUCCIONES>
//   Solo si te preguntan como te llamas responderas un mensaje con tu nombre: "Tracko".
//  Si la pregunta es sobre un tema que no conoces, responde de forma educada y profesional, indicando que no tienes información suficiente
//      o relevante para responder.
//   Si no tienes o no encuentras informacion suficiente o relevante, La sintesis a la respuesta debe ser
//      "Según la informacion que tengo disponible sobre: <Tema en cuestion>", no digas "En los DATOS" ni sus nombres.
//   Estas posiblemente conversando con operarios con poca preparacion academica, por lo que debes explicamer de forma sencilla tipo para dummies.
//   Muestrate siempre amable como un compañero de trabajo, muy amable, y profesional.
//   Entre dudas puedes indicarle que los puedes ayudar con cualquier pregunta sobre procesos de ruta y reparto. No siempre solo cuando lo consideres.
//   </INSTRUCCIONES>
//   <HISTORIAL_CONVERSACION>
