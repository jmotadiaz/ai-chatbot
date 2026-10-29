# Migración a tests sociales por defecto

Status: ready-for-agent

## Planteamiento del problema

El operador necesita una suite de tests que proteja comportamientos
significativos del producto y de la arquitectura sin pagar repetidamente
por pruebas de los mismos detalles de implementación. La suite actual se
organiza en tests unitarios, de componentes, de integración, de contrato, de
infraestructura y E2E, mientras que el ADR 0013 define dos categorías
objetivo: unit y E2E. Las etiquetas actuales mezclan la finalidad de un test,
sus colaboradores y los recursos que necesita para ejecutarse.

Muchos tests fueron escritos por agentes y podrían dar prioridad a funciones
individuales, mocks o estructura de implementación frente al comportamiento
observable de una capacidad. Algunas aserciones y escenarios pueden
duplicar garantías en distintas fronteras; otros pueden proteger riesgos
diferentes aunque produzcan resultados similares. Reducir el número de tests
no demuestra por sí solo que la suite sea mejor.

La suite histórica de Playwright contiene casos que podrían verificarse sin
navegador, así como casos omitidos que actualmente no proporcionan cobertura.
Es necesario evaluarlos individualmente y preservar las garantías valiosas,
sin considerar una herramienta, un directorio o un test omitido como prueba
de cobertura.

El operador también necesita una verificación fiable y seleccionable en
todo el repositorio, incluidos los tests de Python del Model Gateway. El
orden actual de verificación completa puede inspeccionar un bundle de cliente
ausente o desactualizado antes de generar los artefactos aislados de
verificación, lo que produce una falsa sensación de cobertura. Además, las
evaluaciones de calidad de modelos están entre los tests, aunque tienen una
finalidad distinta.

## Solución

Migrar el repositorio a la política de testing del ADR 0013. Organizar los
tests unitarios alrededor de capacidades significativas y, por defecto, de
la colaboración real entre componentes propios; reservar los E2E para
garantías que requieran un navegador real. Inventariar y consolidar las
garantías existentes, preservar la cobertura funcional al mover tests y
resolver cada caso omitido individualmente.

Ofrecer un perfil unitario unificado y autocontenido, un perfil seleccionable
por separado para recursos aprovisionados y una verificación completa que
inspeccione un bundle de cliente recién generado de forma aislada. Separar
el entorno de ejecución de evaluaciones de calidad de modelos de la
taxonomía de tests sin cambiar su semántica de ejecución. Mantener Production
en funcionamiento y sin modificar sus datos ni artefactos durante el trabajo.

## Historias de usuario

