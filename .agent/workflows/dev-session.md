---
description: Flujo de sincronización restringido solo a la Macro Principal para sesiones de desarrollo. PROHIBIDO GitHub y Cliente.
---

// turbo-all
# Flujo de Sesión de Desarrollo (Solo Macro Principal)

Este workflow está diseñado para ser usado **EXCLUSIVAMENTE** durante las sesiones de chat/desarrollo para pruebas rápidas. Garantiza que los cambios lleguen a la Macro Principal sin afectar el control de versiones (GitHub) ni la producción del cliente.

## 🔴 REGLAS CRÍTICAS (DE ESTRICTO CUMPLIMIENTO)

1.  **PROHIBIDO DESPLEGAR A GITHUB**: No ejecutes `git push` bajo ninguna circunstancia mientras este workflow esté activo. Los cambios deben permanecer locales hasta que se autorice un despliegue formal.
2.  **PROHIBIDO DESPLEGAR AL CLIENTE**: Nunca intercambies el archivo `.clasp.json` por `.clasp-client.json`. No ejecutes despliegues a la cuenta de Donweb/Castfer.
3.  **DESTINO ÚNICO**: El único comando de red permitido es el despliegue a la **Macro Principal (HostingShop)**.

## 🛠️ Pasos de Ejecución

### 1. Sincronización con Macro Principal
1. Realiza una validación ultra-rápida local sin consumo de tokens según el estándar [encoding_syntax_standard.md](file:///c:/Users/USER/OneDrive/Documents/Proyecto_Web/Macros%20HostingShop/.agent/principles/encoding_syntax_standard.md) para verificar que no haya caracteres corruptos.
2. Ejecuta el comando para empujar los cambios locales al entorno de pruebas de la Macro Principal:

```powershell
clasp push
```

### 2. Verificación de Estado
Confirma que el comando se ejecutó correctamente. Si hay errores de conflicto, avisa al usuario inmediatamente sin intentar forzar el push a menos que se indique.

> [!IMPORTANT]
> Al terminar la sesión o cuando el usuario pida un despliegue formal, deberás usar el workflow `/deploy-all` para normalizar el estado del repositorio y del cliente.
