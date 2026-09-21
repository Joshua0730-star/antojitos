# 🍓 AntojitosBot - Virtual AI Agent para WhatsApp

Agente virtual inteligente diseñado con **Clean Architecture** (Arquitectura Limpia) en **TypeScript / Node.js** para la atención automatizada, toma de pedidos, verificación OCR anti-fraude de comprobantes Nequi y despacho directo a cocina para el negocio **Antojitos**.

---

## 🏛 Arquitectura del Sistema (Clean Architecture)

El proyecto sigue estrictamente la separación de responsabilidades en capas concéntricas:

```
antojitos-bot/
├── src/
│   ├── domain/                  # Lógica pura del negocio (Sin dependencias de frameworks)
│   │   ├── entities/            # Order, OrderItem, Customer, NequiReceipt
│   │   ├── value-objects/       # Money (COP), OrderStatus
│   │   └── repositories/        # Interfaces (IOrderRepository, INequiReceiptRepository, IConversationRepository)
│   ├── application/             # Casos de uso y reglas de aplicación
│   │   ├── use-cases/           # ProcessIncomingMessage, ValidateNequiReceipt, NotifyKitchen, GetCatalog
│   │   └── ports/               # Interfaces de salida (IWhatsAppService, IAIService, IVisionService)
│   ├── infrastructure/          # Adaptadores e implementaciones técnicas
│   │   ├── ai/                  # OpenAI (GPT-4o), Gemini (2.0 Flash) y Mock con Tool Calling
│   │   ├── vision/              # Extracción estructurada OCR para comprobantes Nequi
│   │   ├── whatsapp/            # WhatsApp Cloud API, Evolution API y SimulatorAdapter
│   │   ├── persistence/         # Repositorios atómicos en disco JSON / SQLite
│   │   ├── di/                  # Contenedor de Inyección de Dependencias (Container)
│   │   └── config/              # Catálogo JSON dinámico, system prompt oficial y variables de entorno
│   ├── presentation/            # Puntos de entrada
│   │   ├── controllers/         # Controlador de Webhooks de WhatsApp (Express)
│   │   └── cli/                 # Simulador interactivo en terminal para pruebas de chat
│   └── index.ts                 # Bootstrap del servidor e inyección de dependencias
├── data/
│   └── catalog.json             # Catálogo oficial de productos, precios y personalizaciones
├── tests/                       # Pruebas unitarias y de integración E2E
├── dist/                        # Código compilado a JavaScript (ES2022)
├── package.json
└── tsconfig.json
```

---

## 🚀 Características Clave Implementadas

1. **Tool Calling Oficial (Herramientas de IA)**:
   - `obtener_catalogo`: Consulta dinámica de productos, toppings y adiciones sin alucinaciones.
   - `validar_comprobante_nequi`: Extracción estructurada y validación de comprobantes.
   - `notificar_cocina`: Notificación formateada al equipo de preparación.
2. **Sistema Anti-Fraude de Comprobantes Nequi**:
   - Extracción de número de referencia (ej: `M12345678`), fecha y monto.
   - Validación de fecha (debe ser del día de hoy).
   - Validación de monto (debe cubrir el valor total de la orden).
   - **Unicidad de Referencia**: Validación contra la base de datos interna para impedir la reutilización de capturas viejas.
3. **Manejo Inteligente de Llamadas**:
   - Detecta eventos de llamada entrante en WhatsApp y responde de inmediato con el mensaje cortés configurado, sin consumir tokens de IA.
4. **Soporte Dual de Proveedor de IA**:
   - Compatible con **OpenAI (GPT-4o)** y **Google Gemini (2.0 Flash)** con solo cambiar una variable en `.env`.
   - Incluye un modo **Mock** que permite probar toda la lógica y simulación sin necesidad de API keys.
5. **Simulador Interactivo CLI**:
   - Permite chatear con el bot en tiempo real desde la consola de comandos, simular envío de comprobantes y ver la alerta despachada a cocina.

---

## 🛠 Instalación y Configuración

### 1. Variables de Entorno
Copia el archivo de ejemplo y configura tus claves:
```bash
cp .env.example .env
```

Configura tu proveedor de preferencia en `.env`:
```ini
AI_PROVIDER=openai # o "gemini" o "mock"
OPENAI_API_KEY=tu_clave_aqui
WHATSAPP_PROVIDER=simulator # o "cloud_api"
PORT=3000
```

---

## 💻 Comandos Disponibles

### Iniciar el Simulador Interactivo (Recomendado para probar ya)
```bash
npm run simulate
```
En el simulador puedes interactuar escribiendo:
- Saludos o pedidos: `"Hola, quiero unas fresas con crema"`
- Especificar opciones: `"Grande con queso y chispas"`
- Dirección: `"A domicilio para Carlos en Cra 15 # 45-20 Torre B"`
- Simular comprobante Nequi: `/comprobante 16000`
- Simular llamada de voz: `/llamada`
- Reiniciar conversación: `/limpiar`

### Ejecutar Pruebas Automatizadas
```bash
npm test
```
Ejecuta los 11 tests unitarios y de integración end-to-end con Vitest.

### Compilar el Proyecto
```bash
npm run build
```

### Iniciar el Servidor de Producción / Webhooks
```bash
npm run dev
# o tras compilar:
npm start
```

Endpoints disponibles:
- `GET /health` -> Estado del servicio y proveedores activos.
- `GET /api/orders` -> Listado de pedidos registrados.
- `GET /webhook` -> Verificación de WhatsApp Cloud API (Meta).
- `POST /webhook` -> Recepción de mensajes y eventos de WhatsApp.
