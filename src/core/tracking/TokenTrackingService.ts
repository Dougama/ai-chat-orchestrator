import { Firestore, Timestamp, FieldValue } from "@google-cloud/firestore";

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  operation: "generateContent" | "embedding";
  model?: string;
  trafficType?: string;
}

export interface TokenSession {
  timestamp: Timestamp;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  cost: number;
  operation: "generateContent" | "embedding";
  model?: string;
  costBreakdown?: {
    inputCost: number;
    outputCost: number;
  };
}

export interface ChatUsageData {
  chatId: string;
  totalTokens: number;
  totalCost: number;
  createdAt: Timestamp;
  lastActivity: Timestamp;
  sessions: TokenSession[];
  costBreakdown: {
    generationCost: number;
    embeddingCost: number;
  };
  tokenBreakdown: {
    generationTokens: number;
    embeddingTokens: number;
  };
}

export interface GlobalUsageData {
  totalTokens: number;
  totalCost: number;
  lastUpdated: Timestamp;
  costBreakdown: {
    generationCost: number;
    embeddingCost: number;
  };
  tokenBreakdown: {
    generationTokens: number;
    embeddingTokens: number;
  };
  monthlyBreakdown: {
    [key: string]: {
      tokens: number;
      cost: number;
      generationCost: number;
      embeddingCost: number;
      generationTokens: number;
      embeddingTokens: number;
    };
  };
}

export class TokenTrackingService {
  // Pricing para Gemini 2.0 Flash (USD por 1K tokens)
  private static readonly PRICING = {
    "gemini-2.0-flash-001": {
      input: 0.00015, // $0.15 per 1K input tokens
      output: 0.0006, // $0.60 per 1K output tokens
    },
    "text-embedding-004": {
      input: 0.0000125, // $0.0125 per 1K tokens
      output: 0, // No output tokens para embeddings
    },
  };

  /**
   * Rastrea el uso de tokens para un chat específico y actualiza conteos globales
   */
  static async trackUsage(
    firestore: Firestore,
    chatId: string,
    usage: TokenUsage
  ): Promise<void> {
    try {
      const costData = this.calculateCost(usage);

      // console.log(`TokenTrackingService: Tracking usage for chat ${chatId}:`, {
      //   tokens: usage.totalTokens,
      //   cost: costData.totalCost.toFixed(6),
      //   operation: usage.operation,
      //   inputCost: costData.inputCost.toFixed(6),
      //   outputCost: costData.outputCost.toFixed(6)
      // });

      // Actualizar conteo por chat y global en paralelo
      await Promise.all([
        this.updateChatUsage(firestore, chatId, usage, costData),
        this.updateGlobalUsage(firestore, usage, costData),
      ]);
    } catch (error) {
      console.error("TokenTrackingService: Error tracking usage:", error);
      // No fallar silenciosamente para no afectar el flujo principal
    }
  }

  /**
   * Calcula el costo basado en el uso de tokens
   */
  private static calculateCost(usage: TokenUsage): {
    totalCost: number;
    inputCost: number;
    outputCost: number;
  } {
    const model = usage.model || "gemini-2.0-flash-001";
    const pricing =
      this.PRICING[model as keyof typeof this.PRICING] ||
      this.PRICING["gemini-2.0-flash-001"];

    const inputCost = (usage.promptTokens / 1000) * pricing.input;
    const outputCost = (usage.candidatesTokens / 1000) * pricing.output;

    return {
      totalCost: inputCost + outputCost,
      inputCost,
      outputCost,
    };
  }

