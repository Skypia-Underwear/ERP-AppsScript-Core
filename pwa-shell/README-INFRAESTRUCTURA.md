# README — Infraestructura PWA Shell (App Shell ERP en Donweb)

> **Marca:** BlogShop · **Cliente de referencia:** Castfer  
> **Estado:** ✅ Producción  
> **Versión del documento:** 1.0.1 · 2026-04-27

---

## Resumen Ejecutivo

Este documento es el **SOP (Standard Operating Procedure)** estandarizado para replicar la infraestructura que encapsula un ERP generado con Google Apps Script dentro de una PWA (Progressive Web App) instalable, alojada en un servidor propio de Donweb bajo el subdominio del cliente.

El resultado es una aplicación que:
- Se instala como app nativa en Android (prompt A2HS de Chrome).
- Elimina la barra del navegador en modo `standalone`.
- Oculta la marca de Google Apps Script al usuario final.
- Funciona sobre un dominio propio con SSL válido.

---

## Índice

1. [Certificación SSL Manual (Bypass de Ferozo)](#1-certificación-ssl-manual-bypass-de-ferozo)
2. [Archivos Críticos del App Shell PWA](#2-archivos-críticos-del-app-shell-pwa)
3. [Ingeniería de Servidor (Los 2 Escudos .htaccess)](#3-ingeniería-de-servidor-los-2-escudos-htaccess)
4. [Próxima Fase (Pendiente)](#4-próxima-fase-pendiente)

---

## 1. Certificación SSL Manual (Bypass de Ferozo)

### Contexto

El panel de Ferozo/Donweb incluye un autoinstalador de Let's Encrypt. Sin embargo, en subdominios recién creados o en entornos con restricciones de propagación DNS, este autoinstalador puede fallar sin dar un error claro.

### Solución: PunchSalad (API de Let's Encrypt)

Se utilizó **[PunchSalad](https://punchsalad.com/)** como cliente web de Let's Encrypt para generar certificados de 90 días de forma manual.

#### Paso 1 — Validación de Propiedad del Dominio

PunchSalad entrega un **token de validación** que debe subirse al servidor para demostrar control del dominio.

```
Ruta requerida en el servidor:
public_html/system-erp/.well-known/acme-challenge/<TOKEN_AQUI>
```

> **Nota:** El archivo no tiene extensión. El contenido del archivo ES el token mismo (string alfanumérico).

El proceso de validación accede a:
```
http://subdominio.cliente.com/.well-known/acme-challenge/<TOKEN_AQUI>
```

#### Paso 2 — Instalación del Certificado en el Panel

Una vez que PunchSalad confirma la validación, entrega **dos archivos**:

| Archivo | Descripción |
|---|---|
| `.crt` | Certificado público (Certificate) |
| `.key` | Llave privada (Private Key) |

**En el panel de Ferozo/Donweb:**
1. Ir a `SSL/TLS` → `Administrador de Certificados SSL/TLS`.
2. Seleccionar el dominio/subdominio objetivo.
3. Pegar el contenido del `.crt` en el campo **Certificate**.
4. Pegar el contenido del `.key` en el campo **Private Key**.
5. Guardar. El certificado queda activo de inmediato.

> ⚠️ **Los certificados de Let's Encrypt vencen a los 90 días.** Repetir este proceso antes del vencimiento o configurar renovación automática.

---

## 2. Archivos Críticos del App Shell PWA

La App Shell reside en: `public_html/system-erp/`

### Estructura de archivos

```
system-erp/
├── index.html          ← Shell principal con el iframe
├── manifest.json       ← Configuración PWA instalable
├── sw.js               ← Service Worker (Network-First)
├── .htaccess           ← Escudo Raíz (ver Sección 3)
├── icon-192x192.png
├── icon-512x512.png
└── favicon.ico
```

---

### `index.html`

El archivo central de la Shell. Contiene:

- **Meta PWA:** `theme-color`, `apple-mobile-web-app-capable`, manifest link.
- **Loader CSS:** `div#loader` superpuesto con spinner animado y fade-out al cargar el iframe.
- **El iframe principal:** Apunta a la URL de despliegue de la Google Apps Script Web App.

#### Decisión de Arquitectura: iframe a 100vh limpio

> **Problema inicial:** Se evaluó usar un `margin-top: -36px` con `height: calc(100vh + 36px)` para recortar el banner de advertencia de Google Apps Script.
>
> **Decisión final:** Se descartó esta técnica. Se comprobó que Google **oculta automáticamente su banner** bajo contextos de sesión segura (HTTPS + dominio propio con SSL válido). El iframe usa `height: 100vh` limpio, lo que garantiza **resiliencia visual** ante futuros cambios en el DOM interno de Google.

```css
#erp-frame {
  display: block;
  border: none;
  width: 100vw;
  height: 100vh; /* Limpio: sin compensaciones CSS */
}
```

---

### `sw.js` — Service Worker v1.0.1

Estrategia **Network-First** para la App Shell con bypass para Google.

#### Fix crítico v1.0.1

Las extensiones de Chrome generan peticiones con el esquema `chrome-extension://`. Intentar interceptarlas dentro del Service Worker provoca el error:
```
Uncaught (in promise) TypeError: Failed to construct 'Request'
```

**Solución implementada al inicio del evento `fetch`:**
```javascript
self.addEventListener('fetch', function (event) {
  // Ignorar peticiones no HTTP (chrome-extension://, etc.)
  if (!event.request.url.startsWith('http')) return;
  // ... resto de la lógica
});
```

#### Lógica de caché

| Tipo de petición | Estrategia |
|---|---|
| Assets propios (shell) | Network-First → fallback a cache |
| `*.google.com`, `*.gstatic.com` | Bypass total (sin intercepción) |
| chrome-extension:// | Return inmediato (sin respondWith) |

---

### `manifest.json`

```json
{
  "name": "ERP Castfer",
  "short_name": "ERP",
  "display": "standalone",
  "start_url": "./index.html",
  "background_color": "#2c3e50",
  "theme_color": "#2c3e50"
}
```

> **`display: "standalone"`** es la propiedad crítica que elimina la barra del navegador al instalar la app en Android, generando la experiencia de app nativa.

#### Iconos en la Raíz

Requiere iconos en formato PNG en la raíz (`/system-erp/`):
- `icon-192x192.png` — Icono en launcher de Android.
- `icon-512x512.png` — Pantalla de splash y Play Store (si aplica).

Ambos deben declararse con `"purpose": "any maskable"` para compatibilidad con iconos adaptativos de Android 8+.

---

## 3. Ingeniería de Servidor (Los 2 Escudos .htaccess)

### Escudo Raíz — `/system-erp/.htaccess`

Este archivo resuelve **3 problemas** de servidor simultáneamente:

```apache
# 1. Desactivar el motor de reescritura heredado de WordPress
#    (el dominio padre puede tener WordPress y propagar RewriteRules que
#    rompen la navegación de la shell)
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# 2. Definir el index correcto para evitar Error 403
#    (sin esto, Apache busca index.php heredado de WordPress)
DirectoryIndex index.html

# 3. La redirección 301 a HTTPS es también requerida por Chrome
#    como condición para mostrar el prompt de instalación PWA.
```

| Problema | Causa | Solución |
|---|---|---|
| Error 403 al entrar al subdirectorio | Apache busca `index.php` por herencia | `DirectoryIndex index.html` |
| Redirección a HTTP | Reglas WP del dominio padre | `RewriteRule` forzado a HTTPS |
| Service Worker bloqueado | HTTPS requerido por spec | Mismo `RewriteRule` 301 |



---

### Permisos UNIX (CHMOD)

| Tipo | Permiso | Valor |
|---|---|---|
| Archivos | `644` | Owner: rw · Group: r · Others: r |
| Directorios | `755` | Owner: rwx · Group: rx · Others: rx |

Aplicar con el gestor de archivos del panel de Ferozo o por SSH:
```bash
find /public_html/system-erp -type f -exec chmod 644 {} \;
find /public_html/system-erp -type d -exec chmod 755 {} \;
```

---

## 4. Próxima Fase (Pendiente)

### Autenticación con Persistencia en el Dominio Propio

**Objetivo:** Implementar un sistema de Login (Correo + PIN) que no dependa del ciclo de sesión de Google, permitiendo al cliente entrar directamente al ERP sin reautenticarse cada vez.

**Arquitectura propuesta:**

```
[Login Shell en Donweb]
        │
        │ localStorage.setItem('erp_session', token)
        │
        ▼
[index.html]  ──── postMessage(token) ────►  [iframe GAS]
                                                  │
                                                  │ Valida token contra
                                                  │ BD en Google Sheets
                                                  ▼
                                            [ERP Interface]
```

**Componentes a desarrollar:**
- `login.html` — Página de login alojada en Donweb.
- Lógica de `localStorage` para persistencia de sesión entre visitas.
- Protocolo `postMessage` para comunicación segura entre el dominio de Donweb y el iframe de Google Apps Script.
- Endpoint de validación en Apps Script que reciba y verifique el token.

---

*Documento generado por el Agente Constructor · BlogShop ERP Infrastructure SOP*
