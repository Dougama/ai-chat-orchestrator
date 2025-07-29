import { Firestore, Timestamp } from "@google-cloud/firestore";
import { ChatData } from "./interfaces";

// Firestore dinámico - se pasa desde el contexto del centro

export class ChatManager {
  /**
   * Lista los chats de un usuario con paginación
   */
  static async listUserChats(
    firestore: Firestore,
    userId: string,
    lastChatTimestamp?: string
  ) {
    console.log(
      `Buscando chats para ${userId}, empezando después de ${
        lastChatTimestamp || "el inicio"
      }`
    );
    const chatsCollection = firestore.collection("chats");
    const PAGE_SIZE = 15; // Mostraremos los chats en lotes de 15

    // Construimos la consulta base
    let query: FirebaseFirestore.Query = chatsCollection
      .where("userId", "==", userId)
      .orderBy("lastUpdatedAt", "desc"); // Siempre ordenamos por el más reciente

    // Si nos proporcionan un cursor (el timestamp del último chat visto),
    // le decimos a Firestore que empiece a buscar DESPUÉS de ese documento.
    if (lastChatTimestamp) {
      const lastTimestamp = Timestamp.fromMillis(
        parseInt(lastChatTimestamp, 10)
      );
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
  }

  /**
   * Crea un nuevo chat
   */
  static async createChat(
    firestore: Firestore,
    title: string,
    userId: string
  ): Promise<string> {
    console.log(`🔍 DEBUG ChatManager - Creating chat with userId: ${userId}`);
    const chatsCollection = firestore.collection("chats");
    const chatDoc = {
      title: title.substring(0, 40) + "...",
      userId: userId,
      createdAt: Timestamp.now(),
    };
    const chatDocRef = await chatsCollection.add(chatDoc);
    console.log(
      `🔍 DEBUG ChatManager - Chat created with ID: ${chatDocRef.id}`
    );
    return chatDocRef.id;
  }

  /**
   * Actualiza la fecha del chat
   */
  static async updateChatTimestamp(
    firestore: Firestore,
    chatId: string
  ): Promise<void> {
    const chatsCollection = firestore.collection("chats");
    await chatsCollection
      .doc(chatId)
      .update({ lastUpdatedAt: Timestamp.now() });
  }

  /**
   * Elimina un chat y todos sus mensajes (con validación de ownership)
   */
  static async deleteUserChat(
    firestore: Firestore,
    chatId: string,
    userId?: string
  ): Promise<void> {
    console.log(`Eliminando chat con ID: ${chatId} para usuario: ${userId}`);

    const chatDocRef = firestore.collection("chats").doc(chatId);

    // Si se proporciona userId, validar ownership
    if (userId) {
      const chatDoc = await chatDocRef.get();
      if (!chatDoc.exists) {
        throw new Error(`Chat ${chatId} no existe`);
      }

      const chatData = chatDoc.data();
      if (chatData?.userId !== userId) {
        throw new Error(
          `Usuario ${userId} no tiene permisos para eliminar el chat ${chatId}`
        );
      }
    }

    // Primero, eliminar la subcolección de mensajes
    await this.deleteCollection(firestore, `chats/${chatId}/messages`, 50);
    // Luego, eliminar el documento principal del chat
    await chatDocRef.delete();
    console.log(`✅ Chat ${chatId} eliminado correctamente`);
  }

  /**
   * Helper para eliminar colecciones en lotes
   */
  private static async deleteCollection(
    firestore: Firestore,
    collectionPath: string,
    batchSize: number
  ) {
    const collectionRef = firestore.collection(collectionPath);
    const query = collectionRef.limit(batchSize);

    return new Promise((resolve, reject) => {
      this.deleteQueryBatch(firestore, query, resolve).catch(reject);
    });
  }

  private static async deleteQueryBatch(
    firestore: Firestore,
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
      this.deleteQueryBatch(firestore, query, resolve);
    });
  }
}
