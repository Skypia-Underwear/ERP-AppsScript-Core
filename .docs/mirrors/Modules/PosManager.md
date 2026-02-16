# Mirror Doc: PosManager.js (Modules)

## 🎯 Objetivo
El motor de ventas omnicanal. Orquesta la experiencia del Punto de Venta (TPV) físico y asegura que el catálogo esté siempre disponible y actualizado en cualquier plataforma externa (GitHub, Donweb).

## 🧠 Lógica de Negocio
- **Omnicanalidad Real:** Publica el catálogo completo en formato JSON hacia servidores externos para alimentar aplicaciones móviles o sitios web de terceros.
- **Caché de Alto Rendimiento:** Usa `CacheService` para servir el stock en tiempo real en milisegundos, permitiendo ventas rápidas sin esperas de servidor.
- **Venta Atómica:** Registra ventas complejas (pagos mixtos, múltiples métodos, recargos dinámicos) y descuenta stock instantáneamente en toda la red de tiendas.
- **Gestión de Cajas:** Valida la apertura de cajas por asesor y tienda para garantizar la trazabilidad financiera del efectivo en el local.

## 🔄 Interacciones
- **Interfaz:** Motor de `pos_view.html`.
- **Sincronización:** Conecta con GitHub API y servidores Donweb para respaldo externo.
- **Integración:** Actualiza `BD_VENTAS_PEDIDOS` y `BD_DETALLE_VENTAS`.

## 💰 Valor de Usuario (Publicidad)
**"Vende en Todas Partes, Controla en Un Lugar":** Tu local físico y tu tienda online compartiendo el mismo stock y el mismo catálogo. Atiende a tus clientes en el mostrador con la velocidad de un rayo y publica tus productos en la web con un clic. Es la madurez digital para tu negocio minorista.