  /**
   * Actualiza el uso de tokens para un chat específico
   */
  private static async updateChatUsage(
    firestore: Firestore,
    chatId: string,
    usage: TokenUsage,
    costData: { totalCost: number; inputCost: number; outputCost: number }
  ): Promise<void> {
    const chatUsageRef = firestore.collection("AI").doc(chatId);

    const session: TokenSession = {
      timestamp: Timestamp.now(),
      promptTokens: usage.promptTokens,
      candidatesTokens: usage.candidatesTokens,
      totalTokens: usage.totalTokens,
      cost: costData.totalCost,
      operation: usage.operation,
      model: usage.model,
      costBreakdown: {
        inputCost: costData.inputCost,
        outputCost: costData.outputCost,
      },
    };

    await firestore.runTransaction(async (transaction) => {
      const chatDoc = await transaction.get(chatUsageRef);

      if (chatDoc.exists) {
        const existingData = chatDoc.data() as ChatUsageData;

        // Calcular incrementos por tipo de operación
        const isGeneration = usage.operation === "generateContent";
        const generationCostIncrement = isGeneration ? costData.totalCost : 0;
        const embeddingCostIncrement = isGeneration ? 0 : costData.totalCost;
        const generationTokensIncrement = isGeneration ? usage.totalTokens : 0;
        const embeddingTokensIncrement = isGeneration ? 0 : usage.totalTokens;

        // Actualizar documento existente
        transaction.update(chatUsageRef, {
          totalTokens: FieldValue.increment(usage.totalTokens),
          totalCost: FieldValue.increment(costData.totalCost),
          lastActivity: Timestamp.now(),
          sessions: FieldValue.arrayUnion(session),
          "costBreakdown.generationCost": FieldValue.increment(
            generationCostIncrement
          ),
          "costBreakdown.embeddingCost": FieldValue.increment(
            embeddingCostIncrement
          ),
          "tokenBreakdown.generationTokens": FieldValue.increment(
            generationTokensIncrement
          ),
          "tokenBreakdown.embeddingTokens": FieldValue.increment(
            embeddingTokensIncrement
          ),
        });
      } else {
        // Crear nuevo documento
        const isGeneration = usage.operation === "generateContent";
        const newChatUsage: ChatUsageData = {
          chatId: chatId,
          totalTokens: usage.totalTokens,
          totalCost: costData.totalCost,
          createdAt: Timestamp.now(),
          lastActivity: Timestamp.now(),
          sessions: [session],
          costBreakdown: {
            generationCost: isGeneration ? costData.totalCost : 0,
            embeddingCost: isGeneration ? 0 : costData.totalCost,
          },
          tokenBreakdown: {
            generationTokens: isGeneration ? usage.totalTokens : 0,
            embeddingTokens: isGeneration ? 0 : usage.totalTokens,
          },
        };
        transaction.set(chatUsageRef, newChatUsage);
      }
    });
  }

  /**
   * Actualiza el uso global de tokens
   */
  private static async updateGlobalUsage(
    firestore: Firestore,
    usage: TokenUsage,
    costData: { totalCost: number; inputCost: number; outputCost: number }
  ): Promise<void> {
    const globalUsageRef = firestore.collection("AI").doc("global");
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    await firestore.runTransaction(async (transaction) => {
      const globalDoc = await transaction.get(globalUsageRef);

      const isGeneration = usage.operation === "generateContent";
      const generationCostIncrement = isGeneration ? costData.totalCost : 0;
      const embeddingCostIncrement = isGeneration ? 0 : costData.totalCost;
      const generationTokensIncrement = isGeneration ? usage.totalTokens : 0;
      const embeddingTokensIncrement = isGeneration ? 0 : usage.totalTokens;

      if (globalDoc.exists) {
        const data = globalDoc.data() as GlobalUsageData;
        const monthlyBreakdown = data.monthlyBreakdown || {};

        // Actualizar breakdown mensual
        if (!monthlyBreakdown[currentMonth]) {
          monthlyBreakdown[currentMonth] = {
            tokens: 0,
            cost: 0,
            generationCost: 0,
            embeddingCost: 0,
            generationTokens: 0,
            embeddingTokens: 0,
          };
        }
        monthlyBreakdown[currentMonth].tokens += usage.totalTokens;
        monthlyBreakdown[currentMonth].cost += costData.totalCost;
        monthlyBreakdown[currentMonth].generationCost +=
          generationCostIncrement;
        monthlyBreakdown[currentMonth].embeddingCost += embeddingCostIncrement;
        monthlyBreakdown[currentMonth].generationTokens +=
          generationTokensIncrement;
        monthlyBreakdown[currentMonth].embeddingTokens +=
          embeddingTokensIncrement;

        transaction.update(globalUsageRef, {
          totalTokens: FieldValue.increment(usage.totalTokens),
          totalCost: FieldValue.increment(costData.totalCost),
          lastUpdated: Timestamp.now(),
          monthlyBreakdown: monthlyBreakdown,
          "costBreakdown.generationCost": FieldValue.increment(
            generationCostIncrement
          ),
          "costBreakdown.embeddingCost": FieldValue.increment(
            embeddingCostIncrement
          ),
          "tokenBreakdown.generationTokens": FieldValue.increment(
            generationTokensIncrement
          ),
          "tokenBreakdown.embeddingTokens": FieldValue.increment(
            embeddingTokensIncrement
          ),
        });
      } else {
        // Crear documento global inicial
        const newGlobalUsage: GlobalUsageData = {
          totalTokens: usage.totalTokens,
          totalCost: costData.totalCost,
          lastUpdated: Timestamp.now(),
          costBreakdown: {
            generationCost: generationCostIncrement,
            embeddingCost: embeddingCostIncrement,
          },
          tokenBreakdown: {
            generationTokens: generationTokensIncrement,
            embeddingTokens: embeddingTokensIncrement,
          },
          monthlyBreakdown: {
            [currentMonth]: {
              tokens: usage.totalTokens,
              cost: costData.totalCost,
              generationCost: generationCostIncrement,
              embeddingCost: embeddingCostIncrement,
              generationTokens: generationTokensIncrement,
              embeddingTokens: embeddingTokensIncrement,
            },
          },
        };
        transaction.set(globalUsageRef, newGlobalUsage);
      }
    });
  }

