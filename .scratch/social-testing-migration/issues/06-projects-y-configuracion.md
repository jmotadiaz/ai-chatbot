# 06: Migrar Projects y configuración de modelo

**What to build:** Proteger creación, gestión y Chats de Project con la
frontera adecuada, y resolver los escenarios omitidos de configuración sin
confundir comportamiento obsoleto con garantías aún vigentes.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían los tests de creación, gestión, Chat y configuración de Project y se conservan sus garantías funcionales mediante cobertura equivalente demostrada.
- [ ] Se revisan los casos omitidos de configuración avanzada, Test Chat y ajustes por modelo, incluida la vigencia de la garantía de temperatura.
- [ ] Los escenarios soportados sin cobertura se restauran en la frontera adecuada; los elementos obsoletos se eliminan solo con justificación y las dudas funcionales se consultan al operador.
- [ ] Los E2E retenidos explican la garantía de navegador y lo que omitiría un test unitario; los casos restantes se prueban socialmente cuando sea fiel.
- [ ] Se registran las decisiones y equivalencias en los comentarios y se ejecutan los tests afectados.
