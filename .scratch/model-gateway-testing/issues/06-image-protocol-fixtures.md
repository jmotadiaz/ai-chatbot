# 06: Unificar las pruebas de imágenes con fixtures oficiales

**What to build:** la generación de imágenes se verifica usando el adapter técnico real del chatbot y fixtures oficiales del protocolo, evitando stubs de transporte duplicados sin cambiar la integración de producción.

**Blocked by:** 03: Migrar Compaction como primer corte vertical.

**Status:** ready-for-agent

- [ ] Se mantiene el adapter que traduce entre el contrato de imágenes del Gateway y los resultados de archivos del SDK, sin modificar el protocolo para facilitar pruebas.
- [ ] Las pruebas atraviesan HTTP controlado por el toolkit y comprueban contrato de modelo, modalidades y contenido de imagen relevantes de la petición.
- [ ] Se verifican archivos generados, interpretación de datos de imagen, uso y finalización, así como errores y respuestas inválidas que cubra la integración.
- [ ] Se conserva el comportamiento actual de la interfaz de streaming sin atribuirle generación incremental que no ofrece.
- [ ] Las fixtures de protocolo se reutilizan sin trasladar escenarios de producto al paquete oficial; se eliminan stubs redundantes con sus garantías contabilizadas.
- [ ] Pasan las pruebas focalizadas y las comprobaciones de tipos y lint correspondientes, conservando las restricciones de imports del SDK.
