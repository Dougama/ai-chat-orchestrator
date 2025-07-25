import { GoogleGenAI } from "@google/genai";
import { GoogleGenAIProvider } from "./GoogleGenAIProvider";
import { getCenterConfig } from "../multitenant/CenterConfig";

/**
 * Manager para instancias de GoogleGenAIProvider por centro
 * Cada centro tiene su propio provider configurado con su proyecto GCP
 */
export class GoogleGenAIManager {
  private static providers = new Map<string, GoogleGenAIProvider>();
  private static genAIInstances = new Map<string, GoogleGenAI>();

  /**
   * Obtiene o crea un provider para un centro específico
   * @param centerId ID del centro (default, cucuta)
   * @returns GoogleGenAIProvider configurado para el centro
   */
  static getProvider(centerId: string): GoogleGenAIProvider {
    if (!this.providers.has(centerId)) {
      const centerConfig = getCenterConfig(centerId);
      
      console.log(`GoogleGenAIManager: Creando provider para centro ${centerId}`);
      
      // Crear instancia de GoogleGenAI para este centro
      const genAI = this.getGenAIInstance(centerId);
      
      // Crear provider usando la instancia específica del centro
      const provider = new GoogleGenAIProvider(genAI, {
        centerId,
        projectId: centerConfig.gcpProject.projectId,
        location: centerConfig.gcpProject.location
      });

      this.providers.set(centerId, provider);
      console.log(`GoogleGenAIManager: ✅ Provider creado para ${centerId} (proyecto: ${centerConfig.gcpProject.projectId})`);
    }

    return this.providers.get(centerId)!;
  }

  /**
   * Obtiene o crea una instancia de GoogleGenAI para un centro
   * @param centerId ID del centro
   * @returns Instancia de GoogleGenAI
   */
  private static getGenAIInstance(centerId: string): GoogleGenAI {
    if (!this.genAIInstances.has(centerId)) {
      const centerConfig = getCenterConfig(centerId);
      
      const genAI = new GoogleGenAI({
        vertexai: true,
        project: centerConfig.gcpProject.projectId,
        location: centerConfig.gcpProject.location
        // ADC maneja la autenticación cross-project
      });

      this.genAIInstances.set(centerId, genAI);
    }

    return this.genAIInstances.get(centerId)!;
  }

  /**
   * Obtiene todas las instancias activas
   * @returns Map de providers por centerId
   */
  static getAllProviders(): Map<string, GoogleGenAIProvider> {
    return new Map(this.providers);
  }

  /**
   * Limpia un provider específico
   * @param centerId ID del centro a limpiar
   */
  static clearProvider(centerId: string): void {
    if (this.providers.has(centerId)) {
      this.providers.delete(centerId);
      this.genAIInstances.delete(centerId);
      console.log(`GoogleGenAIManager: Provider ${centerId} eliminado`);
    }
  }

  /**
   * Limpia todos los providers
   */
  static clearAllProviders(): void {
    const count = this.providers.size;
    this.providers.clear();
    this.genAIInstances.clear();
    console.log(`GoogleGenAIManager: ${count} providers eliminados`);
  }

  /**
   * Health check de los providers activos
   * @returns Record con el estado de cada centro
   */
  static async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [centerId, provider] of this.providers) {
      try {
        // Test básico: generar un embedding pequeño
        await provider.getEmbedding({ text: "health check" });
        results[centerId] = true;
      } catch (error) {
        console.error(`GoogleGenAIManager: Health check failed for ${centerId}:`, error);
        results[centerId] = false;
      }
    }
    
    return results;
  }

  /**
   * Información de configuración de todos los centros
   * @returns Información de configuración por centro
   */
  static getConfiguration(): Record<string, any> {
    const config: Record<string, any> = {};
    
    for (const [centerId] of this.providers) {
      const centerConfig = getCenterConfig(centerId);
      config[centerId] = {
        projectId: centerConfig.gcpProject.projectId,
        location: centerConfig.gcpProject.location,
        name: centerConfig.name,
        active: centerConfig.status === 'active'
      };
    }
    
    return config;
  }
}