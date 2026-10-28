# 04: Consolidar English workflows y probarlos por HTTP

**What to build:** los English workflows encapsulan clasificación y generación en implementaciones concretas, conservando su comportamiento público y usando respuestas deterministas del Gateway en lugar de IA inyectada.

**Blocked by:** 03: Migrar Compaction como primer corte vertical.

**Status:** ready-for-agent

- [ ] Clasificación y generación utilizan la infraestructura compartida real; se retira la composición cuya única razón sea instalar fakes, sin introducir otro puerto genérico.
- [ ] Pruebas de los workflows públicos verifican schemas, prompts relevantes, contratos de modelo, delimitadores y transformaciones de salida para corrección y traducción.
- [ ] Las respuestas de Decisions y generación se configuran explícitamente mediante el toolkit, preservando validación, respuestas inválidas y propagación de errores.
- [ ] Las peticiones observadas comprueban contratos relevantes sin convertir toda la coreografía o los prompts en snapshots rígidos.
- [ ] Se conservan tipos de dominio y helpers útiles, y se registra la cobertura equivalente antes de retirar adapters y pruebas obsoletos.
- [ ] Pasan las pruebas focalizadas y las comprobaciones de tipos y lint correspondientes; las pruebas locales no necesitan un servidor Gateway escuchando.
