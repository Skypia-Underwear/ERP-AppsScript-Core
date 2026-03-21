---
description: Sincronizar cambios con el proyecto Apps Script del cliente (Donweb/Castfer)
---
# Deploy al Proyecto del Cliente

Sincroniza el código local con el proyecto de Apps Script del cliente usando su Script ID.

> [!IMPORTANT]
> Este workflow **solo pushea al proyecto del cliente**. No hace git commit/push ni afecta tu proyecto principal.
> El Script ID del cliente está hardcodeado en `.clasp-client.json`: `1Te9svmz1gbbfj6Mep3U7dlTqVnYpMg6qU6TyUMIq6btC6CndjJnQTH_B`
> ID de Implementación Web (Client): `AKfycbySMq7IZrZMhXE2wZAH-4YCLV8S-VpwjiTcKMAa1jonor7Zyjd2IdJo1EHZMs9WJahSKg`

## Pasos Técnicos para el Agente
1. Reemplazar `.clasp.json` (backup -> client).
2. Ejecutar: `clasp push`
3. Ejecutar: `clasp version "Descripcion"`
4. Ejecutar: `clasp deploy -i [ID_IMPLEMENTACION_CLIENTE] -V [VERSION] -d "[DESC]"`
5. Restaurar `.clasp.json`.

> [!WARNING]
> Si se agregan nuevos permisos (Scopes) en `appsscript.json`, el usuario debe re-autorizar manualmente desde el editor de Apps Script (Implementar > Administrar implementaciones) para mantener el acceso "Cualquier persona".

// turbo
1. Respaldar el `.clasp.json` original y reemplazarlo con el del cliente:
   `Copy-Item .clasp.json .clasp-backup.json; Copy-Item .clasp-client.json .clasp.json`
// turbo
2. Pushear al proyecto del cliente:
   `clasp push --force`
// turbo
3. Restaurar el `.clasp.json` original:
   `Copy-Item .clasp-backup.json .clasp.json; Remove-Item .clasp-backup.json`

> [!TIP]
> Para sincronizar **ambos proyectos** (tuyo + cliente) en un solo paso, usá el nuevo flujo coordinado `/deploy-all`.
