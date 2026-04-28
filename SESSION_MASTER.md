# SESSION MASTER — ERP BlogShop / Castfer

> Archivo de continuidad de sesión. Actualizar al final de cada jornada de trabajo.

---

## 📅 Sesión: 2026-04-27

**Agente:** Antigravity (Claude Sonnet 4.6 Thinking)  
**Colaborador externo:** Agente Gemini (gemini.google.com)  
**Rol del Ideador:** Arquitecto y validador de decisiones técnicas en campo.

---

## ✅ Qué se completó hoy

### Fase: Infraestructura PWA Shell para ERP Castfer en Donweb

#### 1. Certificación SSL ✅
- Se obtuvo un certificado SSL de 90 días para el subdominio del cliente mediante **PunchSalad** (API de Let's Encrypt), como bypass al autoinstalador de Ferozo que falló.
- Validación de propiedad: token subido a `public_html/system-erp/.well-known/acme-challenge/`.
- Instalación manual de `.crt` y `.key` en el panel de Ferozo.

#### 2. App Shell PWA generada ✅

Archivos en `pwa-shell/`:

| Archivo | Versión | Estado |
|---|---|---|
| `index.html` | v1.0.1 | ✅ Producción |
| `manifest.json` | v1.0.0 | ✅ Producción |
| `sw.js` | v1.0.1 | ✅ Producción |

**Decisiones de arquitectura registradas:**
- **iframe a 100vh limpio:** Se descartó el truco `margin-top: -36px`. Google oculta el banner automáticamente en HTTPS. Implementado en `index.html` v1.0.1.
- **Fix chrome-extension://:** `sw.js` v1.0.1 agrega `if (!event.request.url.startsWith('http')) return;` al inicio del evento `fetch` para evitar errores de consola por extensiones de Chrome.

#### 3. Ingeniería de servidor ✅
- **Escudo Raíz** (`/system-erp/.htaccess`): `DirectoryIndex index.html`, `RewriteEngine On` → fuerza HTTPS 301.
- **Escudo de Assets** (`/icons/.htaccess`): `<FilesMatch>` con `Require all granted` para evadir el Anti-Hotlink del dominio padre.
- **Permisos:** CHMOD 644 archivos / 755 directorios confirmados.

#### 4. Documentación ✅
- `pwa-shell/README-INFRAESTRUCTURA.md` generado — SOP completo para replicar en futuros clientes de la marca BlogShop.

---

## 🔜 Próxima sesión — Pendiente

### Fase: Autenticación con Persistencia (Login Shell)

| Tarea | Prioridad | Estado |
|---|---|---|
| Crear `login.html` en Donweb con form Correo + PIN | Alta | ⏳ Pendiente |
| Implementar `localStorage` para persistencia de sesión | Alta | ⏳ Pendiente |
| Protocolo `postMessage` entre Donweb ↔ iframe GAS | Alta | ⏳ Pendiente |
| Endpoint de validación de token en Apps Script | Alta | ⏳ Pendiente |

**Contexto técnico para la próxima sesión:**
- El dominio de la shell es Donweb (subdominio del cliente).
- El iframe apunta a Google Apps Script (`script.google.com`).
- La comunicación cross-origin requiere `postMessage` + listener en el GAS con validación de `event.origin`.
- La persistencia de sesión se guarda en `localStorage` del dominio Donweb, NO en el iframe.

---

## 📁 Estructura del repositorio relevante

```
Macros HostingShop/
└── pwa-shell/
    ├── index.html                  ← App Shell (v1.0.1)
    ├── manifest.json               ← PWA Manifest
    ├── sw.js                       ← Service Worker (v1.0.1)
    └── README-INFRAESTRUCTURA.md   ← SOP BlogShop (este doc es la fuente)
```

---

## 🔗 Referencias clave

| Recurso | Valor |
|---|---|
| URL Web App GAS | `https://script.google.com/macros/s/AKfycbySMq7IZrZMhXE2wZAH-4YCLV8S-VpwjiTcKMAa1jonor7Zyjd2IdJo1EHZMs9WJahSKg/exec` |
| Herramienta SSL | [PunchSalad](https://punchsalad.com/) |
| Panel de hosting | Ferozo / Donweb |
| Directorio servidor | `public_html/system-erp/` |

---

*Última actualización: 2026-04-27T22:38 ART · Agente: Antigravity*
