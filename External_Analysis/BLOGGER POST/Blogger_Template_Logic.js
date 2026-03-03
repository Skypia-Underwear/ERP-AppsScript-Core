/**
 * =================================================================
 * ARCHIVO: Blogger_Template_Logic.js
 * UBICACIÓN: /Blogger_Integration/
 * DESCRIPCIÓN: Código JavaScript para INYECTAR en la plantilla de Blogger (antes de </body>).
 * Actúa como "Puente" entre el botón HTML del post y tu sistema de carrito (localStorage/Ventas.js).
 * =================================================================
 */

// =============================================================
// --- PUENTE: POST BLOGGER -> CARRITO (Agrega esto en index.html) ---
// =============================================================

/**
 * Función que se activa al hacer clic en "AGREGAR AL PEDIDO" dentro de un post.
 * Lee el JSON incrustado en el botón y abre el modal de compra.
 * @param {HTMLElement} boton - El elemento botón que fue clickeado.
 */
function abrirModalDesdePost(boton) {
    // Verificación de seguridad
    if (typeof bootstrap === 'undefined' || typeof Swal === 'undefined') {
        alert("El sistema de tienda aún está cargando sus componentes. Por favor espera unos segundos.");
        return;
    }

    try {
        // 1. Extraemos los datos del botón
        const jsonRaw = boton.getAttribute('data-json');
        if (!jsonRaw) {
            console.error("Error: El botón no tiene datos de producto.");
            return;
        }

        const producto = JSON.parse(jsonRaw);
        console.log("📦 Producto cargado desde Post:", producto);

        // 2. Preparamos el Modal #modalProducto (reutilizando tu HTML existente)
        // Asumimos que existen los IDs: #titulo_producto_modal y #contenedor_opciones_compra
        $('#titulo_producto_modal').text(producto.nombre);

        // Limpiamos el contenedor donde se muestran las opciones de compra
        const contenedor = document.getElementById('contenedor_opciones_compra');
        if (contenedor) {
            contenedor.innerHTML = '';

            // 3. Renderizamos las Variedades (Precios)
            // Usamos un diseño de tarjeta simple que encaje con Bootstrap
            if (producto.variedad && producto.variedad.length > 0) {
                producto.variedad.forEach((v, index) => {
                    const precio = parseFloat(v.precio);
                    const minima = parseInt(v.cantidadMinima) || 1;
                    const stockSimulado = 9999; // Asumimos stock infinito para posts directos (o podrías pasarlo en el JSON)

                    // Escapamos strings para evitar errores en el onclick
                    const codSafe = producto.codigo.replace(/'/g, "\\'");
                    const nomSafe = producto.nombre.replace(/'/g, "\\'");
                    const varSafe = v.variedad.replace(/'/g, "\\'");

                    const htmlOpcion = `
                    <div class="card mb-2 shadow-sm" style="background-color: var(--bs-body-bg, #fff); border: 1px solid var(--bs-border-color, #dee2e6);">
                        <div class="card-body p-2 d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-0 fw-bold" style="color: var(--bs-heading-color, #212529);">${v.variedad}</h6>
                                <small class="text-muted">Pack: ${minima} u.</small>
                            </div>
                            <div class="text-end">
                                <div class="fw-bold text-primary fs-5 mb-1">$${precio}</div>
                                <div class="d-flex align-items-center justify-content-end">
                                    <input type="number" id="qty_${index}" value="1" min="1" class="form-control form-control-sm text-center me-2 bg-light border-secondary" style="width: 55px; color: var(--bs-body-color, #000);">
                                    <button class="btn btn-sm btn-outline-success fw-bold"
                                            onclick="bridge_agregarAlCarrito('${codSafe}', '${nomSafe}', '${varSafe}', ${precio}, ${minima}, document.getElementById('qty_${index}').value)">
                                        <i class="fa fa-plus"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                    contenedor.innerHTML += htmlOpcion;
                });
            } else {
                contenedor.innerHTML = '<p class="text-center text-muted">No hay opciones de precio disponibles.</p>';
            }

            // 4. Mostramos el modal usando Bootstrap 5
            var modalEl = document.getElementById('modalProducto');
            var modal = new bootstrap.Modal(modalEl);
            modal.show();
        } else {
            console.error("Error: No se encontró el contenedor #contenedor_opciones_compra en el DOM.");
            Swal.fire("Error UI", "No se encontró el modal de compra.", "error");
        }

    } catch (e) {
        console.error("Error bridge:", e);
        Swal.fire("Error", "No se pudieron procesar los datos del producto.", "error");
    }
}

/**
 * Agrega directamente al carrito la primera variedad disponible.
 */
function bridge_agregarDirectamente(boton) {
    const jsonRaw = boton.getAttribute('data-json');
    if (!jsonRaw) return;
    try {
        const producto = JSON.parse(jsonRaw);
        if (producto.variedad && producto.variedad.length > 0) {
            const v = producto.variedad[0];
            const codSafe = producto.codigo.replace(/'/g, "\\'");
            const nomSafe = producto.nombre.replace(/'/g, "\\'");
            const varSafe = v.variedad.replace(/'/g, "\\'");
            bridge_agregarAlCarrito(codSafe, nomSafe, varSafe, parseFloat(v.precio), v.cantidadMinima, 1);
        }
    } catch (e) {
        console.error("Error al agregar rápido:", e);
    }
}

/**
 * Función intermedia para conectar con tu lógica de 'seleccionar_variedad'
 * sin necesitar todos los parámetros complejos de categoría que usa tu sistema SPA.
 */
function bridge_agregarAlCarrito(codigo, nombreProducto, variedad, precio, minima, qtyInput = 1) {
    // Definimos valores por defecto para satisfacer a la función original
    const categoriaFicticia = "POST_BLOGGER";
    const moneda = "$"; // Asumimos moneda por defecto
    const cantidad = parseInt(qtyInput) || 1; // Usamos la cantidad de *packs* que el usuario quiere
    const talle = null; // No gestionamos talle en esta vista simplificada
    const stock = 9999;

    console.log(`🛒 Bridge: Agregando ${nombreProducto} (${variedad}) x ${cantidad}`);

    // Llamamos a tu función ORIGINAL 'seleccionar_variedad' que ya existe en tu index.html
    // Asegúrate de que esta función sea accesible globalmente.
    if (typeof seleccionar_variedad === 'function') {
        seleccionar_variedad(
            categoriaFicticia,
            codigo,
            variedad,
            precio,
            moneda,
            minima,
            cantidad,
            talle,
            stock
        );

        // Feedback visual tipo Toast
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 1500,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });
        Toast.fire({ icon: 'success', title: '¡Agregado al carrito!' });

        // Cerramos el modal de selección para que el usuario pueda seguir viendo o ir al carrito
        // Usamos jQuery para cerrar el modal de Bootstrap si está disponible
        if (typeof $ !== 'undefined') {
            $('#modalProducto').modal('hide');
        }

        // OPCIONAL: Abrir sidebar del carrito automáticamente
        if (typeof openSidebarCarrito === 'function') {
            setTimeout(openSidebarCarrito, 500);
        }

    } else {
        console.error("Error Crítico: La función 'seleccionar_variedad' no existe o no se cargó.");
        Swal.fire("Error", "No se pudo conectar con el carrito de compras.", "error");
    }
}

// =============================================================
// --- MEJORAS DE UI (PRECIOS EN TARJETAS Y CARRITO RESPONSIVE) ---
// =============================================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. Mostrar Precio estilo WooCommerce en las tarjetas de inicio
    // Busca los títulos de los posts. En Emporio, suelen ser <h3 class="post-title"><a ...>Texto</a></h3>
    const titles = document.querySelectorAll('.post-title, .post-title a');
    titles.forEach(el => {
        // Solo procesar si el elemento contiene texto directo y el separador '|'
        const text = el.textContent || "";
        if (el.children.length === 0 && text.includes('|')) {
            const parts = text.split('|');
            const tituloLimpio = parts[0].trim();
            const precioTexto = parts[1].trim();

            // Reemplazamos el texto por HTML parseado
            el.innerHTML = `
                <span class="d-block" style="white-space: normal; line-height: 1.2;" title="${tituloLimpio}">${tituloLimpio}</span>
                <span class="d-inline-block mt-2 badge bg-success bg-opacity-10 text-success border border-success fs-6 px-2 py-1 shadow-sm">
                    ${precioTexto}
                </span>
            `;
        }
    });

    // 2. Inyectar CSS Dinámico para el Sidebar del Carrito en Móviles
    const style = document.createElement('style');
    style.innerHTML = `
        @media (max-width: 576px) {
            #cartSidebar.offcanvas {
                width: 85vw !important;
            }
        }
        /* Ajuste opcional para no opacar el precio */
        .post-title {
            line-height: inherit !important;
        }
    `;
    document.head.appendChild(style);

    // 3. Ocultar Botón Flotante del Carrito al Abrir Modales/Sidebars
    const cartSidebar = document.getElementById('cartSidebar');
    const btnFlotante = document.getElementById('floating-cart-btn');
    const modalCheckout = document.getElementById('modalCheckout');

    if (btnFlotante) {
        if (cartSidebar) {
            cartSidebar.addEventListener('show.bs.offcanvas', () => {
                btnFlotante.style.display = 'none';
            });
            cartSidebar.addEventListener('hidden.bs.offcanvas', () => {
                // Solo mostrar si el modal de checkout NO está abierto
                if (!modalCheckout || !modalCheckout.classList.contains('show')) {
                    btnFlotante.style.display = 'block';
                }
            });
        }

        if (modalCheckout) {
            modalCheckout.addEventListener('show.bs.modal', () => {
                btnFlotante.style.display = 'none';
            });
            modalCheckout.addEventListener('hidden.bs.modal', () => {
                // Solo mostrar si el sidebar NO está abierto
                if (!cartSidebar || !cartSidebar.classList.contains('show')) {
                    btnFlotante.style.display = 'block';
                }
            });
        }
    }
});
