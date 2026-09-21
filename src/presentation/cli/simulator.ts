import readline from 'readline';
import { createContainer } from '../../infrastructure/di/container.js';
import { SimulatorWhatsAppAdapter } from '../../infrastructure/whatsapp/SimulatorWhatsAppAdapter.js';

async function runSimulator() {
  const simulatorAdapter = new SimulatorWhatsAppAdapter();
  const container = createContainer({ whatsAppService: simulatorAdapter });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const testPhone = '+57 300 987 6543';

  console.log('\n======================================================');
  console.log('🍓 BENVENIDO AL SIMULADOR DE ANTOJITOS BOT (CLI) 🍓');
  console.log('======================================================');
  console.log('Comandos especiales:');
  console.log('  /comprobante [monto]   -> Simula el envío de una captura Nequi');
  console.log('  /llamada               -> Simula que el cliente llama por voz');
  console.log('  /limpiar               -> Reinicia el historial del chat');
  console.log('  /salir                 -> Salir del simulador');
  console.log('======================================================\n');

  // Enviar mensaje inicial
  const ask = () => {
    rl.question('\n👤 Tú: ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        ask();
        return;
      }

      if (trimmed === '/salir') {
        console.log('¡Hasta luego! 🍓');
        rl.close();
        process.exit(0);
      }

      if (trimmed === '/limpiar') {
        await container.conversationRepository.clearConversation(testPhone);
        console.log('🧹 Historial conversacional reiniciado.');
        ask();
        return;
      }

      if (trimmed === '/llamada') {
        console.log('\n📞 [EVENTO DE LLAMADA ENTRANTE DETECTADO]...');
        const result = await container.processIncomingMessageUseCase.execute({
          from: testPhone,
          isCallEvent: true
        });
        console.log(`\n🤖 AntojitoBot: ${result.replyMessage}`);
        ask();
        return;
      }

      let imageUrl: string | undefined;
      let userText = trimmed;

      if (trimmed.startsWith('/comprobante')) {
        const parts = trimmed.split(' ');
        const amount = parts[1] || '23000';
        imageUrl = `comprobante_nequi_${amount}.jpg`;
        userText = `Aquí te envío el comprobante de pago por $${amount}.`;
        console.log(`📷 [IMAGEN ADJUNTA: ${imageUrl}]`);
      }

      try {
        const result = await container.processIncomingMessageUseCase.execute({
          from: testPhone,
          text: userText,
          imageUrl
        });

        console.log(`\n🤖 AntojitoBot: ${result.replyMessage}`);

        // Si se emitió una alerta a cocina, mostrarla en consola
        const latestKitchenAlert = simulatorAdapter.getLatestKitchenAlert();
        if (latestKitchenAlert) {
          console.log('\n📢 [ALERTA ENVIADA AL WHATSAPP DE COCINA]:');
          console.log('--------------------------------------------------');
          console.log(latestKitchenAlert);
          console.log('--------------------------------------------------');
          simulatorAdapter.clear();
        }
      } catch (error: any) {
        console.error('❌ Error:', error.message);
      }

      ask();
    });
  };

  ask();
}

runSimulator();