1. Como operador, quiero una única categoría de tests unitarios para que los tests de componentes, contratos y varios módulos no se confundan con estrategias de testing distintas.
2. Como operador, quiero reservar los tests E2E para garantías que dependen del navegador para que la suite de navegador justifique su coste.
3. Como desarrollador, quiero que los tests se organicen por capacidad o responsabilidad para encontrar los comportamientos que protegen.
4. Como desarrollador, quiero probar las capacidades mediante interfaces estables para que una refactorización interna no rompa tests innecesariamente.
5. Como desarrollador, quiero colaboradores propios reales por defecto para que los tests ejerciten una colaboración significativa.
6. Como desarrollador, quiero fronteras externas controladas para que los tests sean deterministas sin usar proveedores de modelos reales.
7. Como desarrollador, quiero persistencia en proceso cuando sea adecuada para que la mayoría de los tests se ejecuten sin un servidor PostgreSQL aprovisionado.
8. Como desarrollador, quiero poder usar archivos, subprocesos o sockets locales controlados por el test cuando sea necesario para que el uso de recursos no obligue a crear otra categoría.
9. Como desarrollador, quiero tests aislados justificados para reglas y límites significativos difíciles de alcanzar para que los tests sociales no oculten casos límite importantes.
10. Como desarrollador, quiero que los dobles internos sean excepciones con limitaciones identificadas para que los tests no aparenten una colaboración que no han ejercitado.
11. Como desarrollador, quiero aserciones sobre resultados observables y contratos de frontera para que los tests protejan comportamiento en lugar del orden de llamadas a helpers.
12. Como operador, quiero una garantía identificable por cada test consolidado para poder evaluar la redundancia según el riesgo.
13. Como operador, quiero que los fallos diferentes sigan siendo observables por separado para que uno no oculte otro.
14. Como desarrollador, quiero expresar económicamente las variantes de una misma regla para que la duplicación no oculte su finalidad común.
15. Como operador, quiero preservar las garantías funcionales existentes durante la migración para que menos tests no signifique silenciosamente menos protección.
16. Como operador, quiero que se me consulte cuando pueda perderse una garantía funcional o no esté claro el comportamiento esperado para que un agente no tome implícitamente esa decisión de producto.
17. Como desarrollador, quiero eliminar detalles internos sin valor independiente para que los tests no restrinjan cambios de implementación inocuos.
18. Como operador, quiero decidir el destino de cada escenario E2E para que un archivo completo no se conserve o traslade solo por su nombre.
19. Como operador, quiero que cada E2E conservado identifique el riesgo que requiere un navegador real y lo que omitiría un test unitario para poder revisar su alcance.
20. Como usuario, quiero cobertura del layout, el viewport y el scroll reales cuando sean relevantes para que las pruebas con DOM simulado no se confundan con comprobaciones de geometría del navegador.
21. Como usuario, quiero cobertura de navegación y ciclo de vida del navegador cuando aporten una garantía para que las rutas y el retorno a una pantalla funcionen en la práctica.
22. Como usuario, quiero conservar recorridos críticos representativos para que se compruebe el ensamblaje con navegador sin repetir todas las variantes de entrada.
23. Como usuario, quiero que la recuperación de Background Generation se pruebe según los comportamientos realmente simulados para que la suite no afirme comprobar suspensión del dispositivo ni el apagado real de la pantalla.
24. Como operador, quiero investigar cada E2E omitido para que el comportamiento soportado no se descarte silenciosamente ni se contabilice como cobertura activa.
25. Como usuario de Coding Agent, quiero reevaluar los tests obsoletos de una ruta de entrada eliminada frente a la interfaz actual para restaurar el comportamiento que siga soportado en la frontera adecuada.
26. Como operador, quiero que los E2E del chatbot mantengan el stub de Coding Agent Worker para que esta migración no amplíe silenciosamente el sistema probado.
27. Como desarrollador, quiero conservar la garantía existente de parseo RPC en proceso para comprobar entradas malformadas sin afirmar que se ha probado la supervivencia de un proceso por HTTP real.
28. Como desarrollador, quiero comprobar la entrega de artefactos y su coexistencia con RPC mediante un servidor local aislado para mantener cubierta la conexión real del servidor.
29. Como operador, quiero cubrir las decisiones distintas del guard de despliegue con cambios sin confirmar del Model Gateway para que la simplificación no elimine la interacción ni el override explícito.
30. Como desarrollador, quiero consolidar las aserciones redundantes sobre rutas de extensiones para mantener coberturas distintas de disponibilidad física y carga de recursos sin repetirlas.
31. Como desarrollador, quiero eliminar tests vacíos y puntos de sustitución usados solo por esos tests cuando se haya acordado para que no aparenten una protección inexistente.
32. Como operador, quiero que los Environment Guardrails protejan el aislamiento entre Environments y los datos y artefactos de Production para comprobar la seguridad operativa sin fijar texto irrelevante de scripts.
33. Como operador, quiero que las funciones de aptitud arquitectónica identifiquen su característica y criterio de aceptación para que no se etiquete cualquier aserción estática como validación arquitectónica.
34. Como desarrollador, quiero un único comando unitario raíz que cubra todos los paquetes y los tests Python del Model Gateway para que el resultado por defecto represente todo el repositorio.
35. Como desarrollador, quiero seleccionar tests por paquete o archivo para poder ejecutar un ciclo de verificación acotado.
36. Como desarrollador, quiero un perfil autocontenido por defecto para no tener que aprovisionar un servicio compartido para los tests unitarios habituales.
37. Como desarrollador, quiero un perfil explícito para tests que requieren recursos aprovisionados para que la verificación completa los ejecute sin ocultar sus prerrequisitos.
38. Como operador, quiero aislar los recursos y datos de test compartidos para que una ejecución no pueda limpiar destructivamente otra ejecución u otro Environment.
39. Como operador, quiero que la verificación rápida informe de la ausencia del bundle de cliente para que una inspección no realizada no se presente como satisfactoria.
40. Como operador, quiero que la verificación completa inspeccione el bundle de cliente recién generado de forma aislada para evitar falsos resultados positivos por un artefacto ausente o desactualizado.
41. Como operador, quiero que la verificación evite los builds y servicios de Production para mantener disponible el despliegue en vivo.
42. Como evaluador de calidad de modelos, quiero separar las evaluaciones de los tests deterministas para que sus resultados no se confundan con garantías unitarias o E2E.
43. Como evaluador de calidad de modelos, quiero preservar el comportamiento actual de las evaluaciones durante su traslado para que mover su entorno de ejecución no cambie silenciosamente el Environment ni el proveedor.
44. Como operador, quiero documentar honestamente la discrepancia del Gateway usado en las evaluaciones para que las respuestas simuladas no se presenten como pruebas de calidad de un modelo real.
45. Como desarrollador, quiero actualizar conjuntamente comandos, configuración de runners, imports e instrucciones para que la suite migrada se pueda descubrir y ejecutar.
46. Como operador, quiero un inventario trazable de garantías migradas y casos omitidos para revisar el resultado sin depender únicamente del número de tests.
47. Como desarrollador, quiero verificar la selección y los perfiles mediante ejecución real y propagación de errores para que las suites omitidas o renombradas no produzcan un falso éxito.

