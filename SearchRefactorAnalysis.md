Basado en el análisis de tu código (específicamente `queries.ts` y la naturaleza de `pgvector` y `Full Text Search` en PostgreSQL), aquí tienes la evaluación y la solución técnica.

### Respuesta Corta

**No uses la misma estrategia para ambos.**

1. **Para Keyword Search:** La opción más óptima es **una sola Query SQL**. Drizzle/Postgres permite combinar términos con operadores lógicos (`OR`). Esto es mucho más rápido que `db.batch` porque el motor de base de datos escanea el índice una sola vez para el conjunto combinado de términos.
2. **Para Vector Search:** La opción más óptima es **`db.batch`**. No se puede hacer eficientemente una sola query SQL para múltiples vectores de búsqueda diferentes porque los índices vectoriales (HNSW/IVFFLAT) optimizan la distancia hacia *un solo punto* a la vez.

---

### Análisis Detallado: ¿Por qué?

#### 1. Keyword Search (Búsqueda por Palabras Clave)

Actualmente, tu código toma una query, separa las palabras y pone `OR` entre ellas.
Si tienes 5 preguntas generadas ("multi-hop"), hacer 5 queries separadas desperdicia recursos.

* **Solución:** Combina las 5 frases en una sola cadena gigante de `tsquery`.
* **Lógica:** `(query1) OR (query2) OR (query3)...`
* **Ventaja:** Postgres usa el índice GIN invertido una sola vez. Es computacionalmente mucho más barato.

#### 2. Vector Search (Embeddings)

Vector search funciona calculando la distancia (coseno) entre vectores.

* Si intentas hacer una sola query con `UNION ALL` (ej. `SELECT ... <=> v1 UNION SELECT ... <=> v2`), Postgres a menudo no puede optimizar bien el plan de ejecución y termina haciendo escaneos secuenciales o ejecutando sub-queries de todos modos.
* **Solución con `db.batch`:** Envías las 5 instrucciones SQL en un solo "paquete" de red. Postgres las ejecuta secuencialmente pero te ahorras 4 round-trips de latencia de red (RTT).
* **Deduplicación:** Al recibir los resultados de ambos métodos, deberás unificarlos y eliminar duplicados en tu código TypeScript (Node.js es muy rápido para esto, no cargues a la DB con esa lógica compleja).

---

### Solución Técnica (Código)

Aquí tienes cómo modificar tu archivo `lib/features/rag/queries.ts` para implementar esta optimización híbrida.

#### Paso 1: Optimizar Vector Search (Usando `db.batch`)

No modifiques la función `findSimilarChunks` original, crea una nueva función batch.

```typescript
// En lib/features/rag/queries.ts

export async function findSimilarChunksBatch({
  embeddings, // Array de embeddings (uno por cada multi-hop query)
  userId,
  projectId,
  limit = 10,
  similarityThreshold = 0.5,
}: {
  embeddings: number[][];
  userId: string;
  projectId?: string;
  limit?: number;
  similarityThreshold?: number;
}): Promise<SimilarChunks> {
  const db = getDb();

  // 1. Preparamos las sentencias SQL individuales sin ejecutarlas
  // Mapeamos cada embedding a una query usando la lógica existente
  const queries = embeddings.map((embedding) => {
    // Replicamos la lógica de tu 'findSimilarChunks' actual pero retornando la query builder
    // Nota: Necesitamos acceder a la lógica interna de construcción de query.
    // Lo ideal es refactorizar findSimilarChunks para que retorne la query sin .execute(),
    // pero aquí la recrearemos para el ejemplo:

    let baseQuery = db
      .select({
        id: chunk.id,
        content: chunk.content,
        resourceTitle: resource.title,
        resourceUrl: resource.url,
        // ... otros campos
        similarity: sql<number>`1 - (${embedding.embedding} <=> ${sql.placeholder('vector')})`.as("similarity"),
      })
      .from(chunk)
      .innerJoin(resource, eq(chunk.resourceId, resource.id))
      .where(
        and(
          gt(sql`1 - (${embedding.embedding} <=> ${sql.placeholder('vector')})`, similarityThreshold),
          // Filtros de usuario/proyecto...
          projectId
            ? exists(
                db.select()
                  .from(projectResource)
                  .where(and(
                    eq(projectResource.resourceId, resource.id),
                    eq(projectResource.projectId, projectId)
                  ))
              )
            : eq(resource.userId, userId)
        )
      )
      .orderBy(desc(sql`similarity`))
      .limit(limit)
      .prepare(`vector_search_${Math.random().toString(36).substring(7)}`); // Prepare statement único

    return baseQuery.execute({ vector: embedding });
  });

  // 2. Ejecutamos todo en un solo round-trip de red
  const batchResults = await db.batch(queries as any);

  // 3. Aplanamos los resultados (Array de Arrays -> Array simple)
  const allChunks = batchResults.flat();

  // 4. (Opcional) Deduplicar por ID en memoria
  const uniqueChunks = Array.from(
    new Map(allChunks.map((item: any) => [item.id, item])).values()
  ) as SimilarChunks;

  return uniqueChunks;
}

```

