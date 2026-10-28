# 11: Cerrar la migración de pruebas locales y los perfiles de ejecución

**What to build:** el repositorio ofrece ejecución autocontenida por defecto y un perfil explícito de infraestructura, con verificación completa de las garantías migradas y sin depender de mecanismos obsoletos del Gateway.

**Blocked by:** 02: Definir el catálogo y los perfiles E2E del chatbot con el toolkit oficial; 04: Consolidar English workflows y probarlos por HTTP; 05: Usar el Chat Mode Router real también en Test Environment; 06: Unificar las pruebas de imágenes con fixtures oficiales; 07: Migrar la ingestión RAG con embeddings deterministas; 08: Migrar la recuperación RAG con inferencia determinista; 09: Simplificar la construcción del agente de chat; 10: Adoptar el toolkit en las pruebas del Coding Agent Worker.

**Status:** ready-for-agent

- [ ] La ejecución local por defecto (incluidos los social unit tests con PGlite y MSW) no requiere PostgreSQL externo ni servidores provisionados; un perfil explícito selecciona las pruebas con infraestructura externa y la verificación completa incluye ambos perfiles y los E2E existentes.
- [ ] Se documentan comandos, recursos y alcance. El propósito de contrato sigue identificable y no se renombran mecánicamente suites ni se ignoran las convenciones de organización de pruebas del repositorio.
- [ ] Las pruebas con MSW no arrancan además un servidor Gateway. El setup HTTP global se retira únicamente si no quedan consumidores que lo necesiten; los límites entre procesos conservan servidor HTTP cuando corresponde.
- [ ] Se contabilizan las garantías de pruebas y dobles sustituidos y se eliminan mecanismos equivalentes obsoletos, sin retirar casos independientes por reducir el número de tests.
- [ ] Se ejecutan las suites afectadas, los perfiles autocontenido y de infraestructura, los E2E existentes y las comprobaciones de tipos y lint. La compilación se valida únicamente mediante build:verify, sin tocar artefactos ni servicios de producción.
- [ ] La selección tipada de Environment y el aislamiento del Worker permanecen intactos. No se añaden controles remotos de escenarios, correlación de producción dedicada a tests, umbrales de rendimiento ni exigencias de paralelización histórica.
- [ ] La heurística social unit/E2E se referencia desde ADR 0013, sin duplicarla. La reclasificación, reducción o traslado de E2E actuales queda explícitamente fuera del cierre y pertenece a otro issue.
