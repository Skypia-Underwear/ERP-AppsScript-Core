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
 * SCRIPT DE CONSOLA: Extractor Inteligente con Auto-Scroll & Soporte de Ofertas
 * Desarrollado para: ERP - Macros HostingShop
 * Salida: Descarga automática de "catalogo_whatsapp_interceptado.csv"
 */
(async function() {
    console.log("🔍 Iniciando Extractor Inteligente de Catálogo de WhatsApp Business...");
    console.log("⏳ Paso 1: Iniciando Auto-Scroll automático interactivo para cargar el catálogo...");
    
    // Intentar buscar el contenedor del scroll del catálogo lateral de WhatsApp Web
    const scrollContainer = document.querySelector('div[data-tab="1"]') || document.querySelector('div[class*="scrollable"]') || window;
    
    let lastHeight = scrollContainer.scrollHeight || document.body.scrollHeight;
    let noChangeAttempts = 0;
    const maxAttempts = 8; // Intentos consecutivos sin incremento de altura para finalizar
    
    // Crear cartel visual flotante elegante y temporal para guiar al usuario
    const toast = document.createElement("div");
    toast.style.position = "fixed";
    toast.style.top = "20px";
    toast.style.right = "20px";
    toast.style.backgroundColor = "#4f46e5";
    toast.style.color = "white";
    toast.style.padding = "14px 20px";
    toast.style.borderRadius = "12px";
    toast.style.boxShadow = "0 10px 25px rgba(0,0,0,0.3)";
    toast.style.zIndex = "99999";
    toast.style.fontFamily = "sans-serif";
    toast.style.fontSize = "13px";
    toast.style.fontWeight = "bold";
    toast.style.transition = "all 0.3s ease";
    toast.innerText = "🤖 Auto-Scroll Activo: Cargando productos del catálogo...";
    document.body.appendChild(toast);
    
    while (noChangeAttempts < maxAttempts) {
        if (scrollContainer === window) {
            window.scrollTo(0, document.body.scrollHeight);
        } else {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
        
        await new Promise(r => setTimeout(r, 600)); // Delay para permitir carga del DOM
        
        let newHeight = scrollContainer.scrollHeight || document.body.scrollHeight;
        if (newHeight === lastHeight) {
            noChangeAttempts++;
        } else {
            noChangeAttempts = 0;
            lastHeight = newHeight;
            console.log(`   ⏳ Cargando productos... Altura: ${newHeight}px`);
        }
    }
    
    toast.style.backgroundColor = "#10b981";
    toast.innerText = "✅ Carga completa. Extrayendo datos de productos...";
    console.log("🏁 Carga de catálogo completada. Procesando productos...");
    
    // Selectores del DOM de WhatsApp Web (Sujetos a cambios en actualizaciones de Meta)
    const productCards = document.querySelectorAll('div[role="listitem"], div[class*="_ak8g"], div[class*="selectable-text"]');
    const products = [];
    
    productCards.forEach((card, index) => {
        try {
            // Intentar buscar los elementos internos de cada tarjeta
            const titleEl = card.querySelector('span[class*="selectable-text"], span[dir="auto"], font');
            const imgEl = card.querySelector('img');
            
            // Tratamiento de SKU / ID único de WhatsApp
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
                    sku = match[1].replace(/[^0-9]/g, "").substring(0, 17);
                }
            }

            // Sanitización del Título y Limpieza Directa de Emojis/Iconos
            let title = titleEl ? titleEl.innerText.trim() : "Producto Sin Título";
            
            // --- DETECCIÓN PREMIUM DE PRECIOS DE OFERTA VIGENTES ---
            const allPrices = card.querySelectorAll('span[class*="_ak8h"], span[class*="price"], span[class*="strike"]');
            let price = 0;
            
            if (allPrices.length > 0) {
                let selectedPriceText = "";
                
                if (allPrices.length > 1) {
                    // Hay más de un precio en la tarjeta -> Oferta activa
                    let offerPriceEl = null;
                    allPrices.forEach(pEl => {
                        const style = window.getComputedStyle(pEl);
                        const isStruck = style.textDecoration.includes('line-through') || 
                                         pEl.closest('del') || 
                                         pEl.querySelector('del') ||
                                         pEl.className.includes('strike') ||
                                         pEl.style.textDecoration === 'line-through';
                        
                        if (!isStruck) {
                            offerPriceEl = pEl; // Capturar el precio que no está tachado (el de oferta)
                        }
                    });
                    selectedPriceText = offerPriceEl ? offerPriceEl.innerText : allPrices[allPrices.length - 1].innerText;
                } else {
                    // Un solo precio normal
                    selectedPriceText = allPrices[0].innerText;
                }
                
                const rawPrice = selectedPriceText.replace(/[^0-9,.]/g, "").replace(",", ".");
                price = parseFloat(rawPrice) || 0;
            }

            // Descripción (Fallback/Defecto)
            let description = "";
            const descEl = card.querySelector('span[class*="description"], div[class*="description"]');
            if (descEl) {
                description = descEl.innerText.trim();
            } else {
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

    // Remover cartel visual
    setTimeout(() => {
        if (toast.parentNode) document.body.removeChild(toast);
    }, 3000);

    if (products.length === 0) {
        console.warn("❌ No se detectaron productos. Asegúrate de estar con el catálogo abierto.");
        alert("No se encontraron productos. Por favor revisa que el catálogo esté visible en pantalla.");
        return;
    }

    console.log(`✅ ¡Éxito! Se interceptaron ${products.length} productos con sus precios reales.`);

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
