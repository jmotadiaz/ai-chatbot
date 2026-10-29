# 10: Migrar RPC y servidor de artefactos del Worker

**What to build:** Preservar el parseo RPC en proceso y la entrega real de
artefactos por HTTP local, simplificando únicamente lo que no aporte una
garantía distinta.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían y trasladan los tests de RPC y del servidor de artefactos a la organización objetivo conservando sus garantías.
- [ ] Se mantiene el parseo RPC en proceso sin afirmar que demuestra supervivencia de un proceso mediante HTTP real ni añadir esa nueva garantía en este ticket.
- [ ] Se mantiene la comprobación mediante servidor HTTP aislado de enrutado, entrega, cabeceras, HEAD, rutas inválidas y coexistencia con RPC.
- [ ] Se eliminan o consolidan solo aserciones cuya redundancia esté demostrada sin perder cobertura de conexión del servidor.
- [ ] Se registran las equivalencias en los comentarios y se ejecutan los tests afectados con recursos propios del test, sin interactuar con Production.
