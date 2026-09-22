# 05: Eval `mode-routing` y tuning de criterios/umbral

**What to build:** caso de evalite que mide el enrutado contra Jev real con un dataset etiquetado, para tunear criterios y umbral con datos en lugar de intuición.

**Blocked by:** 04.

**Status:** ready-for-agent

- [ ] `packages/chatbot/tests/evals/cases/mode-routing.eval.ts` + dataset (~25–40 mensajes ES/EN: docs de librería, actualidad, referencias/verificación, follow-ups pronominales con y sin contexto, preguntas repo-locales, charla).
- [ ] Scorer con accuracy global y por clase (`ctx7` / `web` / `neither`), matriz de confusión y distribución de confianza de los aciertos.
- [ ] `pnpm eval -c mode-routing` corre contra Jev real y es reproducible con la `OPENROUTER_API_KEY` de `.env.development.local`.
- [ ] Criterios y umbral de la v1 documentados en el propio caso; si los datos piden otro umbral, se actualiza la constante compartida y los tests de 03/04.
- [ ] Coste del run (~$0.0005) y comando documentados en el README de evals.
- [ ] Suites rápidas del repo en verde (lint, type-check, tests afectados).

## Comments
