# Espejo: Services/AppSheetApi.js

## Objetivo
Establecer un puente de comunicación bidireccional y seguro entre el motor de la macros y la interfaz móvil de AppSheet, gestionando clientes y auditorías.

## Lógica de Negocio
Este archivo asegura que toda la información recolectada en la web o vía IA se guarde correctamente en la base de datos de AppSheet. No solo guarda datos, sino que dispara "Bots de Automatización" que pueden enviar correos o notificaciones, cerrando el ciclo de comunicación con el cliente de forma automática.

## Interacciones
- **AppSheet API**: Realiza peticiones REST seguras usando claves de acceso.
- **Auditoría**: Registra cada paso del proceso en `BD_FORMULARIO_CLIENTE` para mantener un historial forense de quién hizo qué y cuándo.

## Valor para el Usuario (Criterio Publicitario)
- **Sincronización Total**: Tu aplicación móvil y tu sistema web hablan el mismo idioma en tiempo real.
- **Automatización Profesional**: Registro de clientes y actualizaciones que disparan procesos de negocio sin que muevas un dedo.
- **Seguridad Forense**: Cada registro es auditado, dándote la tranquilidad de saber que tu base de datos de clientes está protegida y controlada.
