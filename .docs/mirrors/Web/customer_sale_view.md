# Mirror Doc: customer_sale_view.html (Web)

## 🎯 Objetivo
El portal de transparencia para el comprador. Permite al cliente ver el detalle de su pedido, los datos de pago y, lo más importante, subir su comprobante de transferencia para una validación inmediata por IA.

## 🧠 Lógica de Negocio
- **Ticket Digital Dinámico:** Genera un resumen visual del pedido con estados de pago (Pendiente, Pagado, Cancelado) actualizados en tiempo real.
- **Recepción de Pagos con IA:** Módulo de subida de archivos que envía el comprobante a un motor de IA para validar montos y fechas de forma automática.
- **Datos de Cobro Dinámicos:** Muestra las cuentas bancarias configuradas solo si el método de pago es "Transferencia".
- **Fidelización:** Espacio para que el cliente complete su perfil de correo electrónico, permitiendo el envío automático de facturas y promociones.

## 🔄 Interacciones
- **Backend:** Consulta `getVentaDetail` para poblar el ticket.
- **IA:** Gatilla `handleReceiptUpload` para el análisis de visión del comprobante.

## 💰 Valor de Usuario (Publicidad)
**"Tus Clientes, Siempre Informados":** Reduce la ansiedad de tus compradores. Dales un link donde puedan ver su pedido, confirmar su pago y recibir el comprobante al instante. Es la experiencia de compra de Amazon adaptada a tu propio negocio.
