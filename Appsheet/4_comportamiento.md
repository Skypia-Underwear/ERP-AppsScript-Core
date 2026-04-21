# Comportamiento y Automatización: BD_MOVIMIENTOS_INVENTARIO

Este archivo describe las automatizaciones, acciones y flujos de trabajo asociados a la tabla `BD_MOVIMIENTOS_INVENTARIO`. Esta tabla actúa como un registro auditable de entradas, salidas y devoluciones de stock.

## Acciones de Flujo de Trabajo (Workflow Actions)

### Creación de Movimientos (Desde BD_INVENTARIO)
Las siguientes acciones se disparan desde la tabla maestra `BD_INVENTARIO` pero tienen como propósito insertar un nuevo registro en `BD_MOVIMIENTOS_INVENTARIO`.

#### AGREGAR MOVIMIENTO DE ENTRADA
Añade un nuevo registro de tipo **ENTRADA** a la tabla de movimientos.
- **Origen:** "PROVEEDOR"
- **Destino:** Tienda actual (`[TIENDA_ID]`)
- **Cantidad:** Toma el valor del campo temporal `[AJUSTE_CANTIDAD]` en el inventario.
- **Referencia Automática:** Genera un texto amigable explicando la entrada (ej. "*ENTRADA de X unidades del Producto Y desde PROVEEDOR hacia Tienda A | Stock previo...*")

#### AGREGAR MOVIMIENTO DE SALIDA
Añade un nuevo registro de tipo **SALIDA** a la tabla de movimientos.
- **Origen:** Tienda actual (`[TIENDA_ID]`)
- **Destino:** "DEPOSITO"
- **Cantidad:** Toma el valor del campo temporal `[AJUSTE_CANTIDAD]`.
- **Referencia Automática:** Genera texto descriptivo indicando de dónde salió y a dónde fue.

---

## Acciones de Sincronización y Triggers

Una vez que se añade un registro en `BD_MOVIMIENTOS_INVENTARIO` (o luego de guardar el Formulario), se disparan acciones para actualizar el stock real en las tablas que corresponden.

### ACTUALIZAR MOVIMIENTO (Form Saved Event)
Evento que se ejecuta automáticamente al guardar el formulario (`BD_MOVIMIENTOS_INVENTARIO_Form`). Suele encadenar las actualizaciones necesarias para cuadrar el stock.

### SINCRONIZAR STOCK (Acción Agrupada)
Acción agrupada que ejecuta de forma secuencial:
1. **ACTUALIZAR INVENTARIO**
2. **ACTUALIZAR DEPOSITO**

#### ACTUALIZAR INVENTARIO
Acción de referencia que navega hacia las filas correspondientes en `BD_INVENTARIO` mediante `[INVENTARIO_ID]` y ejecuta la acción **RECALCULAR VALORES**. Esto recalcula el total de Entradas/Salidas y el Stock Final.

#### ACTUALIZAR DEPOSITO
Acción de referencia que navega hacia `BD_DEPOSITO` (usando `[INVENTARIO_ID]`) y ejecuta **RECALCULAR STOCK DEPOSITO**, asegurando que los depósitos centrales cuadren con las salidas reportadas por las tiendas.
