# Testing del Model Gateway y módulos funcionales concretos

Estado: diseño aceptado; implementación pendiente.

Decisión arquitectónica:
[ADR 0013](../../docs/adr/0013-model-gateway-testing-and-social-unit-tests.md).

Esta especificación conserva el alcance y la secuencia originales de la
migración del Gateway. El ADR se ha actualizado posteriormente con el criterio
vigente de clasificación de tests, la organización objetivo y los perfiles;
esas decisiones prevalecen sobre cualquier descripción anterior de esta
especificación. La reorganización de tests sigue pendiente.

## Objetivos

- Verificar comportamiento determinista del software sin proveedores reales.
- Simplificar conjuntamente la composición de producción y la preparación de pruebas.
- Mantener encapsulado el comportamiento de cada feature, retirando interfaces de
  inyección de IA cuyo único propósito sea introducir dobles de prueba.
- Compartir herramientas del protocolo del Gateway entre chatbot y Coding Agent
  Worker sin trasladar al Gateway los catálogos de test específicos de la aplicación.
- Usar social unit tests por defecto y reservar E2E para garantías que requieran
  recorrer el producto desplegado.
- Evitar estado global mutable de escenarios que obligue a ejecutar secuencialmente.

Este diseño no añade un cliente JavaScript de producción, no cambia el protocolo
de imágenes, no evalúa calidad de modelos, no introduce reconfiguración remota de
escenarios y no incluye paralelizar la suite E2E histórica.

La adaptación del catálogo, modelos y escenarios E2E al toolkit oficial sí está
incluida. La reclasificación, reducción o traslado de los E2E actuales según la
heurística del ADR queda fuera de este trabajo y se abordará en otro issue.

## 1. Estructura objetivo de los módulos

```text
Interfaz pública de la feature
  |
Implementación concreta de la feature
  +-- reglas de dominio, prompts, validación y transformaciones
  +-- persistencia y otras responsabilidades de la feature
  |
Infraestructura de inferencia existente
  +-- integración con SDK, configuración y trazas
  +-- adapters técnicos necesarios, incluido el de imágenes
  |
Interfaz HTTP del Model Gateway
  |
Implementación del Gateway o doble determinista
```

Las pruebas entran por la interfaz de la feature. HTTP es la seam donde se sustituye
la dependencia del Gateway, no un reemplazo de las assertions sobre su comportamiento.

Las features no necesitan un puerto público de IA, una implementación fake ni un
parámetro de factoría exclusivamente para permitir pruebas. Retirar esos elementos
no debe trasladar comportamiento de dominio a sus consumidores, al paquete oficial
de testing ni al Gateway. Se conservan los helpers internos y tipos de dominio que
aporten valor. Una variación real de producción o un módulo con responsabilidad
independiente puede seguir justificando una interfaz.

Las features concretas continúan usando la infraestructura de inferencia existente.
Deben preservar las restricciones de imports de SDK, las trazas, la resolución de
configuración y la precedencia de parámetros, sin saltarse esas protecciones.

## 2. Tratamiento de las dependencias

### In-process

La lógica pura puede consolidarse y probarse directamente mediante la interfaz
correspondiente. No necesita HTTP, MSW ni un adapter. Las pruebas pequeñas existentes
siguen siendo útiles cuando cubren comportamiento independiente y no composición
que vaya a desaparecer.

### Base de datos: Local-substitutable

En los social unit tests que tocan persistencia se utiliza siempre PGlite en memoria
(`setupTestDb()` con soporte `pgvector`), por lo que son autocontenidos y no requieren
un contenedor PostgreSQL levantado. En pruebas que requieran infraestructura externa
o ensamblaje E2E se utilizan recursos PostgreSQL controlados (`:5434`) y datos aislados.

La colaboración con la base de datos queda dentro de la implementación de la
feature. No se añade un puerto de repositorio únicamente para inyectar un fake.
Las pruebas pueden verificar persistencia mediante la feature y observaciones
controladas de la base de datos.

