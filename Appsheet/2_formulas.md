# Fórmulas y Lógica: BD_MOVIMIENTOS_INVENTARIO

Este archivo detalla la lógica de cálculo y valores iniciales de la tabla hija `BD_MOVIMIENTOS_INVENTARIO`, utilizada para registrar historiales de transferencia de stock.

## Columnas Físicas (Initial Value / App Formula)

### REGISTRO_ID
**Initial Value:**
```appsheet
=CONCATENATE("MOV-", TEXT([FECHA], "YYYY-MM-DD"), "-", UNIQUEID())
```

### USER_ID
**Initial Value:**
```appsheet
=USEREMAIL()
```

### FECHA
**Initial Value:**
```appsheet
=TODAY()
```

### ORIGEN
**Initial Value:**
```appsheet
=IF([MOVIMIENTO] = "DEVOLUCION", "DEPOSITO", "")
```

### DESTINO
**Initial Value:**
```appsheet
=IFS(
  [MOVIMIENTO] = "DEVOLUCION", "PROVEEDOR",
  AND([MOVIMIENTO] = "SALIDA", [ORIGEN] = "DEPOSITO"), [INVENTARIO_ID].[TIENDA_ID],
  TRUE, ""
)
```

### PRODUCTO_ID
**Initial Value:**
```appsheet
=[INVENTARIO_ID].[PRODUCTO_ID]
```

### REFERENCIA
Genera un historial legible para entender el movimiento realizado.
**Initial Value:**
```appsheet
=IFS(
  [MOVIMIENTO] = "ENTRADA",
    CONCATENATE(
      "**ENTRADA** de **", [CANTIDAD], 
      "** unidades del Producto **", [PRODUCTO_ID],
      "** (Color: **", [INVENTARIO_ID].[COLOR], 
      " | Talle: **", [INVENTARIO_ID].[TALLE], 
      "**) desde **", [ORIGEN], 
      "** hacia **", [DESTINO],
      "** | Stock previo: **", [INVENTARIO_ID].[STOCK_ACTUAL],
      " → Stock final: **", [INVENTARIO_ID].[STOCK_ACTUAL] + [CANTIDAD], "**"
    ),
  [MOVIMIENTO] = "SALIDA",
    CONCATENATE(
      "**SALIDA** de **", [CANTIDAD], 
      "** unidades del Producto **", [PRODUCTO_ID],
      "** (Color: **", [INVENTARIO_ID].[COLOR], 
      " | Talle: **", [INVENTARIO_ID].[TALLE], 
      "**) desde **", [ORIGEN], 
      "** hacia **", [DESTINO],
      "** | Stock previo: **", [INVENTARIO_ID].[STOCK_ACTUAL],
      " → Stock final: **", [INVENTARIO_ID].[STOCK_ACTUAL] - [CANTIDAD], "**"
    )
)
```
