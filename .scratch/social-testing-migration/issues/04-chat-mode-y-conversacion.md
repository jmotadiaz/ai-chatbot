# 04: Migrar Chat Mode y conversación

**What to build:** Proteger el routing de Chat Mode y las reglas de
conversación mediante tests sociales de capacidades, conservando las
garantías distintas del protocolo y de los fallos.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían y trasladan los tests de routing y reglas de conversación a la organización objetivo, con colaboradores propios reales y sustitución del Model Gateway en su frontera HTTP.
- [ ] Se comparan las garantías de pruebas de política y de integración antes de consolidarlas; se preservan los fallos de transporte y respuestas inválidas cuando cubran riesgos distintos.
- [ ] Las pruebas aisladas o más estrechas se justifican por una regla significativa, contrato propio o coste y fragilidad desproporcionados de la frontera más amplia.
- [ ] Se conserva cobertura funcional equivalente antes de retirar tests activos y se consulta al operador ante pérdida potencial de garantías o comportamiento no aclarado.
- [ ] Se registran las decisiones y equivalencias en los comentarios del ticket y se ejecutan los tests y comprobaciones afectadas.
