# Mirror Doc: ExternalClient.js (Modules)

## 🎯 Objetivo
El "Auditor de Pagos" infalible. Este módulo gestiona la experiencia del comprador fuera del ERP, permitiéndole ver su pedido y, lo más importante, validando sus pagos mediante Inteligencia Artificial para automatizar la facturación.

## 🧠 Lógica de Negocio
- **Verificación de Comprobantes con IA:** Utiliza Gemini para "leer" las capturas de pantalla de transferencias bancarias, comparando montos, bancos y titulares contra los datos del pedido en tiempo real.
- **Motor de Notificaciones Email:** Envía automáticamente confirmaciones de pago profesionales y detalladas al cliente una vez que la IA valida el comprobante.
- **Renderizado Adaptativo:** Prepara los datos (Venta, Cliente, Productos) para la vista `customer_sale_view.html`, manejando conversiones de moneda y zonas horarias complejas.
- **Integración AppSheet:** Actualiza el estado del pedido a "PAGADO" o "REVISIÓN MANUAL" de forma atómica a través de la API de AppSheet.

## 🔄 Interacciones
- **Frontend:** Orquesta la lógica detrás de `customer_sale_view.html` y `client_form_view.html`.
- **IA:** Consume `verifyReceiptWithGemini` para el análisis de visión.
- **Google Drive:** Almacena físicamente los comprobantes de pago subidos por los usuarios.

## 💰 Valor de Usuario (Publicidad)
**"Cobra Mientras Duermes":** Olvídate de revisar capturas borrosas de WhatsApp. ExternalClient.js pone a una Inteligencia Artificial a trabajar para ti, validando pagos y enviando correos de agradecimiento a tus clientes 24/7. Es seguridad, velocidad y profesionalismo en piloto automático.
