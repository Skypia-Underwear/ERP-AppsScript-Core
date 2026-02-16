# Mirror Doc: Dashboard.js (Modules)

## 🎯 Objetivo
El gran consolidador de datos. Su función es unir los mundos fragmentados (Blogger, Pedidos Locales, Cajas, Transferencias) en una única verdad financiera analizable por el dashboard de ventas.

## 🧠 Lógica de Negocio
- **Normalización Multicanal:** Une ventas de la web de Blogger con ventas físicas del TPV en un formato estandarizado.
- **Parseo Robusto:** Algoritmos inteligentes para procesar montos en moneda extranjera y local, detectando formatos de coma y punto automáticamente.
- **Mapeo de Entidades:** Vincula ventas con sus respectivos Asesores (vendedores), Clientes y Cuentas de Transferencia en tiempo real.
- **Galería Integrada:** Asocia cada venta con la imagen de portada del producto para una auditoría visual inmediata.

## 🔄 Interacciones
- **Consumo:** `convertirRangoAObjetos` de `Main.js`.
- **Servicio:** Provee datos estructurados a `sale_dashboard.html`.
- **Acción:** Permite la actualización de estados de venta (Auditoría/Corrección).

## 💰 Valor de Usuario (Publicidad)
**"El Tablero de Control de tu Imperio":** Deja de saltar entre hojas de cálculo. Mira cuánto vendiste en la web y cuánto en el local en un solo lugar. Conoce a tus clientes VIP y rastrea cada centavo con precisión quirúrgica, eliminando errores de conteo para siempre.
