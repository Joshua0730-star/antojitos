# Análisis de chats y replay del bot

Fecha de corte: 3 de noviembre de 2026 (America/Bogota).

## Alcance real

La base PostgreSQL configurada contiene **53 chats**, **650 mensajes** y **211 mensajes de clientes**. Por tanto, no existen 100 chats pasados disponibles para analizar; no se fabricaron conversaciones históricas. De esos chats, 140 respuestas fueron enviadas por personal humano y se revisaron como contexto de coexistencia/handoff.

Para cumplir la validación solicitada, se reprodujeron **100 mensajes históricos de clientes** tomados de esos 53 chats. Son 100 turnos, no 100 conversaciones independientes. El replay se ejecuta con:

```bash
npx tsx scripts/analyze-and-replay.ts --limit=100
```

El script consulta el historial actual, clasifica el contexto, pasa cada mensaje por el enrutador rápido real y reporta cobertura y brevedad. No envía mensajes a clientes reales ni modifica la base.

## Patrones encontrados

- Los clientes escriben por ráfagas y dejan datos en mensajes separados: “13mil”, “domi”, dirección, “efectivo”, “me pasas el número”. El contexto anterior es indispensable.
- Aparecen pedidos con varias unidades y tamaños mezclados: 13/15/18/20 mil, toppings distintos por unidad y pagos mixtos.
- El personal humano interviene por agotados, cambios de horario, confirmaciones de domicilio, pagos ya realizados y mensajes que no corresponden al catálogo.
- También hubo mensajes sobre pollo, sopas, mondongo y gaseosa. Si se entregan al modelo sin un filtro temprano, existe riesgo de que improvise productos y precios.
- “¿Cuánto sería con el domi?” no contiene suficiente información para calcular un total. La respuesta correcta es pedir producto/presentación, sin iniciar el pedido ni inventar el domicilio.

## Cambios aplicados

- Ampliado el enrutamiento de expresiones coloquiales: `domi`, `transferencia`, `consignar`, “me pasas la cuenta”, “mándame el número”, “hoy trabajan”, “a cómo están” y consultas de precio incompletas.
- La ubicación devuelve una respuesta corta con Pueblo Bello y pregunta la modalidad.
- Las respuestas rápidas de pago se mantienen informativas y no revelan el número de pago antes de confirmar el pedido.
- Añadido bloqueo de productos ajenos al catálogo para que el bot redirija a fresas con crema, obleas, ensaladas y sándwiches.
- Añadidas pruebas de regresión para expresiones coloquiales y productos fuera de catálogo.

## Resultado del replay

En la ejecución de 100 mensajes:

- Cobertura del enrutador rápido: **12%**. El porcentaje bajo es esperado: 65 mensajes eran respuestas cortas dependientes de un turno anterior (“sí”, “bueno”, “leche condensada”, referencias o datos), que deben resolverse con el historial/LLM/FSM, no como FAQ aislada.
- Respuestas rápidas dentro de 320 caracteres: **100%**.
- Contexto humano revisado: 140 mensajes; predominan conversaciones no-FAQ y pedidos con cambios de disponibilidad o logística.

## Verificación

- `npm run build`: correcto.
- `npm test`: **109 pruebas aprobadas**, 2 omitidas por integración Redis.
- No se enviaron mensajes reales ni se alteraron conversaciones de clientes durante el replay.

## Siguiente mejora recomendada

Para medir “acierto” de forma completa hace falta una etiqueta de resultado por conversación —pedido correcto, dato faltante, derivación o error— y, de ser posible, 100 chats independientes. El script actual deja la medición repetible y separa explícitamente cobertura de FAQ de turnos que requieren contexto.
