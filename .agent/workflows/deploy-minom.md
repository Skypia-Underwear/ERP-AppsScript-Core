---
description: Sincronizar cambios con el proyecto Apps Script del cliente MINOM JEANS
---
# Deploy al Proyecto de MINOM JEANS (Nimon System)

Sincroniza el código local con el proyecto de Apps Script del cliente MINOM JEANS usando su Script ID e implementa una nueva versión web.

> [!IMPORTANT]
> Este workflow **solo pushea al proyecto del cliente MINOM JEANS**. No hace git commit/push ni afecta tu proyecto principal o el de otros clientes.
> El Script ID de MINOM JEANS está configurado en `.clasp-minom.json`: `1Lt4hlMEOwt9QqDqAUI_-i9_5yLs4oVwCuYHeWgsuxEaIxjASLG6wkk_Z`
> ID de Implementación Web (MINOM): `AKfycbzYhSY4sTRnUvPH6EcWNG89LjurVUbeWGAiUZMSdAsaHFpl7S0mjtWeQkfEnknG80A7`

## Pasos de Ejecución para el Agente

Ejecuta secuencialmente estos comandos de PowerShell en la consola del proyecto:

```powershell
# 1. Respaldar configuración original y aplicar configuración de MINOM JEANS
Copy-Item .clasp.json .clasp-backup.json
Copy-Item .clasp-minom.json .clasp.json

# 2. Desplegar cambios en la nube
clasp push --force

# 3. Generar versión e implementar en la WebApp oficial de MINOM
clasp version "Despliegue MINOM - Sincronización"
# Nota: Obtené el ID de versión retornado por el comando anterior para usarlo abajo (ej: 1)
clasp deploy -i AKfycbzYhSY4sTRnUvPH6EcWNG89LjurVUbeWGAiUZMSdAsaHFpl7S0mjtWeQkfEnknG80A7 -d "Despliegue MINOM - Sincronización"

# 4. Restaurar la configuración original de la macro
Copy-Item .clasp-backup.json .clasp.json
Remove-Item .clasp-backup.json
```

> [!WARNING]
> Si se agregan nuevos permisos (Scopes) en `appsscript.json`, debes re-autorizar manualmente desde el editor de Apps Script de MINOM (Implementar > Administrar implementaciones) para mantener el acceso "Cualquier persona".
