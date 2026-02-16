# Mirror Doc: systemContainer.html (Web)

## 🎯 Objetivo
La "Cápsula Espacial" del ERP. Es el contenedor maestro (Shell) que unifica todas las herramientas, gestiona la navegación entre módulos y mantiene la seguridad del sistema en una sola interfaz coherente.

## 🧠 Lógica de Negocio
- **Arquitectura de Micro-Vistas:** Carga cada módulo (TPV, Inventario, Imágenes) de forma dinámica dentro de un contenedor principal, evitando recargas de página lentas.
- **Omni-Canalidad Móvil:** Incluye una barra de navegación inferior (Bottom Nav) específica para celulares, transformando el ERP en una Web App real.
- **Gestión de Errores Global:** Captura fallos en cualquier parte del sistema y los reporta centralizadamente para garantizar que el negocio nunca se detenga.
- **Inyector de Scripts:** Motor avanzado que asegura que el código JavaScript de cada módulo se ejecute correctamente al ser cargado dinámicamente.

## 🔄 Interacciones
- **Orquestador:** Gestiona el ciclo de vida de todos los archivos `.html` del proyecto.
- **Seguridad:** Bloquea el acceso total si no existe una sesión válida en `sessionStorage`.

## 💰 Valor de Usuario (Publicidad)
**"Todo tu Sistema en Armonía":** Olvídate de aplicaciones separadas que no se hablan entre sí. El Shell unifica el poder de tu negocio en una sola pantalla profesional, rápida y adaptada a tu celular. Es la columna vertebral tecnológica que tu empresa necesita para crecer.
