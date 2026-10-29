# 13: Migrar configuración, tracing y guardarraíles

**What to build:** Mantener garantías comprobables de configuración, tracing
y arquitectura, concentrando los Environment Guardrails en los riesgos que
protegen realmente.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían y migran los tests de configuración, tracing y comprobaciones arquitectónicas y de scripts, conservando sus garantías significativas.
- [ ] Los Environment Guardrails cubren aislamiento de Environments y protección de datos y artefactos de Production; se retiran las aserciones históricas de scripts de build fuera de ese alcance.
- [ ] No se añaden automáticamente reemplazos para esas aserciones; se consulta al operador antes de añadir uno por un riesgo operativo demostrado.
- [ ] Cada función de aptitud arquitectónica retenida identifica característica, criterio objetivo y ejecución; se distingue probar la regla de ejecutarla sobre el código.
- [ ] Se registran garantías, eliminaciones y excepciones en los comentarios y se ejecutan las comprobaciones afectadas sin alterar Production.
