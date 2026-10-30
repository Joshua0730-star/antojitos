export interface ObservabilitySnapshot {
  messagesProcessed: number;
  repliesSent: number;
  fallbackReplies: number;
  guardrailBlocks: number;
  llmErrors: number;
  totalLlmLatencyMs: number;
  slowReplies: number;
  qualityWarnings: number;
}

/** Métricas ligeras, sin PII ni contenido de conversaciones. */
export class ObservabilityService {
  private snapshot: ObservabilitySnapshot = {
    messagesProcessed: 0,
    repliesSent: 0,
    fallbackReplies: 0,
    guardrailBlocks: 0,
    llmErrors: 0,
    totalLlmLatencyMs: 0
    ,slowReplies: 0
    ,qualityWarnings: 0
  };

  public increment(metric: keyof Omit<ObservabilitySnapshot, 'totalLlmLatencyMs'>): void {
    this.snapshot[metric] += 1;
  }

  public recordLlmLatency(milliseconds: number): void {
    if (Number.isFinite(milliseconds) && milliseconds >= 0) {
      this.snapshot.totalLlmLatencyMs += Math.round(milliseconds);
      if (milliseconds > 8000) this.snapshot.slowReplies += 1;
    }
  }

  /** Evaluación interna: nunca se envía al cliente ni contiene PII. */
  public evaluateReply(reply: string): void {
    const normalized = reply.trim().toLowerCase();
    if (!normalized || normalized.length < 8 || /no entend[ií]|repite|vuelve a decir/.test(normalized)) {
      this.snapshot.qualityWarnings += 1;
    }
  }

  public getInternalRecommendations(): string[] {
    const recommendations: string[] = [];
    if (this.snapshot.fallbackReplies > 0) recommendations.push('Revisar errores o límites del proveedor de IA: hubo respuestas de respaldo.');
    if (this.snapshot.slowReplies > 0) recommendations.push('Optimizar latencia: hubo respuestas de IA de más de 8 segundos.');
    if (this.snapshot.qualityWarnings > 0) recommendations.push('Auditar conversaciones con respuestas vacías, poco útiles o que piden repetir información.');
    if (this.snapshot.guardrailBlocks > 0) recommendations.push('Revisar entradas bloqueadas para confirmar que no haya falsos positivos.');
    return recommendations;
  }

  public getSnapshot(): ObservabilitySnapshot & { averageLlmLatencyMs: number } {
    return {
      ...this.snapshot,
      averageLlmLatencyMs: this.snapshot.messagesProcessed > 0
        ? Math.round(this.snapshot.totalLlmLatencyMs / this.snapshot.messagesProcessed)
        : 0
    };
  }
}
