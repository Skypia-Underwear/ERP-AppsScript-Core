# Opciones de Integración de Facturación Electrónica AFIP / ARCA

Este documento recopila las alternativas viables para añadir facturación electrónica (ex AFIP, actual ARCA) al ERP en sus diferentes interfaces (AppSheet, Web App y Google Apps Script backend), priorizando la simplicidad de desarrollo, la seguridad de las credenciales y el costo de mantenimiento.

---

## Contexto del Problema y Desafío Criptográfico
Para emitir facturas electrónicas con validez fiscal en Argentina, es necesario comunicarse con los Web Services de AFIP/ARCA:
1. **WSAA (Autenticación y Autorización):** Requiere firmar digitalmente un ticket de requerimiento de acceso (TRA) utilizando un certificado digital (`.crt`) y una clave privada (`.key`) bajo el estándar PKCS#7 / CMS (criptografía RSA).
2. **WSFEv1 (Facturación):** Requiere consumir servicios SOAP (XML) enviando el token y firma obtenidos del WSAA.

**Limitación de Google Apps Script:** 
Al correr en los servidores de Google, Apps Script no posee soporte nativo para criptografía PKCS#7. Implementarlo en JS puro mediante librerías (como *Forge*) es lento, ineficiente en el motor V8 de Google, consume demasiados recursos de ejecución y puede superar el límite de tiempo de 6 minutos de Apps Script. Por ello, la facturación directa desde GAS es desaconsejada.

A continuación, se detallan las **3 opciones alternativas** viables para el ERP.

---

## Opción 1: API SaaS de Terceros (Recomendada - Conexión con TusFacturas.app u otros)
Consiste en delegar la lógica criptográfica de AFIP y SOAP a un servicio SaaS especializado en Argentina que expone una API REST moderna.

```
+------------+        HTTP POST JSON        +--------------------+        WS AFIP/ARCA
| ERP (GAS)  | ===========================> | SaaS API Provider  | ====================>
| / AppSheet | <=========================== | (TusFacturas.app)  | <====================
+------------+      Devuelve CAE y PDF     +--------------------+     CAE Autorizado
```

