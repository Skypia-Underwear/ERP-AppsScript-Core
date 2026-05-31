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
 * SCRIPT DE CONSOLA: Extractor Inteligente e Instantáneo de Catálogo (v5 - Súper Extractor de Blobs en RAM)
 * Desarrollado para: ERP - Macros HostingShop
 * Instrucciones: Haz scroll manual hasta el final del catálogo y luego ejecuta este script en la consola (F12).
 * Salida: Descarga automática de "catalogo_whatsapp_interceptado.csv"
 */
(async function() {
    console.log("🔍 Iniciando Extractor Inteligente e Instantáneo de Catálogo (v5 - Blobs RAM)...");
    
    // Función limpiadora universal de precios (Soporta formatos latinos e internacionales)
    function cleanPriceString(str) {
        let s = str.trim();
        if (s.includes(",") && s.includes(".")) {
            s = s.replace(/,/g, ""); // "21,000.00" -> "21000.00"
        } else if (s.includes(",")) {
            if (/,([0-9]{2})$/.test(s)) {
                s = s.replace(/\./g, "").replace(",", "."); // "21.000,00" -> "21000.00"
            } else {
                s = s.replace(/,/g, ""); // "21,000" -> "21000"
            }
        } else if (s.includes(".")) {
            if (/\.([0-9]{3})$/.test(s)) {
                s = s.replace(/\./g, ""); // "21.000" -> "21000"
            }
        }
        return parseFloat(s) || 0;
    }
    
    // Función premium: Extrae la imagen descifrada real visible en pantalla a Base64 desde el Blob en RAM o Canvas
    async function getBase64FromBlobOrCanvas(blobUrl, imgEl) {
        if (blobUrl && blobUrl.startsWith("blob:")) {
            try {
                const response = await fetch(blobUrl);
                const blob = await response.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => resolve("");
                    reader.readAsDataURL(blob);
                });
                // Verificar que no sea una imagen vacía o un placeholder corrupto (1x1 es muy corto)
                if (base64 && base64.length > 1000) {
                    return base64;
                }
            } catch (e) {
                console.warn("No se pudo fetch/decodificar el blob directamente, intentando canvas fallback...", e);
            }
        }
        
        // Fallback a Canvas en GPU si no hay Blob o si el Blob falló
        if (imgEl) {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = imgEl.naturalWidth || imgEl.width || 120;
                canvas.height = imgEl.naturalHeight || imgEl.height || 120;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
                const canvasBase64 = canvas.toDataURL("image/jpeg", 0.85);
                if (canvasBase64 && canvasBase64.length > 1000) {
                    return canvasBase64;
                }
            } catch (e) {
                console.error("No se pudo descifrar la imagen a Base64 usando canvas:", e);
            }
        }
        return "";
    }
    
    // Selectores del DOM de WhatsApp Web (Tarjetas de producto)
    const productCards = document.querySelectorAll('div[role="listitem"], div[class*="_ak8g"], div[class*="selectable-text"]');
    const products = [];
    
    console.log(`🔍 Analizando ${productCards.length} elementos en el DOM...`);
    
    for (let index = 0; index < productCards.length; index++) {
        const card = productCards[index];
        try {
            // Intentar buscar los elementos de título
            const titleEl = card.querySelector('span[class*="selectable-text"], span[dir="auto"], font');
            if (!titleEl) continue; // Si no hay título, no es una tarjeta de producto real
            
            let title = titleEl.innerText.trim();
            if (title === "Producto Sin Título" || !title) continue;
            
            // Buscar la URL del blob o CDN de imagen dentro de los elementos de la tarjeta
            let blobUrl = "";
            let cdnUrl = "";
            const metaCdnRegex = /(https:\/\/[^\s"'>)]*(?:whatsapp\.net|fbcdn\.net)[^\s"'>)]*)/i;
            
            // Inspeccionar todas las etiquetas del elemento para encontrar blobs e imágenes
            const allElements = card.querySelectorAll('*');
            let imgEl = null;
            
            for (let el of allElements) {
                // 1. Guardar primer img tag real
                if (el.tagName === "IMG" && !imgEl) {
                    imgEl = el;
                }
                
                // 2. Extraer blob de atributos (src, style, data-*)
                if (el.src && el.src.startsWith("blob:")) {
                    blobUrl = el.src;
                }
                if (el.style && el.style.backgroundImage && el.style.backgroundImage.includes("blob:")) {
                    const match = el.style.backgroundImage.match(/url\(['"]?(blob:[^'"]+)['"]?\)/);
                    if (match && match[1]) {
                        blobUrl = match[1];
                    }
                }
                
                // 3. Buscar CDN de Meta para SKU
                if (el.attributes) {
                    for (let attr of el.attributes) {
                        const val = attr.value || "";
                        if (val.startsWith("blob:")) {
                            blobUrl = val;
                        }
                        const match = val.match(metaCdnRegex);
                        if (match) {
                            cdnUrl = match[1];
                        }
                    }
                }
            }
            
            // Si el imgEl de primer nivel tiene src de blob, usarlo
            if (imgEl && imgEl.src && imgEl.src.startsWith("blob:")) {
                blobUrl = imgEl.src;
            }
            
            // Tratamiento de SKU / ID único de WhatsApp
            let sku = `WS-${Date.now()}-${index}`;
            
            // Extraer el hash de la URL de CDN para conservar la unicidad del SKU
            if (cdnUrl) {
                const match = cdnUrl.match(/\/v\/t45\.5328-4\/([a-zA-Z0-9_\-]+)\./);
                if (match && match[1]) {
                    sku = match[1].replace(/[^0-9]/g, "").substring(0, 17);
                }
            }
            
            // Extraer Base64 real de la imagen descifrada desde RAM
            let imageUrl = await getBase64FromBlobOrCanvas(blobUrl, imgEl);
            
            // Si falló por completo y el imageUrl está vacío, no agregamos este registro vacío
            if (!imageUrl) {
                console.warn(`⚠️ Omitiendo ${title} porque no se encontró una imagen descifrada en memoria.`);
                continue;
            }
            
            // --- DETECCIÓN DE PRECIO POR INNER_TEXT (100% ROBUSTA A CAMBIOS DE CLASES CSS) ---
            let price = 0;
            const text = card.innerText || "";
            const priceRegex = /(?:ARS|\$)\s*([0-9.,\s]+)/gi;
            let pricesFound = [];
            let matchPrice;
            
            while ((matchPrice = priceRegex.exec(text)) !== null) {
                const num = cleanPriceString(matchPrice[1]);
                if (num > 0) {
                    pricesFound.push(num);
                }
            }
            
            if (pricesFound.length > 0) {
                if (pricesFound.length > 1) {
                    price = Math.min(...pricesFound); // El de menor valor es el de oferta
                } else {
                    price = pricesFound[0];
                }
            }
            
            // Descripción (Fallback/Defecto)
            let description = "";
            const descEl = card.querySelector('span[class*="description"], div[class*="description"]');
            if (descEl) {
                description = descEl.innerText.trim();
            } else {
                description = `Detalle de talle y material para ${title}`;
            }
            
            products.push({
                sku: sku,
                title: title,
                description: description,
                price: price,
                imageUrl: imageUrl
            });
            
        } catch (err) {
            console.error("⚠️ Error procesando tarjeta de producto: ", err);
        }
    }
    
    if (products.length === 0) {
        console.warn("❌ No se detectaron productos con imágenes válidas. Asegúrate de que las imágenes se vean en pantalla.");
        alert("No se encontraron productos con imágenes descifradas. Revisa que el catálogo esté cargado y visible.");
        return;
    }
    
    console.log(`✅ ¡Éxito! Se interceptaron ${products.length} productos con imágenes reales de alta calidad desde la RAM.`);
    
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
    const csvContent = "\uFEFF" + csvLines.join("\n"); // UTF-8 BOM
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