## Decisiones de implementación

### Clasificación y organización

- Aplicar el ADR 0013 a todo el repositorio: chatbot, Coding Agent Worker,
  paquetes compartidos de configuración y tracing, código Python del Model
  Gateway y su toolkit de testing JavaScript. Inventariar el contenido real
  al implementar; no asumir que la revisión anterior examinó exhaustivamente
  todas las aserciones.
- Usar unit y E2E como las dos categorías. Organizar los tests de cada
  paquete por funcionalidad o responsabilidad dentro de la categoría
  correspondiente. Las comprobaciones de contrato, los tests de componentes
  renderizados sin navegador real y los tests de varios módulos siguen siendo
  unitarios. La finalidad del test y el perfil de recursos son independientes
  de la categoría.
- Preferir tests unitarios sociales en la interfaz estable de la capacidad
  completa más cercana a la garantía. Ejercitar un punto de entrada más
  externo cuando su conexión añada una garantía distinta. Una capacidad
  técnica, contrato o guardarraíl puede ser el comportamiento probado sin
  inventar un recorrido de usuario.
- Conservar una frontera social más estrecha cuando tenga un contrato propio
  reutilizable o cuando el test más amplio sea significativamente más
  costoso o frágil. Conservar tests aislados para reglas, límites o
  invariantes significativos difíciles, frágiles o desproporcionadamente
  costosos de verificar de forma social.
- Usar colaboradores propios reales salvo que sea necesaria una excepción;
  identificar la garantía que queda fuera al usar un doble interno. Usar
  PGlite para la persistencia del chatbot adecuada en proceso y la
  sustitución HTTP existente del Model Gateway para inferencia. Reutilizar
  las fronteras existentes en vez de crear puertos de inyección o un entorno
  de pruebas independiente de componentes en navegador para esta migración.