### ⚙️ Flujo de Trabajo
1. **Registro:** Se da de alta la cuenta en el SaaS (por ejemplo, [TusFacturas.app](https://www.tusfacturas.app/)) y se delega el certificado de AFIP (homologación/producción) al servicio en el portal de AFIP.
2. **Llamada desde el ERP:** Al concretar una venta (desde AppSheet mediante un bot webhook, o desde la Web App invocando a Apps Script), el ERP realiza una petición HTTP POST sencilla (`UrlFetchApp.fetch`) con los datos del comprobante en JSON.
3. **Respuesta instantánea:** El SaaS interactúa con AFIP, autoriza el comprobante y devuelve el número de CAE, fecha de vencimiento y el enlace al PDF listo de la factura.
4. **Sincronización:** Apps Script registra el CAE en la fila de la venta en Google Sheets y actualiza el estado en AppSheet y la Web App en tiempo real.

* **Dificultad de Desarrollo:** Muy Baja (Integración vía API estándar en un par de días).
* **Costo de Infraestructura:** Variable (Abono mensual bajo del SaaS según volumen de comprobantes).
* **Seguridad:** Alta (Tus certificados están delegados en un backend que cumple con normativas de seguridad, sin exponer claves en tu código).
* **Preguntas clave para hacerle al proveedor (TusFacturas.app):**
  * ¿Tienen entorno de pruebas (SandBox / Homologación) para desarrollo sin costo?
  * ¿Cuál es el límite de llamadas por minuto (Rate Limits) en sus endpoints?
  * ¿Proporcionan un Webhook de confirmación o la respuesta es 100% síncrona en la petición HTTP POST?

---

## Opción 2: Exportación e Importación de Lotes (CSV / TXT)
Método clásico asíncrono para facturar en bloque utilizando las herramientas nativas de carga masiva que provee la web de AFIP/ARCA.

```
+-----------+    Genera TXT/CSV    +-------------------+    Sube a AFIP    +---------------+
| ERP (GAS) | ===================> | Descarga local    | ================> | Comprobantes  |
| Base Datos|                      | de Archivo Lote   |                   | en Línea Web  |
+-----------+                      +-------------------+                   +---------------+
      ^                                                                            |
      |                     Sube TXT de respuesta con CAEs                         v
      +============================================================================+
```

### ⚙️ Flujo de Trabajo
1. **Generación del Lote:** En el ERP, el administrador filtra las ventas del día o de la semana listas para facturar y presiona un botón: **"Generar Lote Facturación AFIP"**.
2. **Descarga:** El ERP (a través de Apps Script) genera y descarga un archivo en formato de texto plano estructurado según el manual de diseño de registros de AFIP (posiciones fijas de caracteres).
3. **Subida manual:** El usuario ingresa a la web de AFIP en el servicio **"Comprobantes en Línea"** o **"Facturador Plus"** y sube el archivo generado. AFIP procesa las facturas y emite los comprobantes.
4. **Cierre de ciclo:** AFIP genera un archivo de texto de respuesta con los CAEs otorgados. El usuario sube este archivo de texto de vuelta al ERP para que Apps Script actualice la base de datos de Sheets.

* **Dificultad de Desarrollo:** Baja (Implementación puramente de formateo de texto en Apps Script).
* **Costo de Infraestructura:** $0 (Gratuito).
* **Pros:** Sin dependencias externas ni costos de APIs; control total del proceso de facturación en lote.
* **Contras:** Operación manual y asíncrona; no sirve para emitir facturas en el momento exacto de la venta frente al cliente.

---

## Opción 3: Extensión de Navegador o Script de Auto-completado (Semiautomático)
Una solución híbrida que automatiza el copiado de datos desde el ERP hacia la web de AFIP en tiempo real a nivel cliente.

```
+------------------+                   Lectura DOM                    +-------------------+
|  Web App ERP     | <==============================================> | Extensión Chrome  |
| (Venta Abierta)  |                                                  | (Tampermonkey/JS) |
+------------------+                                                  +-------------------+
                                                                                |
                                                                                | Autocompleta
                                                                                v
                                                                      +-------------------+
                                                                      | Web AFIP / ARCA   |
                                                                      | (Factura en Línea)|
                                                                      +-------------------+
```

### ⚙️ Flujo de Trabajo
1. **Activación:** Se instala una extensión de Chrome o script de usuario (como Tampermonkey) en el navegador del administrador del ERP.
2. **Navegación:** El administrador abre la venta en el ERP y, en otra pestaña, abre el formulario de emisión de AFIP.
3. **Autocompletado:** El script lee dinámicamente los datos de la venta abierta en el ERP (CUIT del cliente, tipo de factura, descripción, precios, IVA) y rellena de forma instantánea todos los campos del formulario de la web de AFIP con un solo clic.
4. **Confirmación:** El usuario revisa visualmente los campos completados y presiona "Confirmar" en AFIP para generar la factura.

* **Dificultad de Desarrollo:** Media-Baja (Desarrollo en Javascript vanilla orientado al DOM).
* **Costo de Infraestructura:** $0 (Gratuito).
* **Pros:** Seguridad visual total (el usuario aprueba cada factura antes de emitirse); ideal para volúmenes pequeños/medianos.
* **Contras:** Sensible a cambios estéticos y estructurales en el portal web de AFIP (si AFIP actualiza su código de frontend, la extensión debe ser adaptada); requiere uso exclusivo en computadoras de escritorio.

---

## Matriz de Decisión para el ERP

| Criterio | Opción 1: API SaaS | Opción 2: CSV / TXT Lote | Opción 3: Extensión |
| :--- | :--- | :--- | :--- |
| **Tiempo de desarrollo** | 1 - 2 días | 2 - 3 días | 3 - 5 días |
| **Complejidad Técnica** | Muy Baja | Baja | Media-Baja |
| **Mantenimiento** | Muy Bajo (a cargo del SaaS) | Bajo | Medio (sujeto a web AFIP) |
| **Integración AppSheet** | Completa (vía Webhooks) | No disponible | No disponible |
| **Inmediatez (Tiempo Real)** | Sí (Segundos) | No (Diferido/Lotes) | Sí (Con intervención) |
| **Costo Operativo** | Costo del plan de API | Gratis | Gratis |
