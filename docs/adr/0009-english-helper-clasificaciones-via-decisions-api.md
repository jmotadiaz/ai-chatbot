# English Helper: clasificaciones vía Decision API (Jev) en vez de `generateObject`

El English Helper clasificaba Direction, Audience y Domain con tres llamadas `generateObject`
(texto libre para Domain+subdominio) antes de traducir/corregir. Decidimos mover las tres
clasificaciones a la **Decision API** (Jev 1.13, operación `decide` del Inference Kit), en **una
sola llamada con tres preguntas `choice`** (`direction`, `audience`, `domain`), con los
conjuntos de opciones cerrados y **sin gate de confianza**: lo que Jev decide se aplica tal cual
(`confidence` queda solo como provenance), igual que el Chat Mode Router tras retirar su gate.

## Considered Options

- **Seguir con `generateObject` y texto libre.** Rechazado: salida no tipada, tres viajes de LLM
  completos por texto, y la especificidad del subdominio no se usaba para nada más que un hint de
  terminología. El subdominio se elimina; Domain pasa a un enum cerrado de 9 áreas + `none`.
- **Una llamada `decide` por pregunta.** Rechazado: la Decisions API acepta un mapa `questions`
  completo en un request, con un solo timeout y provenance por pregunta; `DecideOptions` pasó a
  plural (`questions`) y el Chat Mode Router se actualizó como consumidor.

## Consequences

- La semántica de fallo es por pregunta: una respuesta malformada o desconocida cae al fallback
  determinista de esa pregunta (`direction`→`es-to-en`, `audience`→`general`, `domain`→`none`,
  que elimina el bloque de dominio del prompt); la llamada solo falla entera si NINGUNA pregunta
  tiene respuesta válida, y el fallo de transporte nunca rompe la UI.
- Retargetar el modelo de clasificación es un cambio de datos (`DECISION_ROLES.englishHelper` en
  `packages/models`); las preguntas y su versionado viven en
  `packages/chatbot/lib/features/english/workflows/questions.ts`.
- El delimitador del texto crudo NO es una decisión de este ADR ni de seguridad (el modelo no tiene
  tools): es selección determinista por código (`pickDelimiter`) para que el modelo procese el
  texto en lugar de responderlo/obedecerlo, documentada en `workflows/utils.ts`.
