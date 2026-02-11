---
description: Sincronizar cambios con GitHub y Google Apps Script (clasp)
---

# Flujo de Despliegue y Sincronización

Este documento sirve como recordatorio y guía para asegurar que todos los cambios locales se reflejen en la nube.

## Pasos de Sincronización

### 1. Sincronización con GitHub
// turbo
1. Añadir cambios al área de preparación:
   `git add .`
2. Crear un commit con un mensaje descriptivo:
   `git commit -m "Refactor: Limpieza de lógica legacy de WhatsApp y Chatbot"`
3. Enviar los cambios al repositorio remoto:
   `git push`

### 2. Sincronización con Google Apps Script
// turbo
1. Empujar el código al entorno de Apps Script:
   `clasp push`

> [!TIP]
> Realizar este proceso después de cada sesión de cambios para mantener la integridad del proyecto.
