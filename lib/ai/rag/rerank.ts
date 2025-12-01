import { providers } from "@/lib/ai/models/providers";
import { RagChunk } from "@/lib/ai/rag/types";

// Interfaz para los argumentos de la función
interface RerankOptions {
  query: string;
  documents: RagChunk[]; // Acepta strings u objetos
  topN: number;
}

const rerank = providers.rerank();

/**
 * Reordena una lista de documentos basada en su relevancia semántica con una consulta.
 */
export async function rerankDocuments({
  query,
  documents,
  topN
}: RerankOptions): Promise<RagChunk[]> {

  if (documents.length <= topN) {
    return documents;
  }

  try {
    // 2. Llamada a la API
    const results = await rerank({
      query: query,
      documents: documents.map(({content}) => content),
      topN: topN,
    });

    return results.map(({index}) => documents[index]);

  } catch (error) {
    console.error("Error al reordenar documentos con Cohere:", error);
    return [];
  }
}
