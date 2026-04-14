# Principio: Resolución de Bloqueo de Autorización (GCP Standard)

Este documento describe la técnica de "Reseteo de Tokens" para solucionar problemas donde Apps Script no solicita permisos tras vincular un proyecto de Google Cloud Estándar.

## El Problema
Al cambiar de un proyecto de Apps Script predeterminado a uno estándar de GCP, los tokens de OAuth pueden quedar "estancados". Si el manifiesto (`appsscript.json`) tiene scopes explícitos (`oauthScopes`), Apps Script puede intentar usar credenciales antiguas que ya no son válidas para el nuevo proyecto, resultando en errores de "No cuentas con el permiso" sin mostrar la ventana de autorización.

## La Solución: Token Reset
Para forzar la aparición de la ventana de permisos de Google, sigue este procedimiento:

1.  **Configuración en GCP:**
    *   Habilitar las APIs necesarias (Drive API, BigQuery API, etc.) en la Consola de GCP.
    *   Configurar la **Pantalla de consentimiento de OAuth** en modo "En prueba" (Testing).
    *   Añadir el correo del desarrollador como **Usuario de prueba**.
2.  **Limpieza Temporal del Manifiesto:**
    *   Respaldar los `oauthScopes` actuales.
    *   Eliminar temporalmente la sección `oauthScopes` de `appsscript.json`.
    *   Realizar un `clasp push`.
3.  **Forzar Autorización:**
    *   Ejecutar cualquier función que use los servicios (ej: `DriveApp`) desde el editor de Apps Script.
    *   Google detectará la falta de scopes manuales y forzará la re-detección automática, disparando el popup de **"Se requiere autorización"**.
4.  **Restauración:**
    *   Una vez aceptados los permisos, restaurar los `oauthScopes` originales en `appsscript.json` y hacer un nuevo `clasp push`.

Este flujo garantiza que el enlace entre Apps Script y el proyecto estándar de GCP sea fresco y válido.
