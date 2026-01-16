import {
  type LanguageModelMiddleware,
} from 'ai';

export const anthropicThinkingFixMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) => {
    const { prompt } = params;

    // Verificar si el prompt es un array de mensajes (formato chat estándar)
    if (!Array.isArray(prompt)) {
      return params;
    }

    // Mapeamos los mensajes para "parchear" los que estén incompletos
    const fixedPrompt = prompt.map((message) => {
      // Solo nos interesa el rol 'assistant' con contenido tipo array (multimodal/tools)
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        const hasToolCall = message.content.some((part) => part.type === 'tool-call');
        // En v5, verificamos si existe alguna parte de razonamiento.
        // Nota: Si TS se queja del tipo 'reasoning', usa 'as any' en la validación.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasReasoning = message.content.some((part) => (part as any).type === 'reasoning');

        // CONDICIÓN DEL ERROR: Tiene Tools pero NO tiene Reasoning
        if (hasToolCall && !hasReasoning) {
          return {
            ...message,
            content: [
              {
                type: 'reasoning', // AI SDK convierte esto al bloque 'thinking' de Anthropic
                text: 'Thinking process was skipped or redacted for this step.',
                signature: 'redacted_thinking', // Firma para cumplir con la API
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any, // 'as any' es necesario si tu versión de TS de v5 aun no tiene el tipo 'reasoning'
              ...message.content,
            ],
          };
        }
      }
      return message;
    });

    // Devolvemos los parámetros con el prompt corregido
    return {
      ...params,
      prompt: fixedPrompt,
    };
  },
};
