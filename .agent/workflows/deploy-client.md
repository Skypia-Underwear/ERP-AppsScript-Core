---
description: Sincronizar cambios con el proyecto Apps Script del cliente (Donweb/Castfer)
---
# Deploy al Proyecto del Cliente

Sincroniza el código local con el proyecto de Apps Script del cliente usando su Script ID.

> [!IMPORTANT]
> Este workflow **solo pushea al proyecto del cliente**. No hace git commit/push ni afecta tu proyecto principal.

## Pasos

// turbo
1. Pushear al proyecto del cliente:
   `clasp push --force`

> [!TIP]
> Para sincronizar **ambos proyectos** (tuyo + cliente), ejecutá primero `/deploy` y luego `/deploy-client`.
