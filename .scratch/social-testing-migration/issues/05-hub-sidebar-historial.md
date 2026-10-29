# 05: Migrar Hub, sidebar e historial

**What to build:** Comprobar las reglas de Hub, sidebar e historial en
fronteras sociales y conservar en navegador solo las garantías que realmente
dependan de él.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían los tests activos y omitidos de estas capacidades y se identifica para cada garantía la frontera y los recursos adecuados.
- [ ] Se crean o demuestran reemplazos sociales equivalentes antes de retirar cualquier E2E activo de reglas de Hub, sidebar o historial.
- [ ] Se conserva y justifica cualquier garantía distinta de navegación, layout o viewport que requiera navegador; el scroll infinito se evalúa separando reglas de datos de geometría real.
- [ ] Cada E2E conservado explica qué comportamiento de navegador verifica y qué omitiría un test unitario.
- [ ] Se registran decisiones, equivalencias y casos omitidos en los comentarios; se consulta al operador ante garantías funcionales dudosas y se ejecutan las pruebas afectadas.
