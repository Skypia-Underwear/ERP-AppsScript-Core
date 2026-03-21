---
description: Sincronización coordinada (GitHub + Macro Principal + Proyecto Cliente)
---
// turbo-all
# Despliegue Global Coordinado

Usa este workflow para asegurar que tanto tu Macro Principal como el Proyecto del Cliente estén siempre sincronizados con la última versión del código.

## Pasos de Ejecución

1. **Sincronización con GitHub**
   ```powershell
   git add .
   git commit -m "Coordination Deployment: Sincronización global de componentes"
   git push
   ```

2. **Despliegue a Macro Principal**
   ```powershell
   clasp push
   ```

3. **Despliegue a Proyecto Cliente**
   ```powershell
   # 1. Backup y cambio de ID
   Copy-Item .clasp.json .clasp-backup.json
   Copy-Item .clasp-client.json .clasp.json
   
   # 2. Push forzado al cliente
   clasp push --force
   
   # 3. Restauración de ID Original
   Copy-Item .clasp-backup.json .clasp.json
   Remove-Item .clasp-backup.json
   ```

> [!TIP]
> Ejecutar este flujo cada vez que se realicen cambios estructurales que afecten a ambos sistemas (ej: cambios en Main.js o WoocommerceOrders.js).
