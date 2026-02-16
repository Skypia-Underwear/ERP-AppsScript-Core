# Mirror Doc: Installer.js (Utils)

## 🎯 Objetivo
El "Genio de la Lámpara" del sistema. Es el encargado de construir toda la infraestructura de carpetas y configuraciones iniciales para que el ERP funcione en una cuenta de Google desde cero en cuestión de segundos.

## 🧠 Lógica de Negocio
- **Arquitecto de Carpetas:** Crea automáticamente la estructura jerárquica en Google Drive (Imágenes, Backups, Temporales, WooCommerce) sin intervención humana.
- **Configurador Maestro:** Pobla la hoja `BD_APP_SCRIPT` con todas las claves necesarias para el funcionamiento de la IA, Telegram y WordPress.
- **Auditor de Salud:** Incluye herramientas para verificar que todas las hojas de cálculo tengan las columnas correctas, previniendo errores antes de que ocurran.
- **Gestor de Webhooks:** Facilita la conexión con Telegram con un solo clic, permitiendo que el Bot "cobre vida" instantáneamente.

## 🔄 Interacciones
- **Interfaz:** Agrega un menú personalizado ("⚙️ INSTALACIÓN") directamente en la barra superior de Google Sheets.
- **Drive API:** Orquestación intensiva de permisos y creación de archivos.

## 💰 Valor de Usuario (Publicidad)
**"Configura tu ERP en un Clic":** ¿Miedo a la tecnología? El Instalador Automático hace el trabajo sucio por ti. Crea tus carpetas, prepara tus planillas y conecta tus apps en segundos. Es como tener a un ingeniero instalando todo mientras tú te tomas un café.
