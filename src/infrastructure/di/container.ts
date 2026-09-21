import { ENV } from '../config/env.js';
import { FileOrderRepository } from '../persistence/FileOrderRepository.js';
import { FileNequiReceiptRepository } from '../persistence/FileNequiReceiptRepository.js';
import { FileConversationRepository } from '../persistence/FileConversationRepository.js';
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

export interface AppContainer {
  orderRepository: FileOrderRepository;
  receiptRepository: FileNequiReceiptRepository;
  conversationRepository: FileConversationRepository;
  visionService: IVisionService;
  aiService: IAIService;
  whatsAppService: IWhatsAppService;
  getCatalogUseCase: GetCatalogUseCase;
  validateReceiptUseCase: ValidateNequiReceiptUseCase;
  notifyKitchenUseCase: NotifyKitchenUseCase;
  processIncomingMessageUseCase: ProcessIncomingMessageUseCase;
  toolExecutor: ToolExecutor;
}

export function createContainer(overrides?: Partial<AppContainer>): AppContainer {
  // 1. Repositorios
  const orderRepository = overrides?.orderRepository || new FileOrderRepository();
  const receiptRepository = overrides?.receiptRepository || new FileNequiReceiptRepository();
  const conversationRepository = overrides?.conversationRepository || new FileConversationRepository();

  // 2. WhatsApp Service
  let whatsAppService: IWhatsAppService;
  if (overrides?.whatsAppService) {
    whatsAppService = overrides.whatsAppService;
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

  // 6. Caso de Uso Principal
  const processIncomingMessageUseCase =
    overrides?.processIncomingMessageUseCase ||
    new ProcessIncomingMessageUseCase(aiService, whatsAppService, conversationRepository);

  return {
    orderRepository,
    receiptRepository,
    conversationRepository,
    visionService,
    aiService,
    whatsAppService,
    getCatalogUseCase,
    validateReceiptUseCase,
    notifyKitchenUseCase,
    processIncomingMessageUseCase,
    toolExecutor
  };
}
