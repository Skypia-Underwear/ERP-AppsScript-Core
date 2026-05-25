---
description: Sincronizar cambios con el proyecto Apps Script del cliente Castfer
---
# Deploy al Proyecto de Castfer

Sincroniza el código local con el proyecto de Apps Script del cliente Castfer usando su Script ID e implementa una nueva versión web.

> [!IMPORTANT]
> Este workflow **solo pushea al proyecto del cliente Castfer**. No hace git commit/push ni afecta tu proyecto principal.
> El Script ID de Castfer está configurado en `.clasp-castfer.json`: `1Te9svmz1gbbfj6Mep3U7dlTqVnYpMg6qU6TyUMIq6btC6CndjJnQTH_B`
> ID de Implementación Web (Castfer): `AKfycbySMq7IZrZMhXE2wZAH-4YCLV8S-VpwjiTcKMAa1jonor7Zyjd2IdJo1EHZMs9WJahSKg`

## Pasos de Ejecución para el Agente

Ejecuta secuencialmente estos comandos de PowerShell en la consola del proyecto:

```powershell
# 1. Respaldar configuración original y aplicar configuración de Castfer
Copy-Item .clasp.json .clasp-backup.json
Copy-Item .clasp-castfer.json .clasp.json

# 2. Desplegar cambios en la nube
clasp push --force

# 3. Generar versión e implementar en la WebApp oficial
clasp version "Despliegue Castfer - Sincronización"
# Nota: Obtené el ID de versión retornado por el comando anterior para usarlo abajo (ej: 42)
clasp deploy -i AKfycbySMq7IZrZMhXE2wZAH-4YCLV8S-VpwjiTcKMAa1jonor7Zyjd2IdJo1EHZMs9WJahSKg -d "Despliegue Castfer - Sincronización"

# 4. Restaurar la configuración original de la macro
Copy-Item .clasp-backup.json .clasp.json
Remove-Item .clasp-backup.json
```

> [!WARNING]
> Si se agregan nuevos permisos (Scopes) en `appsscript.json`, debes re-autorizar manualmente desde el editor de Apps Script de Castfer (Implementar > Administrar implementaciones) para mantener el acceso "Cualquier persona".
