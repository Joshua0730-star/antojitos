# Guía de revisión de la app y registro insertado

## URLs públicas

- Política de privacidad: `https://api.josmar.com.co/politica-privacidad`
- Eliminación de datos: `https://api.josmar.com.co/eliminacion-datos`
- Webhook: `https://api.josmar.com.co/webhook`

Antes de enviar la revisión, publicar también estas páginas en el sitio principal si Meta exige que el dominio de la app sea `josmar.com.co`, y confirmar que `privacidad@josmar.com.co` sea un buzón operativo.

## Flujo de prueba

1. Abrir la URL de lanzamiento del registro insertado desde el portal del negocio.
2. Iniciar sesión con un usuario de prueba agregado a la app.
3. Crear o seleccionar la cuenta de WhatsApp Business de prueba.
4. Agregar/verificar el número de prueba y compartir la cuenta con la solución.
5. Confirmar que el backend recibe los eventos en `/webhook` y responde HTTP 200.
6. Enviar un mensaje de prueba y comprobar la respuesta del bot.
7. Solicitar eliminación desde la página pública y comprobar la atención de la solicitud.

## Guion breve para el vídeo

Mostrar, sin enseñar tokens ni datos personales: (a) la URL pública y el estado HTTPS, (b) el inicio del registro insertado, (c) la selección de la cuenta de prueba, (d) la recepción del evento en el backend y (e) la política de privacidad y el formulario/correo de eliminación.
