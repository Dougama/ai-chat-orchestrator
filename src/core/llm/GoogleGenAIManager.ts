import { GoogleGenAI } from "@google/genai";

/**
 * Singleton Manager para GoogleGenAI instances por centro
 * Cada centro de distribución tiene su propia instancia configurada
 * con su proyecto GCP específico
 */
export class GoogleGenAIManager {
  private static instance: GoogleGenAI | null = null;

  /**
   * Obtiene la instancia única de GoogleGenAI (siempre proyecto local)
   * @param centerId ID del centro (ignorado, siempre usa proyecto local)
   * @returns Instancia de GoogleGenAI configurada para proyecto local
   */
  static getInstance(centerId?: string): GoogleGenAI {
    if (!this.instance) {
      console.log(`GoogleGenAIManager: Creando instancia única (proyecto local)`);
      
      // ✅ GoogleGenAI siempre usa proyecto local (backend-developer-446300)
      // Solo Firestore y otros servicios son cross-project
      this.instance = new GoogleGenAI({
        vertexai: true,
        project: "backend-developer-446300", // Proyecto local fijo
        location: "us-central1"
      });

      console.log(`GoogleGenAIManager: ✅ Instancia única creada (proyecto local: backend-developer-446300)`);
    }

    return this.instance;
  }

  /**
   * Limpia la instancia única (útil para testing o reconfiguración)
   */
  static clearInstance(): void {
    if (this.instance) {
      this.instance = null;
      console.log(`GoogleGenAIManager: Instancia única eliminada`);
    }
  }

  /**
   * Verifica si existe la instancia única
   * @returns true si existe la instancia
   */
  static hasInstance(): boolean {
    return this.instance !== null;
  }

  /**
   * Health check de la instancia única
   * @returns Record con el estado (siempre "local")
   */
  static async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    if (this.instance) {
      try {
        // Test básico: intentar listar modelos
        await this.instance.models.list();
        results["local"] = true;
      } catch (error) {
        console.error(`GoogleGenAIManager: Health check failed:`, error);
        results["local"] = false;
      }
    } else {
      results["local"] = false;
    }
    
    return results;
  }
}