En instancias PGlite dedicadas a un test o archivo secuencias locales son seguras;
cuando se comparta un servidor PostgreSQL real entre pruebas, los usuarios por test
ayudan a aislar datos y la limpieza debe acotarse a los recursos de la prueba sin
convertir un borrado destructivo global en requisito.

### Model Gateway: Remote but owned

El contrato HTTP que controlamos es la seam compartida. Las pruebas mantienen la
integración del cliente de producción, incluida la serialización de peticiones
y la interpretación de respuestas.

A diferencia de la receta literal de adapters inyectados de
[Deepening](../../.agents/skills/codebase-design/DEEPENING.md), no se inyecta un
adapter de IA en memoria en cada feature. Dentro del proceso se usa MSW para
responder a las peticiones HTTP salientes; entre procesos se utiliza un servidor
HTTP real. Es un trade-off deliberado: menos composición y más integración
ejercitada por prueba.

### Proveedores externos: True external

Esta categoría se aplica desde la perspectiva del Gateway. Las pruebas de chatbot
y Worker no reproducen las particularidades de todos los proveedores ni requieren
credenciales externas.

El doble no demuestra que el Gateway real o un proveedor cumplan todas las
expectativas. Se conservan las comprobaciones de contrato existentes, distinguiendo
su propósito de las pruebas de comportamiento de la aplicación.

## 3. Paquete JavaScript oficial de testing

Ubicación propuesta: `packages/model-gateway/js/`, con manifiesto propio. El nombre
exacto del paquete y la configuración de compilación y exports se contrastarán con
las convenciones del workspace durante la implementación. No se presupone publicar
en un registro. El Gateway Python debe seguir ejecutándose sin Node ni dependencias
del workspace.

Superficies de importación propuestas:

- `model-gateway/test`: factoría configurable de escenarios, fixtures del protocolo,
  observación de peticiones y handlers MSW.
- `model-gateway/test/server`: arranque y cierre del servidor HTTP de Node.

El export principal de testing no debe importar anticipadamente el servidor HTTP.
El harness actual ha tenido problemas con imports del servidor Node en workers
jsdom; la separación de exports debe evitar reproducirlos.

### Responsabilidades del paquete

- Construir respuestas del catálogo a partir de definiciones del consumidor.
- Proporcionar respuestas reutilizables para las operaciones necesarias en las
  pruebas migradas: texto, herramientas, imágenes, Decisions y, posteriormente,
  embeddings y rerank cuando se necesiten.
- Implementar una sola vez la codificación de respuestas y streaming para ambas
  integraciones.
- Registrar peticiones y permitir limpiar el estado de cada instancia de escenario.
- Señalar explícitamente peticiones no soportadas o configuración inválida, sin
  devolver respuestas de éxito genéricas.
- Tener pruebas propias del protocolo y del ciclo de vida del servidor.

El paquete no debe convertirse en otro LiteLLM. El soporte se amplía según las
migraciones reales de los consumidores, preservando el comportamiento necesario.

### Responsabilidades de los consumidores

- Definir identificadores de modelos de test, metadatos de capacidades y catálogos
  específicos de la aplicación.
- Definir perfiles E2E con nombre y respuestas de operaciones internas.
- Configurar expectativas locales y comprobar resultados de las features.
- Gestionar hooks del runner, recursos, autenticación y arranque de la aplicación.

El paquete no registra hooks de Vitest ni oculta MSW tras otra API de ciclo de vida.
Una factoría pequeña puede agrupar handlers, peticiones registradas y estado del
escenario; el setup MSW del consumidor controla el inicio y cierre de la interceptación.

## 4. Configuración de escenarios

### Social unit tests

Cada test configura su propia instancia de escenario y utiliza la implementación
real de la feature. Las respuestas son explícitas, en lugar de seleccionarse mediante
una lista global creciente de identificadores de modelos-escenario.

Las peticiones registradas permiten comprobar contratos de modelo, parámetros e
inputs relevantes. No deben convertir cada prueba en una instantánea exacta de
prompts internos o de la coreografía de llamadas.

### E2E del chatbot

El harness del chatbot define y registra su catálogo y perfiles de modelos-escenario
al arrancar. El catálogo permanece estable durante la ejecución, sin mutaciones por
test que interfieran con la caché del catálogo de la aplicación.

