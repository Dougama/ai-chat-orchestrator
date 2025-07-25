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

// Inicializar Firebase Admin solo una vez
let isFirebaseInitialized = false;

function initializeFirebase() {
  if (!isFirebaseInitialized) {
    try {
      // En Cloud Run, las credenciales se obtienen automáticamente
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      isFirebaseInitialized = true;
      console.log("Firebase Admin SDK inicializado correctamente");
    } catch (error) {
      console.error("Error inicializando Firebase Admin:", error);
      throw error;
    }
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
    initializeFirebase();

    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        error: "Token de autenticación no proporcionado" 
      });
    }

    const token = authHeader.split("Bearer ")[1];
    
    try {
      // Verificar el token con Firebase Admin
      const decodedToken = await admin.auth().verifyIdToken(token) as DecodedToken;
      
      // Extraer información del usuario
      const uid = decodedToken.uid;
      const email = decodedToken.email;
      const projectId = decodedToken.firebase?.tenant || process.env.GCP_PROJECT_ID || undefined;
      
      // Mapear projectId a centerId
      const centerId = projectId ? PROJECT_TO_CENTER_MAP[projectId] : undefined;
      
      // Si hay userId en el path, validar que coincida con el token
      const pathUserId = req.params.userId;
      if (pathUserId && pathUserId !== uid && pathUserId !== "anonymous") {
        return res.status(403).json({ 
          error: "No tienes permisos para acceder a recursos de otro usuario" 
        });
      }
      
      // Agregar información del usuario al request
      req.user = {
        uid,
        email,
        projectId,
        centerId
      };
      
      // Si se identificó un centro desde el token, agregarlo al header
      if (centerId && !req.headers["x-center-id"]) {
        req.headers["x-center-id"] = centerId;
      }
      
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