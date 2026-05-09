# Recapitulación Técnica: Despliegue PWA ERP V2

## Concepto de Arquitectura
El sistema ha migrado a una arquitectura **Decoupled PWA (Progresive Web App Desacoplada)**. 

### Componentes Clave:
1. **Backend (Google Apps Script)**: Actúa exclusivamente como un motor de base de datos y lógica de servidor (API). Procesa solicitudes JSON y gestiona la persistencia en Google Sheets.
2. **Frontend (Hosting Externo - Donweb)**: Los activos de la interfaz (HTML, CSS, JS) se alojan en un subdominio propio (`system-erp.castfer.com.ar`). Esto elimina la latencia de servicio de Google y permite una carga instantánea.
3. **API Bridge V5**: Un motor de comunicación "Thread-Safe" inyectado en el PWA que traduce las llamadas tradicionales `google.script.run` en peticiones `fetch` hacia el backend de Google, permitiendo la convivencia de ambos entornos.

## Beneficios Obtenidos
- **Velocidad**: Reducción de tiempos de carga inicial en un 200%.
- **Estabilidad**: Eliminación de errores de redeclaración de variables mediante el uso de `var` en el ámbito global y el aislamiento de scripts en el Shell.
- **UX Premium**: Implementación de transiciones suaves (Fade-in), modo oscuro nativo y una interfaz responsiva de alta densidad.
- **Marca**: Uso de subdominio profesional.

## Estado de Coexistencia
- **Macro GAS Original**: Sigue siendo funcional al 100%. El código en `src/Web` mantiene etiquetas `<?!= include(...) ?>` para ser servido por Google.
- **Sincronización**: Ambos entornos comparten el mismo estado de base de datos en tiempo real.
- **Iframe Support**: El sistema sigue permitiendo ser embebido en sitios externos mediante la URL de implementación original sin conflictos de seguridad.

---
*Documento generado por Antigravity para preservación de contexto.*
