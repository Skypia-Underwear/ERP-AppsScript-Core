# Mirror Doc: BigQueryBridge.js (Services)

## 🎯 Objetivo
Habilitar la escala de "Big Data" para el negocio. Su función es exportar el historial de ventas desde las hojas de cálculo hacia Google BigQuery, permitiendo análisis profundos que superan las limitaciones de filas de Google Sheets.

## 🧠 Lógica de Negocio
- **Archivado Inteligente:** Consolida ventas de múltiples orígenes (Web y Local) en una tabla maestra en la nube.
- **Normalización de Datos:** Transforma formatos humanos de las hojas en tipos de datos SQL estrictos (FLOAT, STRING, TIMESTAMP) para garantizar reportes precisos.
- **Resiliencia Cloud:** Implementa una política de reintentos exponenciales para manejar saturaciones de servicio o límites de cuota de Google Cloud.

## 🔄 Interacciones
- **Origen:** Consume `BD_VENTAS_BLOGGER` y `BD_VENTAS_PEDIDOS` vía `Main.js`.
- **Destino:** Google BigQuery (Dataset `ERP_MASTER`).
- **Activación:** Se dispara durante los "Reseteos de Período" para congelar la historia financiera antes de limpiar las hojas.

## 💰 Valor de Usuario (Publicidad)
**"Tu Memoria Infinita de Ventas":** No pierdas ni un solo dato por falta de espacio en Excel. Analiza años de historia en segundos y toma decisiones basadas en datos reales, no en intuiciones. Es tener la potencia de una multinacional al alcance de tu pequeña empresa.
