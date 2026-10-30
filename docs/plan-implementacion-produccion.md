# Plan de implementación y salida a producción

## Alcance del plan adjunto

El documento de arquitectura se trató como especificación de producto y no como instrucciones operativas automáticas. Se implementaron primero las piezas de mayor impacto y menor riesgo de regresión.

## Fase 1 — completada en esta iteración

- FSM ejecutable con estados de pedido, transiciones validadas, carrito, slots de entrega, pagos, FAQ con re-hook, jerga local y handoff tras dos fallos.
- Validador de firma `X-Hub-Signature-256`, verificación GET sin token vacío y validación básica del envelope Meta.
- Idempotencia atómica con `SET NX` en Redis y fallback local determinista para pruebas.
- Adaptador de publicación al panel con contrato `/api/v1/orders`, `Idempotency-Key`, timeout, reintentos con backoff+jitter y clasificación de errores.
- Guard de configuración para impedir arranques productivos con simulador, IA mock, base local o credenciales críticas ausentes.
- Timeout de OpenAI y límite configurable de iteraciones de herramientas.

## Fase 2 — obligatoria antes de producción

1. Persistir `OrderSession` junto con la conversación en Redis/PostgreSQL y conectar la FSM al `ProcessIncomingMessageUseCase` con una bandera de rollout.
2. Integrar `PanelOrderNotifier` en `NotifyKitchenUseCase` mediante outbox durable en PostgreSQL; procesar pendientes tras reinicio.
3. Hacer obligatorio Redis administrado TLS en despliegues multi-réplica; el fallback en memoria solo es válido para desarrollo y pruebas.
4. Añadir mensajes interactivos aprobados por Meta (listas para menú/tamaños y botones para pago) detrás de capacidades del adaptador.
5. Completar handoff con estado persistente, resolución por operador y activación automática ante fallo de panel/pago.

## Fase 3 — validación de release

- `npm test`, `npm run build` y `npm audit --omit=dev` sin fallos.
- Contract tests de Meta: firma, verificación, payloads, multimedia y mensajes interactivos.
- Prueba de carga con p50/p95/p99; objetivo p95 de texto simple menor a 1.5 s.
- Prueba con dos réplicas y Redis real: idempotencia, debounce y handoff.
- Ejecutar `REDIS_TEST_URL=rediss://... npm test -- tests/redis.integration.test.ts` en staging; sin esa variable la prueba queda omitida deliberadamente.
- Prueba de caída/recuperación del panel y reentrega desde outbox.
- Prueba manual de pedido completo, cambio de tamaño, FAQ durante el pedido, domicilio, Nequi/Daviplata/efectivo y transferencia humana.
- Smoke test del contenedor y rollback antes de promover tráfico.

## Criterio de promoción

No promover a producción mientras permanezcan pendientes la persistencia de la FSM, el outbox durable, Redis compartido operativo y las pruebas multi-réplica. La compilación y las pruebas unitarias actuales no sustituyen esas validaciones de infraestructura.