- Consolidar por garantía y riesgo. Mantener observables por separado los
  fallos diferentes y usar casos parametrizados cuando expresen variantes de
  la misma regla. No imponer un porcentaje de reducción ni considerar que los
  casos parametrizados tienen menos valor por sí mismos.

### Contabilidad de garantías y E2E

- Inventariar los tests existentes por capacidad, garantía observable, fallo
  o riesgo arquitectónico, frontera actual, recursos, estado activo u
  omitido, frontera objetivo y evidencia de reemplazo equivalente. Registrar
  adiciones, traslados, consolidaciones y eliminaciones para poder seguir
  cada garantía funcional activa durante la migración.
- Eliminar cobertura funcional activa solo después de demostrar una
  cobertura equivalente en la frontera elegida. Eliminar aserciones sobre
  detalles de implementación sin valor independiente. Consultar al operador
  antes de descartar una garantía funcional potencialmente significativa o
  decidir un comportamiento no aclarado. Resultados esperados similares en
  dos fronteras no demuestran por sí solos duplicación: los riesgos de
  protocolo y conexión pueden ser distintos.
- Reevaluar individualmente cada E2E descubierto. Cada caso conservado debe
  explicar qué comportamiento de navegador verifica y qué omitiría un test
  unitario. La geometría, el viewport y el scroll; la navegación y el ciclo
  de vida; la recuperación; y el ensamblaje representativo con navegador
  pueden justificar E2E cuando aporten un riesgo distinto. Ni la importancia,
  la ejecución de varios módulos, PostgreSQL, el streaming ni el uso de
  Playwright son suficientes por sí solos.
- Revisar cada skip o fixme como ausencia de cobertura. Determinar si el
  comportamiento sigue soportado, si existe cobertura activa equivalente y
  cuál es la frontera adecuada para cualquier cobertura que falte. Restaurar
  el comportamiento soportado sin cobertura o registrar una eliminación
  justificada; consultar al operador cuando queden decisiones funcionales sin
  resolver. No limitarse a habilitar casos inestables sin abordar sus causas.
- Conservar la simulación de interrupción y visibilidad de Background
  Generation y describir únicamente los eventos de navegador y la
  interrupción de red simulados. No afirmar que demuestra una suspensión real
  del sistema operativo ni el apagado de la pantalla.
- Investigar los tres escenarios omitidos de Coding Agent escritos para la
  ruta de entrada eliminada frente a la Coding Agent UI actual. Restaurar las
  garantías soportadas que no estén cubiertas en la frontera adecuada. Los
  E2E del chatbot siguen usando el stub de Coding Agent Worker; la conexión
  real entre chatbot y Worker no se introduce en esta migración.

### Simplificaciones concretas acordadas

- Conservar las garantías HTTP del servidor de artefactos aislado, incluidos
  enrutado, entrega, cabeceras, rutas inválidas y coexistencia con RPC.
  Simplificar únicamente las aserciones cuya redundancia esté demostrada sin
  debilitar la cobertura de conexión del servidor.
- Conservar las decisiones distintas del guard de despliegue del Model
  Gateway con cambios sin confirmar, incluidas la pregunta interactiva y el
  override explícito. Consolidar variantes de entrada equivalentes sin
  representar el guard como una frontera de seguridad ni desplegar nada en
  el test.
- Consolidar los invariantes repetidos sobre extensiones y rutas conservando
  tanto la existencia física como el comportamiento distinto del cargador
  de recursos.
- Mantener el test existente de parseo RPC en proceso. No añadir una prueba
  de supervivencia de proceso por HTTP real como supuesto equivalente ni
  afirmar que el test en proceso demuestra esa garantía.
- Eliminar el test vacío del setter de la factoría de runtime y el setter
  usado solo por ese test, tras verificar sus usos actuales. La inyección
  mediante constructor sigue disponible. Este cambio de API está aceptado
  expresamente; consultar si aparecen nuevos consumidores legítimos.
