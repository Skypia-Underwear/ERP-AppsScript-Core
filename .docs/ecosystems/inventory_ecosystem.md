# Ecosistema de Gestión de Inventario ERP - Skypia Underwear

Este documento detalla la arquitectura, el flujo de datos y las interacciones entre los diferentes entornos (AppSheet, TPV y Dashboard) que componen el sistema de inventario.

---

## 🏗️ 1. Arquitectura de Datos (Single Source of Truth)

Toda la información reside en Google Sheets, actuando como la base de datos centralizada:

*   **`BD_INVENTARIO`**: El corazón del sistema. Almacena el stock actual por combinación única de `Tienda + Producto + Color + Talle`.
*   **`BD_PRODUCTOS` / `BD_VARIEDAD_PRODUCTOS`**: Maestros de definiciones.
*   **`BD_MOVIMIENTOS_INVENTARIO`**: Registro histórico de entradas, salidas y transferencias.
*   **`BD_DEPOSITO`**: Stock central antes de ser distribuido a las tiendas físicas.

---

## 🔄 2. Actores y Flujos de Actualización

Existen tres formas principales en las que el inventario se altera:

### A. Entorno AppSheet (Gestión Administrativa)
*   **Método**: Registros mediante Formularios y Procesamiento vía **Bots/Acciones**.
*   **Uso**: Compras a proveedores, ingresos de nueva mercadería, transferencias entre tiendas y ajustes manuales.
*   **Lógica**: AppSheet suele escribir en `BD_MOVIMIENTOS_INVENTARIO`. Los Bots internos (o fórmulas de Sheet) recalculan o actualizan el saldo en `BD_INVENTARIO`. Es un proceso más lento pero con mayor trazabilidad.

### B. Punto de Venta - TPV (Venta Rápida)
*   **Método**: **Alteración Directa de Valores** vía Google Apps Script (`PosManager.js`).
*   **Uso**: Ventas presenciales en tiendas.
*   **Lógica**: Para garantizar la velocidad y evitar colisiones de concurrencia, el TPV:
    1.  Lee el valor actual de `STOCK_ACTUAL`.
    2.  Resta la cantidad vendida.
    3.  Suma la cantidad a `VENTAS_LOCAL`.
    4.  Sobrescribe la celda directamente en `BD_INVENTARIO`.
*   **Nota**: Este método prioriza la velocidad de atención al cliente.

### C. Dashboard de Inventario (Auditoría y Control)
*   **Método**: **Auditoría de Autocorrección** (`Inventory.js`).
*   **Uso**: Supervisión, limpieza de datos y generación de etiquetas Bartender.
*   **Lógica**: Ejecuta el proceso de "Sistema Inmunológico":
    1.  Elimina duplicados accidentales.
    2.  Detecta productos sin registro de inventario y los crea.
    3.  Limpia registros de productos que ya no existen (huérfanos).

---

## 📡 3. Sincronización y Distribución del Catálogo

Para que el TPV y otros sistemas externos funcionen sin latencia de Google Sheets, existe un proceso de publicación:

1.  **Generación de JSON**: La función `publicarCatalogo()` extrae la foto actual del inventario y productos.
2.  **Distribución Dual**:
    *   **Donweb**: Servidor principal para consumo del TPV (Alta velocidad).
    *   **GitHub**: Respaldo de seguridad y versionado.
3.  **Frecuencia**: Se dispara automáticamente cada 5 minutos o manualmente tras cambios críticos.

---

## ⚠️ 4. Desafíos de Integración para la Optimización

Al plantear la "Optimización Masiva" en el ERP, debemos considerar:

1.  **Concurrencia**: Asegurar que mientras el ERP actualiza stock masivamente, un Bot de AppSheet o una venta en el TPV no intenten escribir en la misma fila simultáneamente (Uso de `LockService`).
2.  **Trazabilidad**: Las ediciones directas en el Dashboard deberían idealmente generar un registro en `BD_MOVIMIENTOS_INVENTARIO` para no perder el rastro de "quién movió qué".
3.  **Integridad**: El TPV depende de que el `variation_id` (vido) sea consistente entre el JSON publicado y la realidad de la hoja de cálculo.

---
> [!IMPORTANT]
> **Diseño Propuesto**: El nuevo Dashboard de Inventario en el ERP debe actuar como un puente que permita ediciones rápidas (estilo TPV) pero manteniendo la formalidad de AppSheet (generando logs de auditoría).
