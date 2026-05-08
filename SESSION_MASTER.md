# 📓 SESSION_MASTER: Industrialización de Infraestructura ERP (3 de Mayo, 2026)

## 🎯 Objetivo de la Sesión
Migrar el Dashboard de Ventas de un modelo dependiente de archivos JSON en Drive ("Bake & Serve") a una infraestructura de **Data Warehouse profesional en BigQuery**, garantizando alto rendimiento, escalabilidad y paridad total de datos.

## 🛠 Logros y Cambios Implementados

### 1. Arquitectura "Compositor Industrial" (`BigQueryBridge.js`)
- Se implementó un motor de consulta que actúa como un **reemplazo directo (drop-in replacement)** del JSON de Drive.
- La consulta ahora realiza **Lookups (cruces)** en tiempo real:
    - Mapea `CLIENTE_ID` ➔ `nombreCliente`.
    - Mapea `ASESOR_ID` ➔ `asesor`.
    - Resuelve datos bancarios desde la tabla maestra de transferencias.
- Se consolidaron las ventas de **Blogger** y **Pedidos Locales** en una única tabla industrial (`HISTORIAL_VENTAS`) diferenciadas por el campo `ORIGEN`.

### 2. Sincronización de Ecosistema Completo
- El archivador ahora sincroniza **6 tablas críticas** en modo espejo (`WRITE_TRUNCATE`):
    1. `HISTORIAL_VENTAS` (Consolidado).
    2. `HISTORIAL_DETALLES` (Consolidado con `DESCRIPCION_VENTA`).
    3. `HISTORIAL_CLIENTES` (Basado en `SHEET_SCHEMA.CLIENTS`).
    4. `HISTORIAL_CAJAS` (Basado en `SHEET_SCHEMA.GESTION_CAJA`).
    5. `HISTORIAL_TRANSFERENCIAS` (Basado en `SHEET_SCHEMA.DATOS_TRANSFERENCIA`).
    6. `HISTORIAL_USUARIOS` (Basado en `SHEET_SCHEMA.USUARIOS_SISTEMAS`).

### 3. Optimización de Rendimiento (Lazy Loading)
- **Dashboard Ultrarrápido**: El Dashboard ahora solo carga las cabeceras (ventas).
- **Carga Bajo Demanda**: Los detalles de los productos se consultan a BigQuery solo cuando el usuario abre el modal de una venta, reduciendo el tiempo de carga inicial de 16s a ~1s.

### 4. Correcciones Críticas
- **Fidelidad al Esquema**: Se eliminaron "alucinaciones" de columnas y se forzó el uso de `SHEET_SCHEMA` de `Constants.js` como única fuente de verdad.
- **Filtros**: Se reparó la lógica de filtrado en `sale_dashboard.html` para que sea compatible tanto con Drive como con BigQuery (case-insensitive).

### 5. Industrialización de Inventarios (Nueva)
- Se añadieron las tablas `HISTORIAL_INVENTARIO` e `HISTORIAL_MOVIMIENTOS` al motor de sincronización de BigQuery.
- Ahora el ecosistema sincroniza **8 tablas críticas** en modo espejo.

## ⚠️ Estado Actual
- **Despliegue**: Versión **603** activa.
- **Sincronización**: Motor actualizado para incluir Inventarios.
- **Pendiente**: Ejecutar `archivarVentasEnBigQuery()` desde el editor de Apps Script para realizar el primer volcado masivo de las 8 tablas.

## 📅 Próximos Pasos
1.  **Validación de Datos**: Verificar visualización de nombres y stocks en el Dashboard tras el archivado.
2.  **Pulido de UI**: Implementar Skeleton Loading para el modal de detalles de venta.
3.  **Auditoría de Errores**: Monitorear el `Health Check` para detectar fallos en la consulta BQ.
4.  **Optimización de Inventario**: Migrar `inventory_dashboard.html` para que use el `HISTORIAL_INVENTARIO` de BigQuery.

---
*Sesión retomada. Avanzando en la industrialización de inventarios.*
