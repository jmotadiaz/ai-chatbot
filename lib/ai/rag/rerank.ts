import { providers } from "@/lib/ai/models/providers";
import { SimilarChunk } from "@/lib/db/queries";

// Interfaz para los argumentos de la función
interface RerankOptions {
  query: string;
  documents: SimilarChunk[]; // Acepta strings u objetos
  topN: number;
}

const rerank = providers.rerank();

const getUniqueDocuments = (documents: SimilarChunk[]) => {
  const map = new Map<string, SimilarChunk>();
  documents.forEach((doc) => {
    map.set(doc.parent, doc);
  });
  return Array.from(map.values());
};

/**
 * Reordena una lista de documentos basada en su relevancia semántica con una consulta.
 */
export async function rerankDocuments({
  query,
  documents,
  topN
}: RerankOptions): Promise<SimilarChunk[]> {
  const uniqueDocuments = getUniqueDocuments(documents);

  if (uniqueDocuments.length <= topN) {
    return uniqueDocuments;
  }

  try {
    // 2. Llamada a la API
    const results = await rerank({
      query: query,
      documents: uniqueDocuments.map(({parent}) => parent),
      topN: topN,
    });

    return results.map(({index}) => uniqueDocuments[index]);

  } catch (error) {
    console.error("Error al reordenar documentos con Cohere:", error);
    return [];
  }
}
