# Manual de Intercepción y Scraping de Catálogos en WhatsApp Web

Este manual detalla el método técnico y el script de consola utilizado para extraer masivamente los productos del catálogo de una cuenta comercial directamente desde **WhatsApp Web (Chrome/Firefox/Edge)**. La salida de este proceso genera el archivo CSV que alimenta nuestro importador inteligente en el ERP.

---

## 🎯 Objetivo
Extraer de forma estructurada en un archivo CSV todos los productos visibles en el catálogo de WhatsApp de un proveedor o cliente comercial. El CSV resultante tiene la siguiente estructura de columnas estándar:
* **SKU:** ID único del producto o ID interno provisto por WhatsApp.
* **Title:** Nombre del producto (ej: `Wide leg Borravino`).
* **Description:** Detalle de materiales, condiciones y lista de talles.
* **Price:** Precio del producto (número entero o decimal).
* **Image Link:** URL directa a la imagen en el CDN seguro de Meta (WhatsApp).

---

## 🛠️ Procedimiento de Extracción Paso a Paso

### Paso 1: Acceder al Catálogo en WhatsApp Web
1. Abre tu navegador (Google Chrome recomendado) e inicia sesión en [web.whatsapp.com](https://web.whatsapp.com/).
2. Busca al contacto comercial y abre su chat.
3. Haz clic en el nombre del contacto en la parte superior para abrir su panel lateral de información.
4. Si el contacto tiene un catálogo comercial activo, verás la sección **"Catálogo"**. Haz clic en **"Ver todos"** o entra directamente a la vista del catálogo para desplegar la grilla completa de productos en pantalla.

### Paso 2: Desplazamiento Infinito (Scroll Down)
WhatsApp Web utiliza renderizado perezoso (*lazy loading*). Para asegurarte de que el script intercepte el 100% de los artículos:
1. Haz scroll continuo hacia abajo en la lista o grilla del catálogo.
2. Permite que carguen las imágenes y títulos de todos los productos hasta llegar al final de la lista.

### Paso 3: Abrir la Consola del Desarrollador (F12)
1. Presiona la tecla **F12** en tu teclado (o haz clic derecho en cualquier parte de la página y selecciona **Inspeccionar**).
2. Ve a la pestaña **Consola (Console)**.

### Paso 4: Ejecutar el Script de Scraping
Copia y pega el siguiente script de JavaScript en la consola y presiona **Enter**:

```javascript
/**
 * SCRIPT DE CONSOLA: Extractor de Catálogo Comercial en WhatsApp Web
 * Desarrollado para: ERP - Macros HostingShop
 * Salida: Descarga automática de "catalogo_whatsapp_interceptado.csv"
 */
(function() {
    console.log("🔍 Iniciando intercepción de catálogo WhatsApp...");
    
    // Selectores del DOM de WhatsApp Web (Sujetos a cambios en actualizaciones de Meta)
    const productCards = document.querySelectorAll('div[role="listitem"], div[class*="_ak8g"], div[class*="selectable-text"]');
    const products = [];
    
    productCards.forEach((card, index) => {
        try {
            // Intentar buscar los elementos internos de cada tarjeta
            const titleEl = card.querySelector('span[class*="selectable-text"], span[dir="auto"], font');
            const priceEl = card.querySelector('span[class*="_ak8h"], span[class*="price"]');
            const imgEl = card.querySelector('img');
            
            // Tratamiento de SKU / ID único de WhatsApp
            // Si el elemento img tiene una URL, el ID de WhatsApp suele estar codificado allí
            let sku = `WS-${Date.now()}-${index}`;
            let imageUrl = "";
            
            if (imgEl) {
                imageUrl = imgEl.src || "";
                if (imageUrl.startsWith("blob:")) {
                    imageUrl = imgEl.getAttribute("data-original-src") || imageUrl;
                }
                
                // Extraer el hash del ID del CDN de Meta si está disponible
                const match = imageUrl.match(/\/v\/t45\.5328-4\/([a-zA-Z0-9_\-]+)\./);
                if (match && match[1]) {
                    // Limpiar el hash de la imagen para usarlo como SKU único numérico
                    sku = match[1].replace(/[^0-9]/g, "").substring(0, 17);
                }
            }

            // Sanitización del Título y Limpieza Directa de Emojis/Iconos
            let title = titleEl ? titleEl.innerText.trim() : "Producto Sin Título";
            
            // Extracción y Normalización de Precio (Elimina caracteres de moneda)
            let price = 0;
            if (priceEl) {
                const rawPrice = priceEl.innerText.replace(/[^0-9,.]/g, "").replace(",", ".");
                price = parseFloat(rawPrice) || 0;
            }

            // Nota: En la vista de lista de catálogo, WhatsApp a veces no muestra la descripción larga.
            // Extraemos por defecto el detalle que exponga el DOM, o dejamos el campo listo para el limpiador.
            let description = "";
            const descEl = card.querySelector('span[class*="description"], div[class*="description"]');
            if (descEl) {
                description = descEl.innerText.trim();
            } else {
                // Fallback: usar parte del título o dejar en blanco para que lo asigne el usuario manualmente en el importador
                description = `Detalle de talle y material para ${title}`;
            }

            // Omitir tarjetas vacías o redundantes
            if (title !== "Producto Sin Título" && imageUrl !== "") {
                products.push({
                    sku: sku,
                    title: title,
                    description: description,
                    price: price,
                    imageUrl: imageUrl
                });
            }
        } catch (err) {
            console.error("⚠️ Error procesando tarjeta de producto: ", err);
        }
    });

    if (products.length === 0) {
        console.warn("❌ No se detectaron productos. Asegúrate de estar con el panel lateral de catálogo abierto y haber hecho scroll.");
        alert("No se encontraron productos. Por favor revisa que el catálogo esté visible en pantalla.");
        return;
    }

    console.log(`✅ ¡Éxito! Se interceptaron ${products.length} productos.`);

    // --- FORMATEO E IMPORTACIÓN A CSV ---
    const headers = ["SKU", "Title", "Description", "Price", "Image Link"];
    const csvLines = [headers.join(",")];

    products.forEach(p => {
        const escapeCSV = (val) => {
            if (val === null || val === undefined) return '""';
            let str = String(val);
            if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
                str = '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };

        const row = [
            escapeCSV(p.sku),
            escapeCSV(p.title),
            escapeCSV(p.description),
            escapeCSV(p.price),
            escapeCSV(p.imageUrl)
        ];
        csvLines.push(row.join(","));
    });

    // Descarga del Archivo CSV en el Navegador
    const csvContent = "\uFEFF" + csvLines.join("\n"); // UTF-8 BOM para soporte de acentos en Excel
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `catalogo_whatsapp_interceptado_${products.length}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log("💾 Archivo CSV descargado con éxito.");
})();
```

---

## 📈 Recomendaciones de Mantenimiento (Actualizaciones de Meta)
WhatsApp Web actualiza frecuentemente sus clases de CSS del DOM (ej: pasando de nombres como `_ak8g` a nuevas clases aleatorias). Si el script deja de extraer productos:
1. Haz clic derecho sobre el título de un producto en el catálogo y selecciona **"Inspeccionar"**.
2. Identifica la clase o propiedad del elemento contenedor raíz del artículo (usualmente un `<div role="listitem">`).
3. Reemplaza el selector en la línea:
   ```javascript
   const productCards = document.querySelectorAll('div[role="listitem"]');
   ```
   con el nuevo contenedor detectado.
