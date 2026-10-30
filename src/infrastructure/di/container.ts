import { ENV } from '../config/env.js';
import { FileOrderRepository } from '../persistence/FileOrderRepository.js';
import { FileNequiReceiptRepository } from '../persistence/FileNequiReceiptRepository.js';
import { SQLiteConversationRepository } from '../persistence/SQLiteConversationRepository.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { INequiReceiptRepository } from '../../domain/repositories/INequiReceiptRepository.js';
import { IConversationRepository } from '../../domain/repositories/IConversationRepository.js';
import { getPostgresPool } from '../persistence/PostgresDatabase.js';
import { PostgresOrderRepository } from '../persistence/PostgresOrderRepository.js';
import { PostgresNequiReceiptRepository } from '../persistence/PostgresNequiReceiptRepository.js';
import { PostgresConversationRepository } from '../persistence/PostgresConversationRepository.js';
import { GetCatalogUseCase } from '../../application/use-cases/GetCatalogUseCase.js';
import { ValidateNequiReceiptUseCase } from '../../application/use-cases/ValidateNequiReceiptUseCase.js';
import { NotifyKitchenUseCase } from '../../application/use-cases/NotifyKitchenUseCase.js';
import { ProcessIncomingMessageUseCase } from '../../application/use-cases/ProcessIncomingMessageUseCase.js';
import { ToolExecutor } from '../ai/ToolExecutor.js';
import { IVisionService } from '../../application/ports/IVisionService.js';
import { IAIService } from '../../application/ports/IAIService.js';
import { IWhatsAppService } from '../../application/ports/IWhatsAppService.js';
import { MockVisionService } from '../vision/MockVisionService.js';
import { OpenAIVisionService } from '../vision/OpenAIVisionService.js';
import { GeminiVisionService } from '../vision/GeminiVisionService.js';
import { MockAIService } from '../ai/MockAIService.js';
import { OpenAIAIService } from '../ai/OpenAIAIService.js';
import { GeminiAIService } from '../ai/GeminiAIService.js';
import { SimulatorWhatsAppAdapter } from '../whatsapp/SimulatorWhatsAppAdapter.js';
import { CloudApiWhatsAppAdapter } from '../whatsapp/CloudApiWhatsAppAdapter.js';
import { EvolutionApiWhatsAppAdapter } from '../whatsapp/EvolutionApiWhatsAppAdapter.js';

import { ICacheService, RedisService } from '../cache/RedisService.js';
import { IdempotencyService } from '../../application/services/IdempotencyService.js';
import { ContextOptimizerService } from '../../application/services/ContextOptimizerService.js';
import { MessageDebouncerService } from '../../application/services/MessageDebouncerService.js';
import { CoexistenceService } from '../../application/services/CoexistenceService.js';
import { IntentRouterService } from '../../application/services/IntentRouterService.js';
import { GuardrailsService } from '../../application/services/GuardrailsService.js';
import { ObservabilityService } from '../../application/services/ObservabilityService.js';
import { OperatingScheduleService } from '../../application/services/OperatingScheduleService.js';

export interface AppContainer {
  orderRepository: IOrderRepository;
  receiptRepository: INequiReceiptRepository;
  conversationRepository: IConversationRepository;
  visionService: IVisionService;
  aiService: IAIService;
  whatsAppService: IWhatsAppService;
  cacheService: ICacheService;
  idempotencyService: IdempotencyService;
  contextOptimizer: ContextOptimizerService;
  debouncerService: MessageDebouncerService;
  coexistenceService: CoexistenceService;
  intentRouter: IntentRouterService;
  guardrailsService: GuardrailsService;
  getCatalogUseCase: GetCatalogUseCase;
  validateReceiptUseCase: ValidateNequiReceiptUseCase;
  notifyKitchenUseCase: NotifyKitchenUseCase;
  processIncomingMessageUseCase: ProcessIncomingMessageUseCase;
  toolExecutor: ToolExecutor;
  observability: ObservabilityService;
  operatingSchedule: OperatingScheduleService;
}

