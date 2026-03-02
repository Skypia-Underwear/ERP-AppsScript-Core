# Relaciones y Validaciones: BD_MOVIMIENTOS_INVENTARIO

Este archivo describe cómo se conecta `BD_MOVIMIENTOS_INVENTARIO` con otras tablas del sistema, centrándose en su rol como tabla "hija" de la tabla maestro `BD_INVENTARIO`.

## Referencias y Dependencias (Refs)

### Columnas de Referencia Directa
| Columna | Tipo | Tabla Destino | Descripción |
| :--- | :--- | :--- | :--- |
| `INVENTARIO_ID` | `Ref (IsAPartOf)` | `BD_INVENTARIO` | Vinculación principal a la variación específica que se está ingresando o retirando del sistema. |
| `ORIGEN` | `Enum (Ref)` | `BD_TIENDAS` | Tienda, Proveedor o Depósito desde donde se descuenta el stock. |
| `DESTINO` | `Enum (Ref)` | `BD_TIENDAS` | Tienda, Proveedor o Depósito que recibe el stock. |
| `PRODUCTO_ID` | `Enum (Ref)` | `BD_PRODUCTOS` | Referencia al catálogo principal del producto. |

---

## Validaciones y Restricciones (Valid_If y Errores)

### ORIGEN
**Valid_If:**
Filtra los orígenes permitidos dependiendo del tipo de movimiento.
```appsheet
=IFS(
  [MOVIMIENTO] = "ENTRADA",
    LIST("PROVEEDOR"),

  [MOVIMIENTO] = "SALIDA",
    SELECT(BD_TIENDAS[TIENDA_ID], [TIENDA_ID] = [_THISROW].[INVENTARIO_ID].[TIENDA_ID]) + LIST("DEPOSITO"),

  [MOVIMIENTO] = "DEVOLUCION",
    LIST("DEPOSITO")
)
```

### DESTINO
**Valid_If:**
Regula las tiendas o locaciones de destino válidas.
```appsheet
=IFS(
  [MOVIMIENTO] = "ENTRADA",
    SELECT(BD_TIENDAS[TIENDA_ID], [TIENDA_ID] = [_THISROW].[INVENTARIO_ID].[TIENDA_ID]) + LIST("DEPOSITO"),

  [MOVIMIENTO] = "SALIDA",
    IFS(
      [ORIGEN] = "DEPOSITO",
        LIST([INVENTARIO_ID].[TIENDA_ID]),
      TRUE,
        (SELECT(BD_TIENDAS[TIENDA_ID], TRUE) + LIST("DEPOSITO")) - LIST([ORIGEN])
    ),

  [MOVIMIENTO] = "DEVOLUCION",
    LIST("PROVEEDOR")
)
```

### CANTIDAD
**Valid_If:**
Asegura que no se puedan retirar más unidades de las disponibles en el origen seleccionado.
```appsheet
=IF(
  [MOVIMIENTO] <> "SALIDA",
  TRUE,
  IFS(
    [ORIGEN] = "DEPOSITO",
      [_THIS] <= LOOKUP([_THISROW].[PRODUCTO_ID], "BD_DEPOSITO", "PRODUCTO_ID", "STOCK_ACTUAL"),
    TRUE,
      [_THIS] <= [INVENTARIO_ID].[STOCK_ACTUAL]
  )
)
```
**Error_Message_If_Invalid:**
Muestra un error personalizado indicando el inventario actual restante disponible.
```appsheet
="No hay stock suficiente. El stock actual es de " & 
  IF([ORIGEN] = "DEPOSITO", 
  LOOKUP([_THISROW].[PRODUCTO_ID], "BD_DEPOSITO", "PRODUCTO_ID", "STOCK_ACTUAL"), 
  [INVENTARIO_ID].[STOCK_ACTUAL]
) & " unidades."
```
