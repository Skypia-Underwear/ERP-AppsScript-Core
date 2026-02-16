# Mirror Doc: Images_IA_Engine.js (Deep Dive)

## 🎯 Objetivo
El "Cerebro Creativo" del ERP. No es un simple gestor de archivos; es un motor de orquestación de Inteligencia Artificial que transforma datos técnicos de inventario en activos visuales de marketing de alta conversión.

## 🧠 Lógica de Negocio de Alta Fidelidad
### 1. Ingeniería de Prompts Contextual (`generarSuperPrompt`)
El sistema no envía una petición simple a la IA. Realiza un proceso de **Enriquecimiento de Contexto**:
- Extrae metadatos técnicos: Marca, Material (ej. "Textil de alta calidad"), Calce (Fit), Género y Estilo.
- Combina estos datos con la imagen original del producto para que Gemini entienda la estructura física de la prenda.
- Resultado: Genera prompts astronómicamente precisos que mantienen la identidad del producto mientras cambian el entorno o el modelo.

### 2. Generación Multi-Modal (Imagen y Vídeo VEO)
El ERP CastFer es pionero en la implementación de **VEO (Video Generation)**:
- Permite transformar una foto estática en un video promocional dinámico de corta duración.
- Lógica de estilos: El usuario puede elegir entre múltiples "Presets" (Urbano, Studio, E-commerce, Cinemático) que pre-configuran el comportamiento de la IA.

### 3. Infraestructura de Sincronización Atómica
- **Sincronización Inteligente con Drive:** El sistema detecta cambios en las carpetas de Google Drive y sincroniza la base de datos de Sheets en segundos.
- **Renombrado Estable:** Implementa un algoritmo de hash (SKU-ShortID) para que los nombres de los archivos no cambien aunque se reordene la galería, evitando enlaces rotos en la web.
- **Generación Automática de Miniaturas:** Procesa videos para extraer el primer frame como miniatura, optimizando la velocidad de carga del catálogo.

### 4. Gobernanza y Control de Costos
- **Modo Pago:** Un interruptor de seguridad que requiere un PIN cifrado para habilitar las APIs de pago de Google Cloud (Gemini Pro/Flash 2.5), protegiendo el presupuesto del negocio.
- **Auditoría de Gastos:** Cada generación de IA se registra con su costo en USD, permitiendo al dueño ver exactamente cuánto invierte en su catálogo digital.

## 🔄 Interacciones Críticas
- **Gemini API:** Orquestador de visión y generación de contenido.
- **Google Drive API:** Repositorio físico ultra-organizado.
- **WooCommerce/WordPress:** Destino final de los activos visuales para la venta pública.

## 💰 Valor de Usuario (Estrategia de Ventas)
**"Tu Propio Estudio de Fotografía con IA":** Deja de gastar miles de dólares en modelos y producciones. Con el Motor de IA de CastFer, subes una foto y obtienes un catálogo de nivel internacional en segundos. Es la diferencia entre tener un negocio local y tener una marca global impulsada por tecnología de vanguardia.
