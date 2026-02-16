# Mirror Doc: Images_Experience.html (Deep Dive)

## 🎯 Objetivo
La "Joyas de la Corona" de la interfaz del ERP. Una Mini-App ultra-moderna y premium diseñada para que la gestión de miles de imágenes sea una experiencia fluida, visualmente impactante y extremadamente eficiente.

## 🧠 Lógica Funcional y UI Avanzada
### 1. Arquitectura de "Single Page Experience"
- Evita recargas de página. El explorador de productos lateral permite saltar entre artículos instantáneamente mientras la galería se actualiza en segundo plano mediante WebSockets/AppScript Runs.
- **Filtrado por ADN Visual:** Buscador inteligente que no solo usa el SKU, sino también categorías y estados de stock.

### 2. Manipulación Visual de Vanguardia
- **Modo Reordenar (Drag & Drop):** Permite cambiar el orden de las fotos en el catálogo web simplemente arrastrando las tarjetas. El sistema recalcula la posición y actualiza la base de datos automáticamente.
- **Gestión Atómica de Portadas:** Con un solo clic, se puede definir qué foto es la cara de la marca para el producto, aplicando reglas de negocio que actualizan simultáneamente Sheets y WooCommerce.
- **Zoom Inmersivo:** Motor de visualización que permite inspeccionar la calidad de las telas y detalles de costura sin salir de la interfaz principal.

### 3. Consola de Operaciones en Tiempo Real
- Incluye un panel de diagnóstico (Console Panel) que muestra el "latido" del sistema: subidas de archivos, respuestas de la IA y estados de la API de WordPress en tiempo real. Esto da una sensación de control absoluto al administrador.

### 4. Diseño Responsivo y Móvil-First
- Transformación dinámica: En celulares, el sistema se adapta para funcionar como una App nativa, permitiendo subir fotos directamente desde la cámara del celular al catálogo en segundos.

## 🔄 Interacciones
- **Main Shell:** Se inyecta dinámicamente en el contenedor central del sistema.
- **External API:** Se comunica con el backend de imágenes para detonar sincronizaciones globales.

## 💰 Valor de Usuario (Estrategia de Ventas)
**"La Gestión Visual más Potente del Mercado":** Gestionar tu catálogo no debería ser aburrido. Images Experience transforma la administración en un placer visual. Es una herramienta diseñada para el dueño de negocio que valora su tiempo y quiere que su marca se vea impecable en cada píxel. Tu catálogo, tu orden, tu éxito.
