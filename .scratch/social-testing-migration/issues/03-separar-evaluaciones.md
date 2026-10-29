# 03: Separar las evaluaciones de calidad

**What to build:** Separar las evaluaciones de calidad de modelos de las
categorías de tests sin cambiar cómo se ejecutan ni sugerir que respuestas
simuladas demuestran calidad de un modelo real.

**Blocked by:** Ninguno (puede comenzar inmediatamente).

**Status:** ready-for-agent

- [ ] El entorno de ejecución, los casos y recursos de evaluación quedan fuera de los directorios de tests y fuera del comando unitario.
- [ ] Se actualizan selección, imports, configuración, rutas de recursos y documentación necesarios para que los comandos de evaluación sigan resolviendo sus casos.
- [ ] Se conserva la semántica actual de ejecución y de selección de Environment; no se redirige ninguna evaluación a proveedores reales.
- [ ] La documentación explica la discrepancia existente entre las afirmaciones de modelos reales y el uso de Test Environment/Mock Model Gateway, sin atribuir validez a resultados históricos no verificados.
- [ ] Se comprueban las referencias y la selección sin ejecutar evaluaciones contra proveedores reales; las limitaciones de validación se notifican explícitamente.
