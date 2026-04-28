/**
 * sw.js — Service Worker básico para ERP Castfer PWA
 *
 * Objetivo: cumplir los requisitos técnicos mínimos para que Chrome
 * en Android muestre el prompt "Instalar Aplicación" (A2HS / PWA install).
 *
 * Estrategia de red: Network-First con bypass transparente.
 * No se cachean recursos pesados de Google Apps Script para evitar
 * problemas de stale-while-revalidate con contenido dinámico.
 *
 * Requisitos de instalación de Chrome que cubre este SW:
 * ✅ Archivo sw.js presente y registrado desde la shell.
 * ✅ El SW controla la página (fetch listener activo).
 * ✅ La app se sirve sobre HTTPS (responsabilidad del hosting).
 * ✅ manifest.json con display: "standalone" vinculado al HTML.
 */

'use strict';

const SW_VERSION = 'v1.0.1'; // Actualizado para forzar al navegador a tomar los cambios
const CACHE_NAME = `erp-castfer-shell-${SW_VERSION}`;

/**
 * Recursos de la App Shell que SÍ se cachean localmente.
 * Solo los archivos estáticos propios del hosting (no los de Google).
 */
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icon-192x192.png',
  './icon-512x512.png'
];

/* ================================================================
   EVENTO: install
   Pre-cachea la App Shell y fuerza la activación inmediata
   sin esperar a que se cierren pestañas existentes.
================================================================ */
self.addEventListener('install', function (event) {
  console.info(`[SW ${SW_VERSION}] Instalando...`);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        console.info(`[SW ${SW_VERSION}] Pre-cacheando App Shell...`);
        // addAll falla silenciosamente si algún icono no existe aún;
        // usamos Promise.allSettled-style manual para no bloquear la instalación.
        return Promise.all(
          SHELL_ASSETS.map(function (url) {
            return cache.add(url).catch(function (err) {
              console.warn(`[SW] No se pudo cachear: ${url}`, err);
            });
          })
        );
      })
      .then(function () {
        // Activa el SW inmediatamente sin esperar al ciclo de vida normal
        return self.skipWaiting();
      })
  );
});

/* ================================================================
   EVENTO: activate
   Limpia caches obsoletos de versiones anteriores del SW.
================================================================ */
self.addEventListener('activate', function (event) {
  console.info(`[SW ${SW_VERSION}] Activado.`);

  event.waitUntil(
    caches.keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function (name) { return name !== CACHE_NAME; })
            .map(function (name) {
              console.info(`[SW] Eliminando cache obsoleto: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(function () {
        // Toma el control de los clientes existentes de inmediato
        return self.clients.claim();
      })
  );
});

/* ================================================================
   EVENTO: fetch
   Estrategia: Network-First con fallback a cache para la App Shell.
   
   - Las peticiones al dominio de Google Apps Script se dejan pasar
     directamente a la red (bypass) para evitar servir contenido
     dinámico desactualizado.
   - Los assets propios de la shell se sirven desde cache si la red
     no está disponible (soporte offline básico).
================================================================ */
self.addEventListener('fetch', function (event) {
  // ── NUEVO: Ignorar esquemas no soportados (como chrome-extension://) ──
  if (!event.request.url.startsWith('http')) {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // ── Bypass total para Google Apps Script y otros dominios externos ──
  // No intentamos cachear ni interceptar sus respuestas.
  const isGoogleRequest = requestUrl.hostname.includes('google.com') ||
                          requestUrl.hostname.includes('googleusercontent.com') ||
                          requestUrl.hostname.includes('gstatic.com');

  if (isGoogleRequest) {
    // Deja pasar la petición a la red sin modificación
    return;
  }

  // ── Network-First para assets propios de la shell ──
  event.respondWith(
    fetch(event.request)
      .then(function (networkResponse) {
        // Si la red responde, actualiza el cache con la versión fresca
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(function () {
        // Sin red: intenta servir desde cache (soporte offline)
        return caches.match(event.request).then(function (cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Último recurso: sirve index.html para cualquier ruta de la shell
          return caches.match('./index.html');
        });
      })
  );
});