Se migran las definiciones actuales a los mecanismos del paquete oficial,
preservando las garantías de los E2E que las consumen. El catálogo, los modelos,
sus capacidades y los escenarios siguen siendo propiedad del chatbot. Se retira
la construcción anterior cuando quede sustituida, sin mantener implementaciones
equivalentes en paralelo.

Las definiciones cubren también operaciones internas y Default Model Contracts.
No basta con configurar el modelo seleccionado por el usuario cuando la feature
también realiza Decisions u otras operaciones de inferencia.

El comportamiento de routing específico de la aplicación pertenece a las
definiciones de test del consumidor, no al paquete oficial ni a una composición
de producción distinta para test.

### Estado y ciclo de vida

- Las definiciones de perfiles pueden compartirse; el estado de ejecución no es global.
- Cada stream mantiene su propio estado y recursos.
- Las continuaciones de herramientas pueden derivar su respuesta del historial
  recibido, en lugar de usar un contador global de primera y segunda llamada.
- Las instancias locales pueden expresar secuencias sin compartir colas con otros tests.
- Un E2E que necesite estado mutable entre peticiones indistinguibles requiere una
  decisión específica de aislamiento; no debe introducir estado global implícitamente.
- Cuando un escenario dependa del tiempo, usar sincronización explícita si hace
  falta, en lugar de depender únicamente de pausas arbitrarias.
- La limpieza debe atender los streams y recursos que pertenecen a la prueba.
  Una desconexión del navegador durante Background Generation no equivale a
  finalizar el test ni a cancelar la operación de inferencia.

No se selecciona una API general de control remoto de escenarios ni un mecanismo
de correlación en producción dedicado al testing. El diseño no debe asumir un
único worker de Playwright, pero no se fija un número de workers ni un umbral de
rendimiento como criterio de aceptación.

## 5. Migración de features

### Compaction: primer corte vertical

Referencias actuales:
[puerto de IA](../../packages/chatbot/lib/features/compaction/ports.ts),
[adapter](../../packages/chatbot/lib/features/compaction/adapters/ai-adapter.ts),
[generación del resumen](../../packages/chatbot/lib/features/compaction/summary-generation.ts),
[pruebas del resumen](../../packages/chatbot/tests/unit/compaction/summary-generation.test.ts)
y [flujo con persistencia](../../packages/chatbot/tests/integration/compaction/compaction-flow.test.ts).

Consolidar la llamada concreta de inferencia dentro de la feature, preservando:

- Selección del contrato de modelo para texto o contenido multimedia.
- Construcción del prompt, temperatura, resumen devuelto y `modelUsed`.
- Persistencia y comportamiento ante errores.

Sustituir los fakes de IA inyectados por respuestas HTTP controladas al probar la
interfaz correspondiente. Mantener pruebas de reglas puras cuando aporten valor.
Retirar el puerto, adapter, parámetros de composición y pruebas obsoletas solo
después de contabilizar sus consumidores y garantías equivalentes.

Comparar preparación, código eliminado, claridad de diagnóstico, cobertura de
comportamiento y coste de ejecución antes de extender el patrón. No se fija un
objetivo numérico.

### Features posteriores

| Feature | Simplificación prevista | Comportamiento que mantiene la feature |
|---|---|---|
| English workflows | Consolidar clasificación y generación; retirar composición de IA exclusiva de testing. | Schemas, prompts, delimitadores, validación y transformaciones de salida. |
| Chat Mode Router | Usar el router real basado en Decisions en todos los Environments; simular Decisions por HTTP. | Mapeo de Chat Modes, validación, procedencia y errores. |
| Imágenes | Sustituir stubs de transporte duplicados por fixtures del protocolo. | Adapter necesario para el SDK y comportamiento de archivos generados. |
| RAG | Revisar puertos de inyección cuando existan herramientas deterministas de embeddings y rerank. | Asociación chunk/vector, batching, filtrado, ranking, parsing y persistencia. |
| Construcción del agente de chat | Revisar interfaces exclusivas de inyección y confirmar si puede borrarse el adapter aparentemente sin consumidores. | Precedencia de parámetros, resolución del modelo con trazas y composición de modos. |
| Coding Agent Worker | Reutilizar herramientas oficiales en sus pruebas separadas donde sustituyan fakes de transporte. | Aislamiento del runtime, seguridad del filesystem y comportamiento de eventos/transporte. |

