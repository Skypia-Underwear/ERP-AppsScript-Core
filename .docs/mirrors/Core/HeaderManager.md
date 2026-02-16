# Mirror Doc: HeaderManager (Core Component in Main.js)

## 🎯 Objetivo
El "Traductor Universal" de datos. Su función es permitir que el ERP sea flexible: puedes mover, renombrar o agregar columnas en tus hojas de Google Sheets, y el sistema las encontrará automáticamente sin romperse.

## 🧠 Lógica de Negocio
- **Escaneo Dinámico:** Al iniciar cualquier proceso, HeaderManager "lee" la primera fila de la hoja de cálculo y mapea los nombres de las columnas a sus posiciones exactas.
- **Alias Inteligentes:** Reconoce sinónimos. Si escribes "MAIL", "CORREO" o "EMAIL", el sistema entiende que te refieres al mismo dato, facilitando la vida al administrador.
- **Validación de Integridad:** Compara la estructura actual de la hoja contra el "Manual de Fábrica" (`SHEET_SCHEMA`) y alerta si falta alguna columna vital para el negocio.
- **Aceleración (Cache):** Guarda el mapa de columnas en memoria durante la ejecución para que los procesos de carga masiva sean ultra-rápidos.

## 🔄 Interacciones
- **Core:** Utilizado por absolutamente todos los módulos que leen o escriben en la base de datos de Google Sheets.
- **Utilidad:** Facilita la función `convertirRangoAObjetos`, transformando filas aburridas en objetos de programación listos para usar.

## 💰 Valor de Usuario (Publicidad)
**"Libertad Total para tus Planillas":** Con HeaderManager, tú eres el dueño de tus datos. Agrega columnas para tus propias notas o cambia el orden de las hojas; el ERP se adapta a ti, no tú al ERP. Es la tecnología que te permite crecer sin miedo a romper el sistema.
