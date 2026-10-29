# 01: Preparar la transición y migrar Compaction

**What to build:** Preparar una transición compatible entre la organización
actual y la del ADR 0013, y demostrar el enfoque social con Compaction. La
suite sigue ejecutándose durante la migración sin perder ni duplicar
silenciosamente la selección de tests.

**Blocked by:** Ninguno (puede comenzar inmediatamente).

**Status:** ready-for-agent

- [ ] Los selectores reconocen tanto la organización actual como la nueva durante la transición; los comandos y perfiles existentes siguen funcionando sin omitir ni ejecutar inadvertidamente dos veces una misma suite.
- [ ] Las garantías de Compaction se inventarían y consolidan preferentemente desde la interfaz de la capacidad, con persistencia PGlite y respuestas controladas en la frontera HTTP del Model Gateway cuando corresponda.
- [ ] Se conservan las reglas, límites y fallos significativos con cobertura equivalente demostrada; los tests aislados o de subcapacidades se mantienen cuando su contrato o coste lo justifique.
- [ ] Se investiga la discrepancia entre el título y las aserciones del caso de punto de corte con un único Message; se consulta al operador antes de decidir un comportamiento no aclarado.
- [ ] Se registra en los comentarios del ticket qué garantías se conservan, trasladan o eliminan y qué evidencia demuestra cada equivalencia.
- [ ] Se ejecutan las selecciones afectadas y se verifican el descubrimiento y la propagación de fallos; no se usan servicios ni artefactos de Production.
