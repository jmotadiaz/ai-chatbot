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

        // Verificamos si existe alguna parte de razonamiento.
        // Usamos una guardia de tipo o cast seguro para evitar 'any'
        const hasReasoning = message.content.some(
            (part) => (part as { type: string }).type === 'reasoning'
        );

        // CONDICIÓN DEL ERROR: Tiene Tools pero NO tiene Reasoning
        if (hasToolCall && !hasReasoning) {
          return {
            ...message,
            content: [
              {
                type: 'reasoning', // AI SDK convierte esto al bloque 'thinking' de Anthropic
                text: 'Thinking process was skipped or redacted for this step.',
                signature: 'redacted_thinking', // Firma para cumplir con la API
              },
              ...message.content,
            ],
          } as typeof message;
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
