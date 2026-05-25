# 🛡️ Estándar de Codificación de Caracteres y Sintaxis Segura (PROYECTO ERP)

Este estándar tiene como objetivo prevenir errores críticos de compilación del lado del cliente provocados por la corrupción de caracteres (como acentos, eñes o emojis) durante la transpilación y sanitización en Google Apps Script (**compilador Caja**).

---

## 🚫 CARACTERES PROHIBIDOS (CORRUPCIÓN Y MANGLED BYTES)

Queda terminantemente **PROHIBIDO** escribir, reescribir o confirmar archivos de código que contengan:
- El caracter de reemplazo Unicode **`\uFFFD`** (visualizado comúnmente como ``).
- Secuencias de bytes rotas o mal formadas procedentes de codificaciones heredadas como OEM-850 o Windows-1252 (por ejemplo, ver combinaciones como `├│`, `├│`).

**Razón:** Apps Script / Caja procesa e inyecta dinámicamente los elementos de script de forma muy estricta en el DOM del cliente (`executeScripts`). Si detecta estos bytes corruptos, aborta silenciosamente la inserción arrojando:
`Uncaught SyntaxError: Failed to execute 'insertBefore' on 'Node': Invalid or unexpected token`
Esto provoca que todo el código del archivo quede inhabilitado en el navegador del usuario.

---

## ⚙️ REGLAS DE CODIFICACIÓN Y ESCRITURA (MANDATORIO PARA LA IA)

### 1. Codificación Forzada (UTF-8)
- Todos los archivos fuente (`.html`, `.js`, `.json`, `.css`) deben leerse, editarse y guardarse estrictamente en formato **UTF-8 (sin BOM)** y con saltos de línea **LF (`\n`)**.
- Respeta rigurosamente las reglas definidas en [.editorconfig](file:///c:/Users/USER/OneDrive/Documents/Proyecto_Web/Macros%20HostingShop/.editorconfig).

### 2. Configuración y Blindaje Automático de Consola (Windows PowerShell)
- Al ejecutar comandos de terminal (como `clasp push`, `git` o scripts de Node), es obligatorio que la consola de comandos se comunique en UTF-8 para evitar que interprete secuencias de múltiples bytes como caracteres ANSI heredados y corrompa el código.
- Para automatizar esto en cualquier nueva computadora de desarrollo, ejecuta este comando único en Windows PowerShell (creará y configurará tu perfil de usuario de forma permanente):
  ```powershell
  if (!(Test-Path $PROFILE)) { New-Item -Type File -Path $PROFILE -Force }; Add-Content $PROFILE "`n`$OutputEncoding = [System.Text.Encoding]::UTF8; [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [System.Console]::InputEncoding = [System.Text.Encoding]::UTF8"
  ```

---

## 🔍 PROTOCOLO DE VALIDACIÓN RÁPIDA (EFICIENCIA DE CUOTAS)

Para evitar el uso de prompts extensos y costosos (que consumen la cuota de contexto e inteligencia del usuario), el agente debe validar sus cambios usando este **método de bajo coste**:

### Búsqueda Regex Directa y Local
Antes de dar por completado un cambio o realizar un `clasp push`, realiza un escaneo rápido del contenido modificado utilizando la herramienta de búsqueda local (`grep_search` o un script de Node extremadamente liviano) para validar que no haya caracteres corruptos.
* **Regex de caracter prohibido:** `\uFFFD` o ``
* **Comando ultra-rápido de validación local:**
  ```powershell
  node -e "if (require('fs').readFileSync('ruta/al/archivo.html', 'utf8').includes('\uFFFD')) { console.error('ERROR: Caracter corrupto detectado'); process.exit(1); }"
  ```
- **Si el escaneo pasa limpio**, el código se considera seguro para sincronizar de inmediato.

---

## ⚠️ MANDATO PARA EL AGENTE
- **Obligatorio:** Lee este estándar antes de realizar cualquier edición de archivos en `src/`.
- No intentes corregir problemas de codificación a través de suposiciones en prompts largos; usa el comando de validación local que no consume cuota de token.

---

## 🔧 SCRIPT DE LIMPIEZA REUTILIZABLE (Para uso del desarrollador)

Se dispone de un script Node.js persistente que puede ser ejecutado directamente por el desarrollador **sin necesitar al agente**:

```
Ubicación: C:\Users\USER\.gemini\antigravity-ide\brain\98c70f12-6526-4450-8cd7-7796e30f1e5c\scratch\fix_mojibake.js
```

### Cómo usarlo (desde la raíz del proyecto en PowerShell):
```powershell
node "C:\Users\USER\.gemini\antigravity-ide\brain\98c70f12-6526-4450-8cd7-7796e30f1e5c\scratch\fix_mojibake.js"
```

**Características:**
- ✅ Escanea **todos** los archivos `.html` en `src/Web/`
- ✅ Detecta y corrige 20+ patrones Mojibake conocidos (binario + escapes literales)
- ✅ Es **idempotente** — se puede correr múltiples veces sin riesgo
- ✅ Muestra un reporte detallado con qué corrigió en qué archivo
- ✅ No modifica archivos limpios