export function createContainer(overrides?: Partial<AppContainer>): AppContainer {
  // 1. Repositorios
  const postgresPool = ENV.DATABASE_PROVIDER === 'postgres' ? getPostgresPool() : undefined;
  const orderRepository = overrides?.orderRepository ||
    (postgresPool ? new PostgresOrderRepository(postgresPool) : new FileOrderRepository());
  const receiptRepository = overrides?.receiptRepository ||
    (postgresPool ? new PostgresNequiReceiptRepository(postgresPool) : new FileNequiReceiptRepository());
  const conversationRepository = overrides?.conversationRepository ||
    (postgresPool ? new PostgresConversationRepository(postgresPool) : new SQLiteConversationRepository());

  // 2. WhatsApp Service
  let whatsAppService: IWhatsAppService;
  if (overrides?.whatsAppService) {
    whatsAppService = overrides.whatsAppService;
  } else if (ENV.WHATSAPP_PROVIDER === 'evolution_api' && ENV.EVOLUTION_API_URL && ENV.EVOLUTION_API_KEY && ENV.EVOLUTION_API_INSTANCE) {
    whatsAppService = new EvolutionApiWhatsAppAdapter({
      baseUrl: ENV.EVOLUTION_API_URL,
      apiKey: ENV.EVOLUTION_API_KEY,
      instance: ENV.EVOLUTION_API_INSTANCE,
      kitchenPhoneNumber: ENV.KITCHEN_PHONE_NUMBER
    });
  } else if (ENV.WHATSAPP_PROVIDER === 'cloud_api' && ENV.WHATSAPP_TOKEN && ENV.WHATSAPP_PHONE_NUMBER_ID) {
    whatsAppService = new CloudApiWhatsAppAdapter({
      accessToken: ENV.WHATSAPP_TOKEN,
      phoneNumberId: ENV.WHATSAPP_PHONE_NUMBER_ID,
      kitchenPhoneNumber: ENV.KITCHEN_PHONE_NUMBER
    });
  } else {
    whatsAppService = new SimulatorWhatsAppAdapter();
  }

  // 3. Vision Service
  let visionService: IVisionService;
  if (overrides?.visionService) {
    visionService = overrides.visionService;
  } else if (ENV.AI_PROVIDER === 'openai' && ENV.OPENAI_API_KEY) {
    visionService = new OpenAIVisionService(ENV.OPENAI_API_KEY, ENV.OPENAI_MODEL);
  } else if (ENV.AI_PROVIDER === 'gemini' && ENV.GEMINI_API_KEY) {
    visionService = new GeminiVisionService(ENV.GEMINI_API_KEY, ENV.GEMINI_MODEL);
  } else {
    visionService = new MockVisionService();
  }

  // 4. Casos de Uso
  const getCatalogUseCase = overrides?.getCatalogUseCase || new GetCatalogUseCase();
  const validateReceiptUseCase =
    overrides?.validateReceiptUseCase ||
    new ValidateNequiReceiptUseCase(visionService, receiptRepository);
  const notifyKitchenUseCase =
    overrides?.notifyKitchenUseCase ||
    new NotifyKitchenUseCase(whatsAppService, orderRepository);

  const toolExecutor =
    overrides?.toolExecutor ||
    new ToolExecutor(getCatalogUseCase, validateReceiptUseCase, notifyKitchenUseCase);

  // 5. Motor de IA
  let aiService: IAIService;
  if (overrides?.aiService) {
    aiService = overrides.aiService;
  } else if (ENV.AI_PROVIDER === 'openai' && ENV.OPENAI_API_KEY) {
    aiService = new OpenAIAIService(ENV.OPENAI_API_KEY, ENV.OPENAI_MODEL, toolExecutor);
  } else if (ENV.AI_PROVIDER === 'gemini' && ENV.GEMINI_API_KEY) {
    aiService = new GeminiAIService(ENV.GEMINI_API_KEY, ENV.GEMINI_MODEL, toolExecutor);
  } else {
    aiService = new MockAIService(toolExecutor);
  }

  // 6. Optimización, Caching, Intent Routing y Guardrails
  const cacheService = overrides?.cacheService || new RedisService();
  const idempotencyService = overrides?.idempotencyService || new IdempotencyService(cacheService);
  const contextOptimizer = overrides?.contextOptimizer || new ContextOptimizerService();
  const intentRouter = overrides?.intentRouter || new IntentRouterService();
  const guardrailsService = overrides?.guardrailsService || new GuardrailsService();
  const observability = overrides?.observability || new ObservabilityService();
  const operatingSchedule = overrides?.operatingSchedule || new OperatingScheduleService();

  // 7. Servicios de Coexistencia y Procesamiento
  let processIncomingMessageUseCase: ProcessIncomingMessageUseCase;

  const debouncerService =
    overrides?.debouncerService ||
    new MessageDebouncerService(cacheService, {
      execute: (payload) => processIncomingMessageUseCase.execute(payload)
    } as ProcessIncomingMessageUseCase);

  const coexistenceService =
    overrides?.coexistenceService ||
    new CoexistenceService(conversationRepository, debouncerService, ENV.COEXISTENCE_COOLDOWN_MINUTES);

  processIncomingMessageUseCase =
    overrides?.processIncomingMessageUseCase ||
    new ProcessIncomingMessageUseCase(
      aiService,
      whatsAppService,
      conversationRepository,
      contextOptimizer,
      coexistenceService,
      intentRouter,
      guardrailsService,
      observability,
      orderRepository
    );

  return {
    orderRepository,
    receiptRepository,
    conversationRepository,
    visionService,
    aiService,
    whatsAppService,
    cacheService,
    idempotencyService,
    contextOptimizer,
    debouncerService,
    coexistenceService,
    intentRouter,
    guardrailsService,
    getCatalogUseCase,
    validateReceiptUseCase,
    notifyKitchenUseCase,
    processIncomingMessageUseCase,
    toolExecutor,
    observability
    ,operatingSchedule
  };
}

