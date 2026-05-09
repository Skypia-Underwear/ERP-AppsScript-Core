const fs = require('fs');
const path = require('path');

// Configuración de rutas
const SRC_DIR = path.join(__dirname, '../..', 'src');
const WEB_DIR = path.join(SRC_DIR, 'Web');
const CONFIG_FILE = path.join(__dirname, 'config', 'clients.json');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const DIST_BASE_DIR = path.join(__dirname, 'dist');

function build() {
  console.log("🛠️  Iniciando construcción de PWA Standalone (V2)...");

  if (!fs.existsSync(CONFIG_FILE)) {
    console.error("❌ Error: No se encontró clients.json");
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

  Object.entries(config).forEach(([key, client]) => {
    console.log(`\n📦 Procesando cliente: ${client.name} (${client.id})`);

    const clientDistDir = path.join(DIST_BASE_DIR, client.id);
    if (fs.existsSync(clientDistDir)) {
      fs.rmSync(clientDistDir, { recursive: true, force: true });
    }
    fs.mkdirSync(clientDistDir, { recursive: true });

    // 1. Preparar el Bridge
    let bridgeContent = fs.readFileSync(path.join(TEMPLATES_DIR, 'api-bridge.js'), 'utf8');
    bridgeContent = bridgeContent.replace('{{GAS_URL}}', client.gas_url);
    fs.writeFileSync(path.join(clientDistDir, 'api-bridge.js'), bridgeContent);

    // 2. Procesar Archivos HTML
    const files = fs.readdirSync(WEB_DIR);

    files.forEach(file => {
      if (file.endsWith('.html')) {
        let content = fs.readFileSync(path.join(WEB_DIR, file), 'utf8');

        // --- Lógica de Inclusión (Procesar <?!= include(...) ?>) ---
        content = processIncludes(content);

        // Forzar que el PWA inicie en Auditoría para evitar el módulo Home problemático
        content = content.replace("loadView('welcome'", "loadView('sale_dashboard'");

        // --- Inyección del Bridge ---
        content = injectBridge(content);

        // --- Limpieza Quirúrgica de etiquetas GAS ---
        content = cleanupGasTags(content);

        // Determinar nombre de salida
        let outputFileName = file;
        if (file === 'systemContainer.html') {
          outputFileName = 'index.html';
          console.log(`  🏠 Estableciendo ${file} como index.html principal.`);
        }

        fs.writeFileSync(path.join(clientDistDir, outputFileName), content);
        console.log(`  📄 Compilando: ${outputFileName}`);
      }
    });

    console.log(`✅ Construcción completada para ${client.name}.`);
    console.log(`📂 Ubicación: ${clientDistDir}`);
  });
}

function processIncludes(html, stack = new Set()) {
  const includeRegex = /<\?!=?\s*include\(['"]([^'"]+)['"]\)\s*;\s*\?>/g;
  const gasIncludeRegex = /<\?!=?\s*HtmlService\.createHtmlOutputFromFile\(['"]([^'"]+)['"]\)\.getContent\(\)\s*;\s*\?>/g;

  const replacer = (match, fileName) => {
    let normalizedName = fileName.replace(/^Web\//, '').replace(/^Utils\//, '');
    if (stack.has(normalizedName)) return `<!-- Circular Include: ${fileName} -->`;

    let filePath = path.join(WEB_DIR, normalizedName + (normalizedName.includes('.') ? '' : '.html'));
    if (!fs.existsSync(filePath)) filePath = path.join(SRC_DIR, normalizedName + (normalizedName.includes('.') ? '' : '.html'));

    if (fs.existsSync(filePath)) {
      let includeContent = fs.readFileSync(filePath, 'utf8');
      const newStack = new Set(stack);
      newStack.add(normalizedName);
      return processIncludes(includeContent, newStack);
    }
    return `<!-- Error: ${fileName} not found -->`;
  };

  return html.replace(includeRegex, replacer).replace(gasIncludeRegex, replacer);
}

function injectBridge(html) {
  const scriptTag = '\n    <!-- PWA API Bridge -->\n    <script src="api-bridge.js"></script>\n';
  const metaTag = '<meta charset="UTF-8">\n';

  let result = html;
  if (!result.includes('charset="UTF-8"')) result = metaTag + result;

  if (result.includes('<head>')) {
    return result.replace('<head>', '<head>' + scriptTag);
  }
  return scriptTag + result;
}

function cleanupGasTags(html) {
  let result = html;

  // Eliminar bloques condicionales de GAS pero mantener lógica de PWA
  result = result.replace(/<\?if\s*\(.*isEmbedded.*\)\s*{\?>[\s\S]*?<\?}\?>/g, '');
  result = result.replace(/<\?\s*if\s*\(.*?\)\s*{\s*\?>/g, '');
  result = result.replace(/<\?\s*}\s*\?>/g, '');
  result = result.replace(/<\?\s*else\s*{\s*\?>/g, '');

  // --- TRANSFORMACIONES DE SEGURIDAD (DESACTIVADAS POR RIESGO DE SINTAXIS) ---
  // Se recomienda escribir código seguro directamente en los fuentes.

  // Reemplazar variables inyectadas por Google por valores seguros (Configuración de Producción Donweb)
  if (html.includes('CATALOG_URL')) {
    result = result.replace(/['"]<\?!=?\s*CATALOG_URL\s*\?>['"]/g, "'https://castfer.com.ar/api_json_read.php?file=castfersystemv1-201513855-catalog-tpv.json'");
    result = result.replace(/['"]<\?!=?\s*CATALOG_URL_FALLBACK\s*\?>['"]/g, "'https://raw.githubusercontent.com/Skypia-Underwear/api-tienda/main/castfersystemv1-201513855-catalog-tpv.json'");
  }
  
  result = result.replace(/['"]<\?!=?\s*initialParams\s*\?>['"]/g, "''");

  // Limpieza final de cualquier etiqueta residual de GAS
  result = result.replace(/<\?!=?[\s\S]*?\?>/g, '');

  // Limpiar comentarios HTML huérfanos o vacíos (el "código sucio" -->)
  result = result.replace(/<!---->/g, '');
  result = result.replace(/^\s*-->/gm, ''); // Elimina cierres de comentario al inicio de línea

  return result;
}

build();
