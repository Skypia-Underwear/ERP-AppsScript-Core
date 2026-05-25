---
description: Guía de Sincronización y Despliegue para Múltiples Clientes
---
# Despliegue a Proyectos de Clientes (Multi-Cliente)

Para dar soporte ordenado a múltiples clientes independientes sin riesgo de sobreescribir configuraciones, la lógica de despliegue ha sido modularizada. Cada cliente cuenta con su propio archivo de configuración clasp y su workflow exclusivo:

## 🛍️ Workflows Disponibles por Tienda

### 1. Cliente Castfer (Donweb)
* **Archivo de Configuración:** `.clasp-castfer.json`
* **Script ID:** `1Te9svmz1gbbfj6Mep3U7dlTqVnYpMg6qU6TyUMIq6btC6CndjJnQTH_B`
* **Implementación Web App ID:** `AKfycbySMq7IZrZMhXE2wZAH-4YCLV8S-VpwjiTcKMAa1jonor7Zyjd2IdJo1EHZMs9WJahSKg`
* **Workflow Comando:** Usa el workflow específico [/deploy-castfer](file:///c:/Users/USER/OneDrive/Documents/Proyecto_Web/Macros%20HostingShop/.agent/workflows/deploy-castfer.md)

### 2. Cliente MINOM JEANS (Nimon System)
* **Archivo de Configuración:** `.clasp-minom.json`
* **Script ID:** `1Lt4hlMEOwt9QqDqAUI_-i9_5yLs4oVwCuYHeWgsuxEaIxjASLG6wkk_Z`
* **Implementación Web App ID:** `AKfycbzYhSY4sTRnUvPH6EcWNG89LjurVUbeWGAiUZMSdAsaHFpl7S0mjtWeQkfEnknG80A7`
* **Workflow Comando:** Usa el workflow específico [/deploy-minom](file:///c:/Users/USER/OneDrive/Documents/Proyecto_Web/Macros%20HostingShop/.agent/workflows/deploy-minom.md)

---

## ⚙️ Estructura del Proceso General

Cuando el agente ejecute el despliegue para un cliente seleccionado, seguirá esta lógica automatizada:
1. Respaldar la configuración local de la macro (`.clasp.json`).
2. Aplicar el archivo `.clasp-[cliente].json` correspondiente.
3. Ejecutar: `clasp push --force`
4. Generar versión con `clasp version` e implementar en el ID de WebApp del cliente.
5. Restaurar la configuración original de la macro.

> [!TIP]
> Si deseas sincronizar la Macro Principal y GitHub a la vez, realiza primero un push base y luego despliega de forma independiente al cliente deseado.
