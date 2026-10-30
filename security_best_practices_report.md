# Informe de revisión de seguridad

## Resumen ejecutivo

Se revisó la aplicación Node.js/Express y su panel administrativo TypeScript. Se corrigieron los hallazgos de mayor impacto observados en el flujo actual: credenciales de ejemplo expuestas, token de webhook conocido por defecto, persistencia del token administrativo en almacenamiento accesible por JavaScript, falta de rate limiting específico para el panel, cabeceras defensivas incompletas y un sink de HTML innecesario para la vista previa del logo.

## Hallazgos corregidos

### SEC-001 — Alta — Credenciales administrativas de ejemplo en el HTML

- Ubicación: `src/presentation/admin/adminPage.ts`, formulario de acceso.
- Evidencia: el HTML contenía valores por defecto para teléfono y `admin-secret-2024`.
- Impacto: una credencial conocida podía facilitar acceso si se reutilizaba en despliegue.
- Corrección: se eliminaron los valores y se dejaron campos vacíos con placeholders.

### SEC-002 — Alta — Token de verificación de WhatsApp predecible

- Ubicación: `src/infrastructure/config/env.ts`.
- Evidencia: existía un valor secreto conocido como fallback de `WHATSAPP_VERIFY_TOKEN`.
- Impacto: un entorno sin configuración explícita podía aceptar una verificación no autorizada.
- Corrección: el fallback ahora es vacío; el secreto debe configurarse externamente.

### SEC-003 — Media — Token administrativo persistido en `sessionStorage`

- Ubicación: `src/presentation/admin/adminPage.ts`.
- Impacto: cualquier XSS en el mismo origen podía leer el token y reutilizarlo.
- Corrección: se eliminó la persistencia del token y del teléfono. Cada recarga requiere autenticación de nuevo.

### SEC-004 — Media — Falta de limitación de solicitudes administrativas

- Ubicación: `src/index.ts`, middleware `/api/admin`.
- Impacto: facilitaba intentos repetidos contra el token administrativo.
- Corrección: límite de 60 solicitudes por IP/minuto y respuesta `429` con `Retry-After`.

### SEC-005 — Media — Cabeceras HTTP defensivas incompletas

- Ubicación: `src/index.ts`.
- Corrección: se añadieron `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`. También se mantiene deshabilitado `X-Powered-By` mediante Helmet.

### SEC-006 — Media — Vista previa del logo mediante `innerHTML`

- Ubicación: `src/presentation/admin/adminPage.ts`.
- Impacto: aumentaba la superficie de DOM XSS si un valor de imagen persistido fuera manipulado.
- Corrección: la vista previa usa `document.createElement`, `replaceChildren` y asignación explícita de `src`.

## Riesgo residual

El panel Stitch todavía contiene scripts inline y carga Tailwind desde CDN, por lo que no se activó una CSP estricta completa sin refactorizar la plantilla visual. Helmet permanece activo y las cabeceras de framing/content-type están aplicadas. La siguiente mejora recomendada es extraer el JavaScript del panel a un recurso same-origin y aplicar CSP con nonce, además de fijar recursos CDN con SRI.

## Dependencias

Se ejecutó `npm audit fix` y se actualizó Zod a una versión corregida. El chequeo de producción `npm audit --omit=dev --audit-level=high` terminó con 0 vulnerabilidades reportadas.

## Revisión adicional del 30 de octubre de 2026

### SEC-007 — Alta — Webhook sin autenticación criptográfica

- Ubicación: `src/presentation/controllers/WhatsAppWebhookController.ts`, `handleWebhook`; `src/index.ts`, parser JSON.
- Evidencia: el endpoint aceptaba POST sin verificar `X-Hub-Signature-256`.
- Impacto: un tercero podía inyectar eventos y provocar respuestas o acciones de coexistencia.
- Corrección: se captura el cuerpo bruto y se valida HMAC-SHA256 con `WHATSAPP_APP_SECRET` para Cloud API.

### SEC-008 — Alta — BSUID/LID destruido durante el envío

- Ubicación: `src/infrastructure/whatsapp/CloudApiWhatsAppAdapter.ts`.
- Evidencia: `to.replace(/\D/g, '')` convertía identificadores de usuarios sin teléfono en una cadena numérica inválida.
- Impacto: el bot recibía el mensaje pero no podía responder a clientes protegidos por username.
- Corrección: los teléfonos siguen usando `to`; los BSUID se conservan íntegros en `recipient`.

### FUNC-001 — Alta — JavaScript del panel móvil inválido

- Ubicación: `src/presentation/admin/adminPage.ts`, renderizado de notificaciones.
- Evidencia: los handlers inline generaban `missing ) after argument list`; el navegador abortaba todo el script.
- Impacto: ningún botón o sección interactiva funcionaba, especialmente visible en móvil.
- Corrección: se eliminaron esos handlers inline y se usa delegación de eventos con atributos `data-*`.
