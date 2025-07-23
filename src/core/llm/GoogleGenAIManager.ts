import { GoogleGenAI } from "@google/genai";
import { getCenterConfig } from "../multitenant/CenterConfig";

/**
 * Singleton Manager para GoogleGenAI instances por centro
 * Cada centro de distribución tiene su propia instancia configurada
 * con su proyecto GCP específico
 */
export class GoogleGenAIManager {
  private static instances = new Map<string, GoogleGenAI>();

  /**
   * Obtiene o crea una instancia de GoogleGenAI para un centro específico
   * @param centerId ID del centro (default, cucuta)
   * @returns Instancia de GoogleGenAI configurada para el centro
   */
  static getInstance(centerId: string): GoogleGenAI {
    if (!this.instances.has(centerId)) {
      const centerConfig = getCenterConfig(centerId);
      
      console.log(`GoogleGenAIManager: Creando nueva instancia para centro ${centerId}`);
      
      const aiInstance = new GoogleGenAI({
        vertexai: true,
        project: centerConfig.gcpProject.projectId,
        location: centerConfig.gcpProject.location,
        // Si el centro tiene service account específico
        ...(centerConfig.gcpProject.serviceAccountPath && {
          keyFilename: centerConfig.gcpProject.serviceAccountPath
        })
      });

      this.instances.set(centerId, aiInstance);
      console.log(`GoogleGenAIManager: ✅ Instancia creada para ${centerId} (proyecto: ${centerConfig.gcpProject.projectId})`);
    }

    return this.instances.get(centerId)!;
  }

  /**
   * Obtiene todas las instancias activas
   * @returns Map de instancias por centerId
   */
  static getAllInstances(): Map<string, GoogleGenAI> {
    return new Map(this.instances);
  }

  /**
   * Limpia una instancia específica (útil para testing o reconfiguración)
   * @param centerId ID del centro a limpiar
   */
  static clearInstance(centerId: string): void {
    if (this.instances.has(centerId)) {
      this.instances.delete(centerId);
      console.log(`GoogleGenAIManager: Instancia ${centerId} eliminada`);
    }
  }

  /**
   * Limpia todas las instancias
   */
  static clearAllInstances(): void {
    const count = this.instances.size;
    this.instances.clear();
    console.log(`GoogleGenAIManager: ${count} instancias eliminadas`);
  }

  /**
   * Verifica si existe una instancia para un centro
   * @param centerId ID del centro
   * @returns true si existe la instancia
   */
  static hasInstance(centerId: string): boolean {
    return this.instances.has(centerId);
  }

  /**
   * Health check de las instancias activas
   * @returns Record con el estado de cada centro
   */
  static async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [centerId, aiInstance] of this.instances) {
      try {
        // Test básico: intentar listar modelos
        await aiInstance.models.list();
        results[centerId] = true;
      } catch (error) {
        console.error(`GoogleGenAIManager: Health check failed for ${centerId}:`, error);
        results[centerId] = false;
      }
    }
    
    return results;
  }
}