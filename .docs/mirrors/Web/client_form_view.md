# Mirror Doc: client_form_view.html (Web)

## 🎯 Objetivo
Automatización del registro de clientes. Elimina la carga manual de datos permitiendo que el propio cliente ingrese su información de envío y facturación mediante un formulario inteligente y visualmente atractivo.

## 🧠 Lógica de Negocio
- **Ubigeo Dinámico:** Sistema de selección de Provincia/Municipio/Localidad en cascada que garantiza direcciones de envío 100% precisas para la logística.
- **Modo Dual (Registro/Actualización):** Detecta si el cliente ya existe para permitirle actualizar sus datos mediante un PIN de seguridad.
- **Validación Logística:** Filtra métodos de envío (Retiro en Tienda vs. Domicilio) y ajusta los campos requeridos dinámicamente.
- **Cumplimiento Legal:** Incluye un módulo de Términos y Condiciones integrado para proteger legalmente al negocio en el manejo de datos personales.

## 🔄 Interacciones
- **Backend:** Envía datos a AppSheet vía `enviarDatosAppSheet`.
- **Servicios:** Consume datos geográficos externos para el selector de Ubigeo.

## 💰 Valor de Usuario (Publicidad)
**"Tus Clientes se Anotan Solos":** Deja de pedir direcciones por WhatsApp y cometer errores al anotarlas. Envía un link profesional y deja que tu cliente haga el trabajo por ti. Datos limpios, envíos seguros y una imagen de marca impecable.
