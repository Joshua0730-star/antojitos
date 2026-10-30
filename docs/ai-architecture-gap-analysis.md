# Revisión de arquitectura de IA

## Estado actual

El sistema ya implementa seis capacidades importantes: enrutamiento rápido de intenciones, debounce y lotes por conversación, idempotencia, locks, optimización del contexto, persistencia PostgreSQL, llamadas estructuradas a herramientas y guardrails de entrada/salida.

## Brechas prioritarias

1. **Redis compartido:** el adaptador soporta Redis, pero Cloud Run aún cae al mapa en memoria cuando no existe `REDIS_URL`. Ese fallback no es consistente entre réplicas y no debe ser la fuente de verdad para idempotencia, pausas humanas ni lotes distribuidos.
2. **Estado estructurado:** el pedido y la modalidad de entrega deben mantenerse en PostgreSQL como estado validado, no depender solo del contexto que entrega el modelo.
3. **Caché semántico:** conviene añadirlo después de conectar Redis, únicamente para respuestas deterministas (menú, horarios, políticas). No se debe cachear información personalizada, pagos o conversaciones.
4. **Observabilidad:** añadir métricas de latencia, ratio de errores, cache hit/miss, mensajes duplicados, validaciones Nequi pendientes y pausas humanas.
5. **Seguridad de API:** el endpoint de órdenes debe protegerse con autenticación administrativa; no debe quedar público en producción.
6. **Comprobantes:** OCR/visión es una señal de validación, no confirmación bancaria definitiva. Los casos dudosos deben pasar a revisión humana o a una API de pagos.

## Técnicas recomendadas por impacto

| Técnica | Beneficio | Coste/Complejidad | Orden |
| --- | --- | --- | --- |
| Redis administrado con TLS | Consistencia entre réplicas y locks reales | Bajo/medio | Ahora |
| Estado de pedido con esquema y transiciones | Evita que el LLM invente totales o pasos | Medio | Siguiente |
| Caché de respuestas deterministas | Menor latencia y coste de tokens | Bajo | Siguiente |
| Métricas y trazas con correlación | Diagnóstico de fallos reales | Medio | Siguiente |
| RAG híbrido de catálogo/políticas | Mejor búsqueda cuando crezca el catálogo | Medio | Más adelante |
| Reranking y modelos pequeños | Útil con muchas consultas/documentos | Alto | No necesario aún |
| vLLM/paged attention/speculative decoding | Solo para modelos autoalojados | Alto | No aplica a OpenAI actual |

## Redis de producción

El Redis interno del contenedor de Evolution está en la red Docker del VPS y no debe exponerse directamente a Internet. La opción recomendada para Cloud Run es un Redis administrado con TLS (por ejemplo, Upstash o Redis Cloud). La aplicación acepta una URL `rediss://...` mediante `REDIS_URL`; el valor debe inyectarse como secreto en Cloud Run, nunca commitearse ni guardarse en el frontend.
