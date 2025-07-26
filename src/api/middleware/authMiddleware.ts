import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { getCenterConfig } from "../../core/multitenant/CenterConfig";

// Interfaz para el token decodificado con campos adicionales
interface DecodedToken extends admin.auth.DecodedIdToken {
  // Los campos adicionales ya están en DecodedIdToken
}

// Interfaz para extender Request con información de autenticación
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    projectId?: string;
    centerId?: string;
  };
}

// Mapeo de projectId a centerId
const PROJECT_TO_CENTER_MAP: Record<string, string> = {
  "backend-developer-446300": "default",
  "bavaria-412804": "cucuta",
  // Agregar más mapeos según se necesiten
};

// Mapa de instancias Firebase Admin por proyecto
const firebaseInstances: Record<string, admin.app.App> = {};

/**
 * Obtiene o crea una instancia de Firebase Admin para un proyecto específico
 */
function getFirebaseInstance(projectId: string): admin.app.App {
  if (!firebaseInstances[projectId]) {
    try {
      console.log(`Inicializando Firebase Admin para proyecto: ${projectId}`);
      
      // Crear una nueva instancia con nombre único
      firebaseInstances[projectId] = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: projectId
      }, projectId); // El segundo parámetro es el nombre único de la app
      
      console.log(`Firebase Admin SDK inicializado para proyecto: ${projectId}`);
    } catch (error) {
      console.error(`Error inicializando Firebase Admin para proyecto ${projectId}:`, error);
      throw error;
    }
  }
  
  return firebaseInstances[projectId];
}

/**
 * Extrae el projectId del token JWT decodificando su payload
 */
function extractProjectIdFromToken(token: string): string | null {
  try {
    // Decodificar el payload del JWT (segunda parte)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Token JWT inválido');
    }
    
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    
    // El projectId está en el campo 'aud' (audience)
    return payload.aud || null;
  } catch (error) {
    console.error('Error extrayendo projectId del token:', error);
    return null;
  }
}

/**
 * Middleware de autenticación Firebase
 * Valida el JWT token y extrae información del usuario
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        error: "Token de autenticación no proporcionado" 
      });
    }

    const token = authHeader.split("Bearer ")[1];
    
    try {
      // 1. Extraer projectId del token
      const projectId = extractProjectIdFromToken(token);
      if (!projectId) {
        return res.status(401).json({ 
          error: "Token inválido: no se pudo extraer projectId" 
        });
      }

      // 2. Validar que el projectId esté en nuestro mapeo
      if (!PROJECT_TO_CENTER_MAP[projectId]) {
        return res.status(401).json({ 
          error: `Proyecto no autorizado: ${projectId}` 
        });
      }

      // 3. Obtener la instancia Firebase Admin correcta para este proyecto
      const firebaseApp = getFirebaseInstance(projectId);
      
      // 4. Verificar el token con la instancia específica del proyecto
      const decodedToken = await admin.auth(firebaseApp).verifyIdToken(token) as DecodedToken;
      
      // 5. Extraer información del usuario
      const uid = decodedToken.uid;
      const email = decodedToken.email;
      
      // 6. Mapear projectId a centerId
      const centerId = PROJECT_TO_CENTER_MAP[projectId];
      
      // 7. Si hay userId en el path, validar que coincida con el token
      const pathUserId = req.params.userId;
      if (pathUserId && pathUserId !== uid && pathUserId !== "anonymous") {
        return res.status(403).json({ 
          error: "No tienes permisos para acceder a recursos de otro usuario" 
        });
      }
      
      // 8. Agregar información del usuario al request
      req.user = {
        uid,
        email,
        projectId,
        centerId
      };
      
      // 9. Si se identificó un centro desde el token, agregarlo al header
      if (centerId && !req.headers["x-center-id"]) {
        req.headers["x-center-id"] = centerId;
      }

      console.log(`✅ Autenticación exitosa: Usuario ${uid} del proyecto ${projectId} (centro: ${centerId})`);
      
      next();
    } catch (error) {
      console.error("Error verificando token:", error);
      return res.status(401).json({ 
        error: "Token inválido o expirado" 
      });
    }
  } catch (error) {
    console.error("Error en authMiddleware:", error);
    return res.status(500).json({ 
      error: "Error interno en autenticación" 
    });
  }
}

/**
 * Middleware opcional de autenticación
 * Permite requests sin autenticación pero extrae info si está presente
 */
export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  // Si no hay token, continuar sin autenticación
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  
  // Si hay token, usar el authMiddleware normal
  return authMiddleware(req, res, next);
}

/**
 * Middleware para rutas públicas que no requieren autenticación
 */
export function publicRoute(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Simplemente continuar sin validación
  next();
}