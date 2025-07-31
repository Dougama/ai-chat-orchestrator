import { IMultiTenantManager, UserContext, CenterConfig } from "./interfaces";
import { CenterRouter } from "./CenterRouter";
import { getActiveCenters } from "./CenterConfig";

export class MultiTenantManager implements IMultiTenantManager {
  private centerRouter: CenterRouter;
  private initialized = false;

  constructor() {
    this.centerRouter = new CenterRouter();
  }

  /**
   * Inicializa las conexiones a todos los centros
   */
  async initializeCenters(): Promise<void> {
    const centers = getActiveCenters();
    
    // console.log(`Inicializando ${centers.length} centros...`);
    
    const initPromises = centers.map(async (center) => {
      try {
        await this.centerRouter.routeToCenter(center.id);
        // console.log(`✅ Centro ${center.name} inicializado`);
      } catch (error) {
        console.error(`❌ Error inicializando centro ${center.name}:`, error);
        // No fallar si un centro no está disponible
      }
    });
    
    await Promise.allSettled(initPromises);
    this.initialized = true;
    // console.log("🎉 Inicialización multi-tenant completada");
  }

  /**
   * Obtiene lista de centros disponibles
   */
  getAvailableCenters(): string[] {
    return getActiveCenters().map(center => center.id);
  }

  /**
   * Maneja un request routing al centro correcto
   */
  async handleRequest(request: any, userContext: UserContext): Promise<any> {
    if (!this.initialized) {
      throw new Error("MultiTenantManager no ha sido inicializado");
    }

    // 1. Identificar centro
    const centerId = userContext.centerId || await this.centerRouter.identifyCenter(request);
    
    // 2. Obtener routing result
    const routingResult = await this.centerRouter.routeToCenter(centerId);
    
    // 3. Verificar límites de billing
    await this.checkBillingLimits(routingResult.center, userContext);
    
    // 4. Agregar contexto al request
    request.centerContext = {
      centerId,
      center: routingResult.center,
      firestore: routingResult.firestoreConnection,
      mcp: routingResult.mcpConnection,
      fallbackAvailable: routingResult.fallbackAvailable,
    };
    
    return request;
  }

  /**
   * Health check de todos los centros
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const centers = getActiveCenters();
    const results: Record<string, boolean> = {};
    
    const healthPromises = centers.map(async (center) => {
      try {
        const status = await this.centerRouter.getCenterStatus(center.id);
        results[center.id] = status === "active";
      } catch (error) {
        console.error(`Health check failed for ${center.id}:`, error);
        results[center.id] = false;
      }
    });
    
    await Promise.allSettled(healthPromises);
    return results;
  }

  /**
   * Verificar límites de billing
   */
  private async checkBillingLimits(center: CenterConfig, userContext: UserContext): Promise<void> {
    if (!center.billing.enabled) {
      return;
    }
    
    // TODO: Implementar verificación de límites
    // - Verificar maxChatsPerDay
    // - Verificar maxTokensPerMonth
    // - Throw error si se exceden límites
    
    // console.log(`✅ Límites de billing verificados para ${center.name}`);
  }
}