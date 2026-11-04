# Plan prioritario de mejora para AntojitosBot

## Objetivo

Convertir el bot de WhatsApp en un sistema confiable de atención y pedidos,
donde la IA ayude a comprender y redactar mensajes, pero no sea la fuente de
verdad de precios, pagos, estados de pedidos ni acciones operativas.

## Prioridad 0 — Seguridad transaccional antes de escalar

1. Separar los estados `comprobante recibido`, `pago en revisión`, `pago
   verificado` y `pedido enviado a cocina`.
2. Impedir que `notificar_cocina` marque un pago como verificado solo porque el
   modelo envió una referencia Nequi.
3. Reservar referencias de pago con una operación atómica y rechazar carreras
   concurrentes; conservar el comprobante original de forma inmutable.
4. Cambiar los IDs de orden `ANT-XXXX` por UUID o una secuencia segura.
5. Corregir todas las transacciones PostgreSQL para usar un `PoolClient` único
   entre `BEGIN` y `COMMIT`.
6. Mantener la escritura de orden y auditoría en una misma transacción. El
   outbox externo queda condicionado a que exista un consumidor HTTP real;
   el panel actual funciona dentro de este servicio y lee PostgreSQL.
7. Idempotencia persistente de pedidos: el `messageId` de WhatsApp viaja por
   el debounce y la IA hasta `bot_orders.idempotency_key`, protegido por un
   índice único. Los reintentos del mismo evento reutilizan la orden existente.

### Requisito de despliegue del outbox

Si posteriormente se despliega un panel externo, antes de activarlo deben existir:

- `ENABLE_ORDER_OUTBOX=true`;
- `PANEL_API_URL` apuntando al endpoint HTTPS real del panel;
- `PANEL_API_TOKEN` si el panel exige autenticación.

La revisión actual de Cloud Run no necesita `PANEL_API_URL`: el panel integrado
recibe los pedidos mediante `bot_orders` y `admin_notifications` en PostgreSQL.

## Prioridad 1 — Conversación, identidad y continuidad

### Contexto durante intervención humana

Cuando un operador responde, el sistema marca el inicio de la intervención.
Los mensajes del operador y del cliente recibidos durante la pausa se guardan
en el historial persistente. Al reactivarse el bot, la ventana de contexto:

- incluye prioritariamente los mensajes desde el inicio de la intervención;
- conserva solo los últimos `MAX_CONTEXT_MESSAGES` mensajes de ese periodo;
- completa los espacios restantes con el contexto inmediatamente anterior;
- deja como siguiente mejora la reducción de imágenes grandes antes de
  persistirlas o reenviarlas al modelo;
- limpia la marca de reanudación después de preparar el turno del bot.

Esto permite recuperar acuerdos como producto, tamaño, toppings, domicilio,
forma de pago y cambios hechos por el personal sin hacer crecer el prompt de
forma ilimitada.

### Trabajo siguiente

1. ✅ Recuperación distribuida del debounce: los buffers tienen una marca de
   vencimiento e índice compartido en Redis; cualquier réplica puede recuperar
   el turno si la réplica original pierde su temporizador local. Se conserva el
   bloqueo por conversación y una retención de buffer de 10 minutos.
2. Crear una identidad canónica que relacione teléfono, BSUID, LID y JID.
3. Persistir el carrito y la sesión FSM como estado validado, no solo como
   historial de mensajes.
4. Añadir una operación atómica para registrar mensajes humanos y mensajes del
   cliente durante el handoff.

## Prioridad 2 — Operación profesional

1. Panel con roles, MFA, sesiones rotables y autorización por acción.
2. Rate limiting distribuido y auditoría con actor real.
3. Métricas centralizadas por conversación, pedido, pago, proveedor y outbox.
4. Alertas para pagos pendientes, pedidos no enviados, reintentos agotados y
   conversaciones bloqueadas.
5. Pruebas con dos réplicas, PostgreSQL y Redis reales.

## Prioridad 3 — Producto y control del negocio

1. Unificar la FSM y el catálogo para eliminar precios codificados en dos sitios.
2. Versionar catálogo, precios, disponibilidad y recetas.
3. Integrar conciliación bancaria o revisión humana formal para comprobantes.
4. Añadir inventario reservado por pedido y movimientos idempotentes.
5. Implementar políticas de retención, eliminación y anonimización de datos.

## Criterios para declarar producción

- Ningún pago puede quedar verificado por decisión del LLM.
- Ninguna transacción administrativa puede usar `Pool.query('BEGIN')`.
- Dos réplicas no deben duplicar ni perder mensajes.
- Una intervención humana debe ser recuperable con su contexto completo y
  limitado.
- Una caída del panel debe recuperarse desde outbox sin duplicar pedidos.
- CI debe ejecutar build, pruebas unitarias, integración y concurrencia.
