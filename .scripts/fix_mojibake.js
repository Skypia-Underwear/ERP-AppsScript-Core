/**
 * fix_mojibake.js — Limpiador de caracteres Mojibake para src/Web/
 * =================================================================
 * USO: Desde la terminal, en la raiz del proyecto:
 *   node .scripts/fix_mojibake.js
 *
 * Detecta y corrige secuencias de bytes Mojibake (Windows-1252 mal
 * reinterpretadas como UTF-8) en todos los archivos .html de src/Web/.
 * 
 * Es seguro correrlo múltiples veces (idempotente).
 * Si no encuentra nada, lo informa y no modifica nada.
 */

const fs = require('fs');
const path = require('path');

// Ruta relativa al directorio de trabajo (raiz del proyecto)
const webDir = path.join(__dirname, '../src/Web');

if (!fs.existsSync(webDir)) {
  console.error('ERROR: No se encontro el directorio src/Web. Ejecuta este script desde la raiz del proyecto.');
  process.exit(1);
}

const files = fs.readdirSync(webDir).filter(f => f.endsWith('.html'));
console.log('Escaneando ' + files.length + ' archivos HTML en src/Web/ ...\n');

// =====================================================================
// MAPA DE SECUENCIAS MOJIBAKE (nivel binario)
// Bytes en disco (UTF-8 del texto Mojibake) -> caracter correcto
// =====================================================================
const mojibakeBytes = [
  // Vocales minúsculas con tilde aguda
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0xA1]), replace: '\u00e1', name: 'á (Ã¡)' },
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0xA9]), replace: '\u00e9', name: 'é (Ã©)' },
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0xAD]), replace: '\u00ed', name: 'í (Ã­)' },
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0xB3]), replace: '\u00f3', name: 'ó (Ã³)' },
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0xBA]), replace: '\u00fa', name: 'ú (Ãº)' },
  // Vocales mayúsculas con tilde aguda
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0x81]), replace: '\u00c1', name: 'Á (Ã\x81)' },
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0x89]), replace: '\u00c9', name: 'É (Ã\x89)' },
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0x8D]), replace: '\u00cd', name: 'Í (Ã\x8D)' },
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0x9A]), replace: '\u00da', name: 'Ú (Ã\x9A)' },
  // Secuencias extendidas para É, Ó, Ñ (via W1252 extendido)
  { bytes: Buffer.from([0xC3, 0x83, 0xE2, 0x80, 0xB0]), replace: '\u00c9', name: 'É extendido (Ã‰)' },
  { bytes: Buffer.from([0xC3, 0x83, 0xE2, 0x80, 0x9C]), replace: '\u00d3', name: 'Ó extendido (Ã")' },
  { bytes: Buffer.from([0xC3, 0x83, 0xE2, 0x80, 0xA0]), replace: '\u00d1', name: 'Ñ extendido (Ã†)' },
  // Ñ minúscula y mayúscula simple
  { bytes: Buffer.from([0xC3, 0x83, 0xC2, 0xB1]), replace: '\u00f1', name: 'ñ (Ã±)' },
  // Signos de puntuación especiales
  { bytes: Buffer.from([0xC3, 0x82, 0xC2, 0xBF]), replace: '\u00bf', name: '¿ (Â¿)' },
  { bytes: Buffer.from([0xC3, 0x82, 0xC2, 0xA1]), replace: '\u00a1', name: '¡ (Â¡)' },
  // Comillas tipográficas y em dash
  { bytes: Buffer.from([0xC3, 0xA2, 0xE2, 0x82, 0xAC, 0xE2, 0x80, 0x94]), replace: '\u2014', name: '— em dash (â€")' },
  { bytes: Buffer.from([0xC3, 0xA2, 0xE2, 0x82, 0xAC, 0xE2, 0x80, 0x99]), replace: '\u2019', name: "' apostrophe (â€™)" },
  { bytes: Buffer.from([0xC3, 0xA2, 0xE2, 0x82, 0xAC, 0xC5, 0x93]),       replace: '\u201c', name: '" open quote (â€œ)' },
  { bytes: Buffer.from([0xC3, 0xA2, 0xE2, 0x82, 0xAC, 0xC2, 0xA2]),       replace: '\u2022', name: '• bullet (â€¢)' },
  // Caracter de reemplazo Unicode (U+FFFD) — indica corrupcion grave
  { bytes: Buffer.from([0xEF, 0xBF, 0xBD]), replace: '', name: 'U+FFFD (caracter de reemplazo)' },
];

// Secuencias de escape escritas literalmente como texto (no como char)
const literalEscapes = [
  { search: '\\u00e2\\u20ac\\u201d', replace: '\u2014', name: 'em dash literal (\\u00e2...)' },
  { search: '\\u0192\\u00c2\\u00b3',  replace: '\u00f3', name: 'ó mojibake antiguo (\\u0192...)' },
  { search: '\\u00e2\\u20ac\\u00a2',  replace: '\u2022', name: 'bullet literal (\\u00e2...)' },
];

function countInBuffer(buf, searchBuf) {
  let count = 0, idx = 0;
  while ((idx = buf.indexOf(searchBuf, idx)) !== -1) { count++; idx += searchBuf.length; }
  return count;
}

function replaceInBuffer(buf, searchBuf, replaceBuf) {
  const parts = [];
  let prev = 0, idx = 0;
  while ((idx = buf.indexOf(searchBuf, prev)) !== -1) {
    parts.push(buf.slice(prev, idx));
    parts.push(replaceBuf);
    prev = idx + searchBuf.length;
  }
  parts.push(buf.slice(prev));
  return Buffer.concat(parts);
}

const report = [];
let totalFixed = 0;

files.forEach(file => {
  const fullPath = path.join(webDir, file);
  let buf = fs.readFileSync(fullPath);
  let fileFixed = 0;

  mojibakeBytes.forEach(m => {
    const count = countInBuffer(buf, m.bytes);
    if (count > 0) {
      report.push('  [BINARY] ' + file + ' | ' + count + 'x | ' + m.name);
      buf = replaceInBuffer(buf, m.bytes, Buffer.from(m.replace, 'utf8'));
      fileFixed += count;
      totalFixed += count;
    }
  });

  let text = buf.toString('utf8');
  let textFixed = 0;
  literalEscapes.forEach(le => {
    const count = (text.split(le.search).length - 1);
    if (count > 0) {
      report.push('  [LITERAL] ' + file + ' | ' + count + 'x | ' + le.name);
      text = text.split(le.search).join(le.replace);
      textFixed += count;
      totalFixed += count;
    }
  });

  if (fileFixed > 0 || textFixed > 0) {
    fs.writeFileSync(fullPath, textFixed > 0 ? Buffer.from(text, 'utf8') : buf);
    console.log('✔ FIXED: ' + file + ' (' + (fileFixed + textFixed) + ' correcciones)');
  }
});

console.log('');
if (report.length > 0) {
  console.log('=== DETALLE ===');
  report.forEach(r => console.log(r));
  console.log('---');
  console.log('TOTAL corregidas: ' + totalFixed);
} else {
  console.log('✅ Todos los archivos HTML estan limpios. Sin Mojibake detectado.');
}
