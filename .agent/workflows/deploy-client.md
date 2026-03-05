---
description: Sincronizar cambios con el proyecto Apps Script del cliente (Donweb/Castfer)
---
# Deploy al Proyecto del Cliente

Sincroniza el código local con el proyecto de Apps Script del cliente usando su Script ID.

> [!IMPORTANT]
> Este workflow **solo pushea al proyecto del cliente**. No hace git commit/push ni afecta tu proyecto principal.
> El Script ID del cliente está hardcodeado en `.clasp-client.json`: `1Te9svmz1gbbfj6Mep3U7dlTqVnYpMg6qU6TyUMIq6btC6CndjJnQTH_B`

## Pasos

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
> Para sincronizar **ambos proyectos** (tuyo + cliente), ejecutá primero `/deploy` y luego `/deploy-client`.
