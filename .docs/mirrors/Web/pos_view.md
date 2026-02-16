# Mirror Doc: pos_view.html (Web)

## 🎯 Objetivo
El punto de contacto con el dinero. Un sistema de Terminal Punto de Venta (TPV) profesional diseñado para locales físicos, optimizado para la velocidad y la precisión en el registro de ventas complejas.

## 🧠 Lógica de Negocio
- **Modos de Operación Dual:** Interfaz optimizada para pantallas táctiles (Botones) y para logística de depósito (Lector de Códigos QR/Barras).
- **Inteligencia de Precios:** Gestiona automáticamente recargos por compra minorista, descuentos por pago en efectivo y recargos por transferencia sin intervención del vendedor.
- **Control de Variaciones:** Selector rápido de Color/Talle que muestra solo lo que realmente hay en stock, evitando decepciones en el mostrador.
- **Carrito Robusto:** Soporta edición de cantidades, eliminación de ítems y cálculos financieros atómicos en tiempo real.
- **Cierre de Caja Seguro:** Registra cada venta vinculándola al Asesor presente y a la caja abierta, garantizando una trazabilidad financiera total.

## 🔄 Interacciones
- **Backend:** Motor principal `PosManager.js` y `Dashboard.js`.
- **Maestros:** Consume el catálogo JSON filtrado por disponibilidad y permisos de tienda.
- **Notificaciones:** Genera el ticket digital y lo envía automáticamente para compartir vía WhatsApp.

## 💰 Valor de Usuario (Publicidad)
**"Ventas Rápidas, Clientes Felices":** Olvídate de la calculadora y los cuadernos. Atiende filas de clientes con la velocidad de un supermercado. El TPV automático calcula todo por ti y te asegura que nunca vendas lo que no tienes. Es profesionalizar tu mostrador desde el primer minuto.