> **Nota:** Drizzle `prepare` con placeholders es clave aquí para que el batch funcione correctamente con diferentes vectores. Si tu versión de Drizzle/Driver no soporta placeholders en vectores fácilmente, puedes construir la query dinámica, pero `db.batch` sigue siendo el camino.

#### Paso 2: Optimizar Keyword Search (Una sola Query)

Modifica o crea una nueva función para aceptar un array de strings.

```typescript
// En lib/features/rag/queries.ts

export async function findSimilarChunksByKeywordCombined({
  queries, // Array de strings (tus multi-hop queries)
  userId,
  projectId,
  limit = 10,
}: {
  queries: string[];
  userId: string;
  projectId?: string;
  limit?: number;
}): Promise<SimilarChunks> {
  if (queries.length === 0) return [];

  // 1. Combinar todas las queries en una sola lógica OR gigante
  // Transformamos ["who is ceo", "apple revenue"]
  // en: "(who | is | ceo) | (apple | revenue)"

  const formattedQueries = queries
    .map(q => `(${q.trim().split(/\s+/).join(" | ")})`)
    .join(" | ");

  // 2. Ejecutar una sola query SQL
  const db = getDb();

  const results = await db
    .select({
        id: chunk.id,
        content: chunk.content,
        resourceTitle: resource.title,
        resourceUrl: resource.url,
        // ... map other fields
        similarity: sql<number>`ts_rank(to_tsvector('simple', ${chunk.content}), to_tsquery('simple', ${formattedQueries}))`.as("rank"),
    })
    .from(chunk)
    .innerJoin(resource, eq(chunk.resourceId, resource.id))
    .where(
      and(
        // Usamos @@ con la query combinada
        sql`to_tsvector('simple', ${chunk.content}) @@ to_tsquery('simple', ${formattedQueries})`,
        // Filtros de proyecto/usuario igual que antes
        projectId
            ? exists(
                db.select()
                  .from(projectResource)
                  .where(and(
                    eq(projectResource.resourceId, resource.id),
                    eq(projectResource.projectId, projectId)
                  ))
              )
            : eq(resource.userId, userId)
      )
    )
    .orderBy(desc(sql`rank`))
    .limit(limit * queries.length); // Aumentamos el límite para dar cabida a resultados de todas las sub-queries

  return results as unknown as SimilarChunks;
}

```

### Resumen de la Implementación en `search.ts`

Tu función orquestadora (`retrieveResourceChunks` en `search.ts`) ahora se vería así:

```typescript
// Pseudocódigo para lib/features/rag/retrieve/search.ts

const multiHopQueries = ["query1", "query2", "query3"];

// 1. Generar embeddings en paralelo (esto es llamada a API externa, OpenAI/Cohere)
const embeddings = await Promise.all(
  multiHopQueries.map(q => generateEmbedding(q, queryType))
);

// 2. Ejecutar búsquedas en paralelo (DB)
const [vectorResults, keywordResults] = await Promise.all([
  // Optimización 1: db.batch para vectores
  findSimilarChunksBatch({
    embeddings,
    userId,
    projectId
  }),

  // Optimización 2: Single Query combinada para keywords
  findSimilarChunksByKeywordCombined({
    queries: multiHopQueries,
    userId,
    projectId
  })
]);

// 3. Unificar y Rerank
const allChunks = [...vectorResults, ...keywordResults];
// ... lógica de deduplicación y reranking

```

### Conclusión

* **Vector Search:** Usa `db.batch`. Es la forma correcta de manejar múltiples puntos de entrada en índices vectoriales sin complejidad excesiva en SQL.
* **Keyword Search:** Usa una **única Query SQL** con operadores `OR` (`|`). Es nativo, rápido y reduce la carga del motor de base de datos drásticamente.
