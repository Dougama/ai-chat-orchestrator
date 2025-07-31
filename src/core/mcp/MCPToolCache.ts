import { IMCPToolCache, MCPTool } from './interfaces';

interface CacheEntry {
  tools: MCPTool[];
  expiry: Date;
}

export class MCPToolCache implements IMCPToolCache {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutos en milisegundos
  private cleanupInterval: NodeJS.Timeout;

  constructor(ttlMinutes: number = 5) {
    this.defaultTTL = ttlMinutes * 60 * 1000;
    
    // Configurar limpieza automática cada minuto
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Cachea herramientas para un centro específico
   */
  cacheTools(centerId: string, tools: MCPTool[]): void {
    const expiry = new Date(Date.now() + this.defaultTTL);
    
    this.cache.set(centerId, {
      tools: [...tools], // Copia defensiva
      expiry
    });
    
    console.log(`MCPToolCache: Cacheadas ${tools.length} herramientas para ${centerId}, expira: ${expiry.toISOString()}`);
  }

  /**
   * Obtiene herramientas cacheadas para un centro
   */
  getCachedTools(centerId: string): MCPTool[] | null {
    const entry = this.cache.get(centerId);
    
    if (!entry) {
      console.log(`MCPToolCache: No hay cache para ${centerId}`);
      return null;
    }
    
    // Verificar si el cache ha expirado
    if (Date.now() > entry.expiry.getTime()) {
      console.log(`MCPToolCache: Cache expirado para ${centerId}`);
      this.cache.delete(centerId);
      return null;
    }
    
    // console.log(`MCPToolCache: Cache hit para ${centerId}, ${entry.tools.length} herramientas`);
    return [...entry.tools]; // Copia defensiva
  }

  /**
   * Limpia cache para un centro específico
   */
  clearCache(centerId: string): void {
    const deleted = this.cache.delete(centerId);
    if (deleted) {
      console.log(`MCPToolCache: Cache limpiado para ${centerId}`);
    }
  }

  /**
   * Limpia todo el cache
   */
  clearAllCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`MCPToolCache: Cache completo limpiado, ${size} entradas eliminadas`);
  }

  /**
   * Obtiene estadísticas del cache
   */
  getCacheStats(): {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    centerIds: string[];
  } {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    const centerIds: string[] = [];

    this.cache.forEach((entry, centerId) => {
      centerIds.push(centerId);
      
      if (now <= entry.expiry.getTime()) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    });

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      centerIds
    };
  }

  /**
   * Verifica si un centro tiene herramientas cacheadas y válidas
   */
  hasCachedTools(centerId: string): boolean {
    const entry = this.cache.get(centerId);
    if (!entry) return false;
    
    return Date.now() <= entry.expiry.getTime();
  }

  /**
   * Extiende el TTL de un cache específico
   */
  extendCacheTTL(centerId: string, additionalMinutes: number = 5): boolean {
    const entry = this.cache.get(centerId);
    if (!entry) return false;
    
    const additionalTime = additionalMinutes * 60 * 1000;
    entry.expiry = new Date(entry.expiry.getTime() + additionalTime);
    
    console.log(`MCPToolCache: TTL extendido para ${centerId}, nueva expiración: ${entry.expiry.toISOString()}`);
    return true;
  }

  /**
   * Actualiza herramientas en cache si existe
   */
  updateCachedTools(centerId: string, tools: MCPTool[]): boolean {
    const entry = this.cache.get(centerId);
    if (!entry) return false;
    
    // Mantener la fecha de expiración original
    entry.tools = [...tools];
    
    console.log(`MCPToolCache: Herramientas actualizadas para ${centerId}, ${tools.length} herramientas`);
    return true;
  }

  /**
   * Limpia entradas expiradas del cache
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    this.cache.forEach((entry, centerId) => {
      if (now > entry.expiry.getTime()) {
        this.cache.delete(centerId);
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`MCPToolCache: Limpieza automática, ${cleanedCount} entradas expiradas eliminadas`);
    }
  }

  /**
   * Destructor para limpiar recursos
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clearAllCache();
  }
}