Para RAG se utilizan vectores y rankings preparados, no embeddings reales ni un
algoritmo que simule inteligencia. Los helpers necesarios no desaparecen por el
mero hecho de retirar una interfaz de inyección.

## 6. Selección y ejecución de pruebas

La política de selección entre social unit y E2E tiene como fuente de verdad el
[ADR 0013](../../docs/adr/0013-model-gateway-testing-and-social-unit-tests.md).
Esta migración aplica esa política a las pruebas nuevas o sustituidas de las
features, sin inventariar ni reclasificar los E2E actuales.

Los requisitos de recursos y el propósito de contrato siguen siendo identificables
independientemente de las dos categorías.

La ejecución unit por defecto es autocontenida (incluyendo los social unit tests que
usan PGlite y MSW). Un perfil explícito de infraestructura selecciona pruebas que
requieren un PostgreSQL externo u otros recursos provisionados; la verificación completa
incluye ambos perfiles y los E2E correspondientes. Los nombres de comandos y mecanismos
de selección se resuelven durante la implementación.

No renombrar mecánicamente todas las pruebas integration a unit. Primero inventariar
su alcance, recursos y garantías. Conservar las comprobaciones necesarias mientras
se actualizan consumidores y documentación de la organización anterior.

Los E2E del chatbot mantienen el stub del Worker. Las pruebas separadas del Worker
no implican que esos E2E cubran el ensamblaje chatbot-Worker real.

## 7. Despliegue de la migración y contabilidad de cobertura

1. Extraer los mecanismos reutilizables del mock al paquete oficial, manteniendo
   catálogo y escenarios en los consumidores y el aislamiento actual del Test
   Environment. No combinar la extracción con consolidación de features o cambios
   de nombres de suites.
2. Construir el catálogo y los perfiles E2E del chatbot con el toolkit oficial,
   manteniendo sus garantías sin reclasificar los tests. Este trabajo puede avanzar
   en paralelo con Compaction una vez extraídos los mecanismos comunes.
3. Completar Compaction como primer corte vertical de feature, sustituyendo su seam de testing
   y retirando la composición obsoleta en la misma migración.
4. Extender a English, al router real de Chat Modes y al resto de candidatos
   justificados después de evaluar Compaction, preservando sus garantías. El router
   requiere además los perfiles E2E que mantengan deterministas sus Decisions.
5. Reorganizar la selección de pruebas locales cuando se conozcan alcance y requisitos.
   Retirar el mock HTTP global de Vitest únicamente cuando ninguna prueba lo necesite;
   las pruebas con MSW no deben requerir además un servidor HTTP escuchando.

Para cada prueba o doble sustituido dentro de este alcance, registrar dónde quedan
cubiertas sus garantías. La revisión de los E2E existentes según la heurística del
ADR y su posible traslado a social unit pertenecen a otro issue.

No mantener indefinidamente estrategias antiguas y nuevas equivalentes, pero tampoco
borrar casos independientes solo para reducir el número de pruebas. El adapter de
imágenes y las pruebas útiles de funciones puras no son objetivos de eliminación.

Las pruebas del Worker mantienen contextos controlados y recursos del runtime
aislados. No cambian la selección tipada de Environment, la configuración fija de
test ni el aislamiento de producción. No se introducen selectores mediante variables
de entorno ni ramas de inferencia de producción exclusivas para testing.

## Referencias

- [ADR 0010: Model Gateway independiente](../../docs/adr/0010-model-gateway-desacoplado.md)
- [Deepening: categorías de dependencias y sustitución de pruebas](../../.agents/skills/codebase-design/DEEPENING.md)
- [Fowler: Unit Test](https://martinfowler.com/bliki/UnitTest.html)
- [Fowler: Integration Test](https://martinfowler.com/bliki/IntegrationTest.html)
