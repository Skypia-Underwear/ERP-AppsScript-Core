# Mirror Doc: Triggers.gs (Core)

## 🎯 Objetivo
Automatizar el flujo de trabajo visual. Este componente es el "reflejo" que reacciona instantáneamente cuando el usuario sube una imagen, eliminando la necesidad de procesos manuales para iniciar la IA.

## 🧠 Lógica de Negocio
- **Modo Manos Libres:** Detecta cuando AppSheet o un usuario sube un archivo a la carpeta del producto.
- **Orquestación IA:** Lanza automáticamente el proceso de "SuperPrompt" y la renderización con Imagen 3 si el archivo detectado es nuevo.
- **Gestión de Errores:** Incluye un sistema de "Grito de Error" que registra fallos en la consola para una recuperación rápida.

## 🔄 Interacciones
- **Origen:** Ediciones en la hoja `BD_PRODUCTO_IMAGENES`.
- **Destino:** Invoca a `generarSuperPrompt` en `Images.js`.
- **Instalación:** Función `instalarTriggersIA` que configura el entorno de forma segura evitando duplicados.

## 💰 Valor de Usuario (Publicidad)
**"Vende mientras duermes":** Sube una foto de un producto desde tu celular y deja que el sistema trabaje por ti. Genera descripciones profesionales y mejoras visuales automáticamente sin tocar un solo botón. Es tu fotógrafo y redactor publicitario personal trabajando 24/7.