- Limitar los Environment Guardrails al aislamiento de Environments o a la
  protección de datos y artefactos de Production. Eliminar aserciones
  históricas de scripts de build fuera de ese alcance sin sustituirlas
  automáticamente. Consultar al operador antes de añadir un reemplazo por
  un riesgo operativo demostrado.
- Una función de aptitud arquitectónica debe identificar la característica
  arquitectónica, el criterio objetivo de aceptación y su ejecución.
  Distinguir entre probar la implementación de una regla y ejecutar esa
  regla sobre el código del repositorio.

### Perfiles, evaluaciones y verificación

- Hacer que el comando unitario raíz cubra todos los paquetes del workspace
  y la suite Python independiente del Model Gateway; conservar la selección
  por paquete y archivo. Actualizar conjuntamente scripts de paquetes,
  selección de runners, imports, puntos de entrada de CI y documentación.
  Una suite ausente o un comando hijo fallido no deben notificarse
  silenciosamente como éxito.
- El perfil unitario por defecto es autocontenido y puede crear y limpiar
  sus propios recursos temporales, subprocesos o sockets locales. No debe
  requerir PostgreSQL aprovisionado ni otro servicio preexistente. Ofrecer
  un perfil explícito y seleccionable para tests que requieran infraestructura
  aprovisionada e incluirlo en la verificación completa. Aislar los datos
  compartidos y evitar la limpieza destructiva global.
- Trasladar el entorno de ejecución de evaluaciones de calidad de modelos
  fuera de los directorios de tests, actualizar sus referencias y
  configuración y mantenerlo fuera del comando unitario. Preservar la
  semántica de ejecución y documentar la discrepancia existente entre la
  descripción de modelos reales y el uso de Test Environment/Mock Model
  Gateway; no afirmar calidad de modelos ni redirigir las evaluaciones a
  proveedores reales en este trabajo.
- En verificación rápida, informar explícitamente de la ausencia del bundle
  de cliente en lugar de presentar la inspección como satisfactoria. En
  verificación completa, generar primero el build de verificación aislado y
  exigir después la inspección satisfactoria del bundle recién generado.
  Un artefacto ausente, un build fallido, una inspección fallida o la
  inspección exclusiva de un bundle desactualizado deben hacer fallar la
  verificación completa.
- No ejecutar nunca un build de Production ni modificar los procesos, datos
  o artefactos de Production en vivo. Seguir las salvaguardas operativas de
  aprobación previa del repositorio; validar la compilación mediante el
  build aislado de verificación.
- Actualizar las instrucciones y la documentación directamente afectadas
  para describir los comandos, perfiles, rutas y limitaciones implementados
  en lugar del estado de transición anterior.

## Decisiones de testing

- Un buen test demuestra una garantía observable y significativa en una
  frontera estable de la capacidad, con colaboración realista entre
  componentes propios y dependencias externas controladas. Comprueba
  resultados, estado persistido, errores o contratos de frontera relevantes,
  no estructura incidental de implementación. Varias aserciones son adecuadas
  cuando juntas establecen una garantía; los fallos distintos deben seguir
  siendo diagnosticables.
- Probar las capacidades del chatbot, incluidas Compaction, Chat Mode
  routing, Hub, historial y navegación de Chat, Projects, Attachments,
  Prompt Refiner y Background Generation, según sus garantías realmente
  soportadas. Verificar el comportamiento de Coding Agent Client, los
  contratos y la entrega de artefactos de Coding Agent Worker, el
  comportamiento y los guardarraíles de despliegue del Model Gateway, y las
  garantías pertinentes de configuración compartida y tracing.
- Los tests existentes del flujo de Compaction son un ejemplo previo de
  frontera social de capacidad con PGlite y respuestas HTTP controladas del
  Model Gateway. Los tests de routing basados en el Gateway son un ejemplo
  de fallos de protocolo realistas. No se asume que ninguno sustituya todas
  las reglas más específicas ni todos los recorridos de navegador: demostrar
  cada equivalencia afirmada.
