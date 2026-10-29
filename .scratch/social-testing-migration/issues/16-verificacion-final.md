# 16: Verificar y cerrar la migración

**What to build:** Demostrar que el conjunto migrado cumple la spec y el
ADR 0013, con un inventario trazable y verificación integral que no afecte a
Production.

**Blocked by:** 02: Hacer fiable la inspección del bundle; 03: Separar las evaluaciones de calidad; 15: Completar comandos y retirar la organización anterior.

**Status:** ready-for-agent

- [ ] Se consolida la contabilidad de garantías de los tickets: para cada garantía funcional activa anterior existe cobertura equivalente o una decisión explícita del operador; las eliminaciones de detalles internos están justificadas.
- [ ] Se redescubren y revisan todos los E2E y skips actuales; cada E2E conservado justifica la necesidad de navegador y cada caso omitido tiene una resolución o decisión explícita.
- [ ] Se comprueba que las capacidades y paquetes de la spec están incluidos y que las evaluaciones permanecen fuera del comando unitario sin cambios silenciosos de semántica.
- [ ] Se validan selección por paquete y archivo, perfil autocontenido, perfil aprovisionado, propagación de fallos y verificación del bundle recién generado.
- [ ] Se ejecutan las comprobaciones pertinentes de lint, tipos, tests unitarios y de recursos aprovisionados, E2E y build de verificación aislado; se informa de cualquier prerrequisito o cobertura no ejecutada.
- [ ] La documentación refleja el estado implementado, no la transición; no se ejecutan builds de Production, evaluaciones con proveedores reales ni acciones sobre servicios o datos de Production.
