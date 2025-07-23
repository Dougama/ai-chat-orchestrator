import { ICenterRouter, CenterConfig, CenterRoutingResult } from "./interfaces";
import { getCenterConfig, getActiveCenters, DEFAULT_CENTER } from "./CenterConfig";
import { Firestore } from "@google-cloud/firestore";

export class CenterRouter implements ICenterRouter {
  private firestoreConnections = new Map<string, Firestore>();
  private mcpConnections = new Map<string, any>();

  /**
   * Identifica el centro basado en el request
   * Por ahora usa estrategias simples, pero puede expandirse
   */
  async identifyCenter(request: any): Promise<string> {
    // Estrategia 1: Header explícito
    if (request.headers && request.headers['x-center-id']) {
      const centerId = request.headers['x-center-id'];
      if (this.isValidCenter(centerId)) {
        return centerId;
      }
    }

    // Estrategia 2: Usuario en JWT (futuro)
    if (request.user && request.user.centerId) {
      const centerId = request.user.centerId;
      if (this.isValidCenter(centerId)) {
        return centerId;
      }
    }

    // Estrategia 3: Geolocalización por IP (futuro)
    if (request.ip) {
      const geoCenter = await this.identifyByGeolocation(request.ip);
      if (geoCenter) {
        return geoCenter;
      }
    }

    // Estrategia 4: Parámetro de query
    if (request.query && request.query.center) {
      const centerId = request.query.center;
      if (this.isValidCenter(centerId)) {
        return centerId;
      }
    }

    // Fallback al centro por defecto
    console.log(`No se pudo identificar centro, usando default: ${DEFAULT_CENTER}`);
    return DEFAULT_CENTER;
  }

  /**
   * Obtiene la configuración de un centro
   */
  async getCenter(centerId: string): Promise<CenterConfig> {
    return getCenterConfig(centerId);
  }

  /**
   * Realiza el routing a un centro específico
   */
  async routeToCenter(centerId: string): Promise<CenterRoutingResult> {
    const center = await this.getCenter(centerId);
    
    // Verificar estado del centro
    if (center.status !== "active") {
      throw new Error(`Centro ${centerId} no está activo: ${center.status}`);
    }

    // Obtener o crear conexión Firestore
    const firestoreConnection = await this.getFirestoreConnection(center);
    
    // Obtener conexión MCP (opcional)
    let mcpConnection = null;
    if (center.mcp.isEnabled) {
      try {
        mcpConnection = await this.getMCPConnection(center);
      } catch (error) {
        console.warn(`Error conectando a MCP ${centerId}:`, error);
        if (!center.mcp.fallbackEnabled) {
          throw error;
        }
      }
    }

    return {
      center,
      firestoreConnection,
      mcpConnection,
      fallbackAvailable: center.mcp.fallbackEnabled,
    };
  }

  /**
   * Obtiene el estado de un centro
   */
  async getCenterStatus(centerId: string): Promise<"active" | "maintenance" | "offline"> {
    try {
      const center = await this.getCenter(centerId);
      
      // Verificar conectividad Firestore
      const firestore = await this.getFirestoreConnection(center);
      await firestore.collection("_health").limit(1).get();
      
      // Verificar conectividad MCP (opcional)
      if (center.mcp.isEnabled) {
        try {
          await this.getMCPConnection(center);
        } catch (error) {
          console.warn(`MCP ${centerId} no disponible:`, error);
          // No es crítico si MCP falla
        }
      }
      
      return center.status;
    } catch (error) {
      console.error(`Error verificando estado ${centerId}:`, error);
      return "offline";
    }
  }

  /**
   * Helpers privados
   */
  private isValidCenter(centerId: string): boolean {
    try {
      getCenterConfig(centerId);
      return true;
    } catch {
      return false;
    }
  }

  private async identifyByGeolocation(ip: string): Promise<string | null> {
    // TODO: Implementar geolocalización
    // Por ahora retorna null
    return null;
  }

  private async getFirestoreConnection(center: CenterConfig): Promise<Firestore> {
    const key = center.id;
    
    if (!this.firestoreConnections.has(key)) {
      const firestoreConfig: any = {
        projectId: center.gcpProject.projectId,
      };
      
      // Solo agregar keyFilename si está definido
      if (center.gcpProject.serviceAccountPath) {
        firestoreConfig.keyFilename = center.gcpProject.serviceAccountPath;
      }
      
      const firestore = new Firestore(firestoreConfig);
      this.firestoreConnections.set(key, firestore);
    }
    
    return this.firestoreConnections.get(key)!;
  }

  private async getMCPConnection(center: CenterConfig): Promise<any> {
    const key = center.id;
    
    if (!this.mcpConnections.has(key)) {
      // TODO: Implementar conexión MCP real
      // Por ahora retorna mock
      const mcpConnection = {
        url: center.mcp.serverUrl,
        isConnected: true,
        tools: [],
      };
      
      this.mcpConnections.set(key, mcpConnection);
    }
    
    return this.mcpConnections.get(key)!;
  }
}