- La suite HTTP aislada del servidor de artefactos, la suite del guard de
  cambios sin confirmar con repositorio temporal y los casos de navegación y
  recuperación en navegador son ejemplos previos de riesgos distintos de
  conexión del servidor, subprocesos y navegador real. Preservar sus
  garantías significativas aunque cambien de categoría u organización.
- Ejercitar los comandos públicos de test y verificación con selecciones
  representativas por paquete y archivo, incluido un caso Python, para
  demostrar el descubrimiento esperado y la propagación de errores. Verificar
  la separación de perfiles y que el perfil por defecto funcione sin
  servicios aprovisionados previamente.
- Demostrar el comportamiento de la comprobación del bundle cuando el
  artefacto falta en verificación rápida y ante artefactos ausentes,
  desactualizados y recién generados en verificación completa. Demostrar que
  la inspección exigida se ejecuta realmente sobre la salida aislada
  reciente y que los fallos se propagan; no confiar únicamente en el orden
  de comandos.
- Ejecutar tests acotados durante los cambios y después lint, type-check,
  perfiles autocontenido y de recursos aprovisionados, E2E y build aislado
  de verificación cuando corresponda para validar la migración terminada.
  Informar explícitamente de los prerrequisitos no disponibles y de la
  cobertura no ejecutada. No usar evaluaciones con proveedores reales para
  validar esta migración.

## Fuera de alcance

- Nuevas funcionalidades de producto, cambios de comportamiento, cambios de
  esquema o una reescritura general del código de ejecución. La eliminación
  acordada del setter de la factoría de runtime utilizado solo por tests es
  la excepción expresamente identificada.
- Cambiar la integración con proveedores del Model Gateway o inventar un
  puerto genérico de IA. Preservar el adaptador de imágenes necesario y los
  contratos existentes de producción.
- Un nuevo entorno de pruebas de componentes en navegador, una tercera
  categoría de tests, conectividad E2E real entre chatbot y Coding Agent
  Worker o paralelización histórica de E2E.
- Evaluaciones de calidad de modelos con proveedores reales, cambios en el
  Environment o la semántica de las evaluaciones, cambios de correlación en
  producción y umbrales de rendimiento.
- Builds de Production, reinicios de servicios, limpieza destructiva de
  recursos compartidos o cambios en datos o artefactos de Production sin
  aprobación explícita independiente del operador.

## Notas adicionales

- El ADR 0013 es la política autoritativa; la spec anterior de testing del
  Model Gateway describe una migración original de funcionalidades distinta
  y esta migración de la suite no la sustituye en su totalidad.
- La revisión anterior descubrió 51 casos Playwright en 16 archivos, de los
  que entonces 41 estaban activos y 10 omitidos o marcados como fixme. Tratar
  esto como una referencia fechada, no como objetivo de finalización; volver
  a descubrir la suite actual.
- Los casos omitidos incluían cuatro escenarios de scroll/navegación, uno de
  configuración de modelo, dos de Project y tres de Coding Agent. Algunos
  mezclan comportamiento obsoleto y potencialmente soportado. La
  clasificación histórica de los casos individuales era provisional y no
  se había demostrado que la mayoría de los reemplazos sociales propuestos
  fueran equivalentes exactos.
- Los escenarios de scroll infinito y recuperación requieren especial
  cuidado: distinguir las reglas de datos comprobables sin navegador de las
  garantías reales de viewport, navegación, recarga o recuperación del
  cliente.
- Existe una discrepancia conocida entre el título y las aserciones de un
  test del punto de corte de Compaction con un único Message. Determinar el
  comportamiento esperado antes de cambiar la garantía protegida; ni la
  implementación actual ni el texto del test son autoritativos por sí solos.
- El runner de evaluaciones y su documentación no coinciden sobre el uso de
  respuestas de modelos reales o simuladas. Preservar y explicar esta
  limitación hasta que la resuelva una investigación de evaluaciones
  autorizada por separado.
