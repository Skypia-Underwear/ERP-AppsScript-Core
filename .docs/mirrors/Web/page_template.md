# Espejo: Web/page_template.html

## Objetivo
Proporcionar un lienzo dinámico y versátil para ejecutar procesos, mostrar reportes técnicos y visualizar datos en formato de tabla de manera estandarizada.

## Lógica de Negocio
Este componente es el "Ejecutor Multipropósito". Permite al sistema recibir parámetros (como fechas), disparar procesos en el servidor y mostrar el progreso en tiempo real (logs técnicos) y el resultado final (tablas de datos). Es la interfaz principal para tareas de administración y automatización.

## Interacciones
- **Llamada a Servidor**: Utiliza `google.script.run` para invocar funciones definidas dinámicamente.
- **Visualización**: Renderiza logs profesionales y tablas de datos generadas por el motor de la macros.

## Valor para el Usuario (Criterio Publicitario)
- **Transparencia Total**: El usuario puede ver qué está haciendo el sistema paso a paso (Auditabilidad Forense).
- **Flexibilidad Operativa**: Una sola herramienta que se adapta a múltiples necesidades, desde reportes de inventario hasta sincronizaciones masivas.
- **Acción Inmediata**: Botones dinámicos que permiten saltar directamente al producto o a la galería, cerrando el ciclo de trabajo en segundos.