  /**
   * Obtiene el uso de tokens para un chat específico
   */
  static async getChatUsage(
    firestore: Firestore,
    chatId: string
  ): Promise<ChatUsageData | null> {
    try {
      const chatUsageRef = firestore.collection("AI").doc(chatId);
      const doc = await chatUsageRef.get();

      if (doc.exists) {
        return doc.data() as ChatUsageData;
      }
      return null;
    } catch (error) {
      console.error("TokenTrackingService: Error getting chat usage:", error);
      return null;
    }
  }

  /**
   * Obtiene el uso global de tokens
   */
  static async getGlobalUsage(
    firestore: Firestore
  ): Promise<GlobalUsageData | null> {
    try {
      const globalUsageRef = firestore.collection("AI").doc("global");
      const doc = await globalUsageRef.get();

      if (doc.exists) {
        return doc.data() as GlobalUsageData;
      }
      return null;
    } catch (error) {
      console.error("TokenTrackingService: Error getting global usage:", error);
      return null;
    }
  }

  /**
   * Obtiene estadísticas de uso para un periodo específico
   */
  static async getUsageStats(
    firestore: Firestore,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalChats: number;
    totalTokens: number;
    totalCost: number;
    averageTokensPerChat: number;
    averageCostPerChat: number;
  }> {
    try {
      let collection = firestore.collection("AI");

      // Filtrar por fechas si se proporcionan
      if (startDate && endDate) {
        const snapshot = await collection
          .where("lastActivity", ">=", Timestamp.fromDate(startDate))
          .where("lastActivity", "<=", Timestamp.fromDate(endDate))
          .get();
        return this.processUsageStats(snapshot);
      } else if (startDate) {
        const snapshot = await collection
          .where("lastActivity", ">=", Timestamp.fromDate(startDate))
          .get();
        return this.processUsageStats(snapshot);
      } else if (endDate) {
        const snapshot = await collection
          .where("lastActivity", "<=", Timestamp.fromDate(endDate))
          .get();
        return this.processUsageStats(snapshot);
      } else {
        const snapshot = await collection.get();
        return this.processUsageStats(snapshot);
      }
    } catch (error) {
      console.error("TokenTrackingService: Error getting usage stats:", error);
      return {
        totalChats: 0,
        totalTokens: 0,
        totalCost: 0,
        averageTokensPerChat: 0,
        averageCostPerChat: 0,
      };
    }
  }

  private static processUsageStats(snapshot: any): {
    totalChats: number;
    totalTokens: number;
    totalCost: number;
    averageTokensPerChat: number;
    averageCostPerChat: number;
  } {
    try {
      let totalChats = 0;
      let totalTokens = 0;
      let totalCost = 0;

      snapshot.docs.forEach((doc: any) => {
        if (doc.id !== "global") {
          const data = doc.data() as ChatUsageData;
          totalChats++;
          totalTokens += data.totalTokens || 0;
          totalCost += data.totalCost || 0;
        }
      });

      return {
        totalChats,
        totalTokens,
        totalCost,
        averageTokensPerChat: totalChats > 0 ? totalTokens / totalChats : 0,
        averageCostPerChat: totalChats > 0 ? totalCost / totalChats : 0,
      };
    } catch (error) {
      console.error(
        "TokenTrackingService: Error processing usage stats:",
        error
      );
      return {
        totalChats: 0,
        totalTokens: 0,
        totalCost: 0,
        averageTokensPerChat: 0,
        averageCostPerChat: 0,
      };
    }
  }
}
