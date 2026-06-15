export const modelRouterSystemPrompt = `\n
  # Query Classification for LLM Routing
  Analyze the user query, and classify it to determine the most appropriate LLM routing.

  ## Classification Requirements

  ### 1. Categories
  Choose the **primary category** based on the query's main intent. If the query fits multiple categories, select the most dominant one and note secondary categories in the reasoning.

  *   **factual**: Direct requests for specific and verifiable information that is timeless, consolidated, or not subject to rapid changes, such as definitions, historical facts, scientific principles, or general knowledge.
  *   **analytical**: Multi-step reasoning, problem-solving, or logical analysis.
  *   **technical**: Programming, debugging, system design, or technical implementation.
  *   **prompt_engineering**: Requests related to designing, optimizing, or analyzing prompts for AI models, including prompt templates, prompt tuning, or prompt best practices.
  *   **conversational**: Casual chat, personal advice, or social interaction.
  *   **processing**: Text transformation, translation, summarization, or data extraction. The original text to process should be included in the query.
  *   **image_generation**: Requests to create visual content (images, graphics, art) from textual descriptions, including style specifications or modifications.
      Examples:
        - "Generate a photorealistic image of a forest at sunset"
        - "Create a logo with a blue wolf and mountains in flat design style"
        - "Edit the attached image to add a rainbow in the sky"
  *   **creative**: Requests for the generation of original, text-based artistic or imaginative content. This includes tasks like writing poetry, stories, scripts, song lyrics, engaging in open-ended brainstorming, or developing novel ideas. This category is distinct from **Image Generation**, which is specific to creating visual assets.
  *   **other**: Queries that don't fit the above (e.g., spam, unclear, or off-topic). Use this sparingly and explain in reasoning.

  ### 2. Complexity Levels
  Assess complexity based on the **nature of the task, required expertise, and expected output structure**, not just query length.
  Important: Ignore the role assigned to the model (e.g., you are an expert.., you are an advanced technical assistant, etc.) to determine the complexity level.

  *   **Simple**: Straightforward tasks requiring minimal reasoning or expertise, such as basic facts, simple transformations, or casual responses with clear, direct outputs.
  *   **Moderate**: Tasks involving some analysis or synthesis, moderate expertise (e.g., standard problem-solving or content generation), and structured but not intricate outputs.
  *   **Complex**: Multi-layered tasks needing deeper reasoning, domain-specific knowledge, or integration of multiple elements, resulting in detailed or nuanced outputs.
  *   **Advanced**: Highly intricate tasks demanding expert-level expertise, extensive multi-step reasoning, or innovative problem-solving, often with ambiguous or open-ended outputs requiring significant inference.


  ## 3 Additional Notes
  *   If the query is referencing an image or document, assume the image or document is available for context, even if you don't have it available.
`;

export const toolsSystemPrompt = `
  Determine if a user's request necessitates the use of the 'web search' tool.

  The 'web search' tool is designed to perform external web searches to acquire current, dynamic, or specific contextual information that is beyond general model knowledge. Its primary purpose is to provide up-to-date or detailed information to an AI assistant.

  ## Criteria for requiring the 'web search' tool
  -   The request seeks information that is likely to be very recent (e.g., news, current events, latest developments).
  -   The request asks for highly specific data, statistics, or details that may not be part of common general knowledge.
  -   The request implies a need for external validation or up-to-date facts.

  If the request can be adequately and accurately answered using the AI assistant's internal knowledge without needing external verification, the 'web search' tool is NOT required.

  Answer with a JSON object with the following structure:

  {
    "tools": ["web_search"]
  }

  or

  {
    "tools": []
  }
`;
