# Mirror Doc: Inventory.js (Modules)

## 🎯 Objetivo
Garante de la integridad del stock. Este módulo es el "sistema inmunológico" del inventario, encargado de auditar, corregir y mantener la coherencia absoluta entre las ventas, los movimientos y los depósitos.

## 🧠 Lógica de Negocio
- **Auditoría de Autocorrección:** Elimina duplicados, detecta registros "huérfanos" y crea automáticamente las combinaciones (Color/Talle/Tienda) faltantes.
- **Recálculo Atómico:** Procesa el historial completo de movimientos (Entradas, Salidas, Ventas Web, Ventas TPV) para recalcular el stock real desde cero si se detectan inconsistencias.
- **Conexión con BigQuery:** Capacidad de archivar datos históricos en almacenes masivos para análisis de años anteriores sin ralentizar el sistema diario.
- **Motor Bartender (QR):** Genera etiquetas CSV listas para impresión física, integrando códigos de barras y códigos QR vinculados a la base de datos central.

## 🔄 Interacciones
- **Servicio:** Alimenta `inventory_dashboard.html`.
- **Notificaciones:** Reporta estados de salud del inventario vía Telegram.
- **Triggers:** Se dispara tras cierres de período para un "reseteo inteligente" que congela el stock actual como nuevo saldo inicial.

## 💰 Valor de Usuario (Publicidad)
**"Stock Infalible, Confianza Total":** Olvídate de los "no tengo stock" cuando ya vendiste. El sistema se auto-audita constantemente para que lo que ves en pantalla sea EXACTAMENTE lo que hay en el estante. Imprime tus propias etiquetas QR en segundos y profesionaliza tu logística hoy mismo.
