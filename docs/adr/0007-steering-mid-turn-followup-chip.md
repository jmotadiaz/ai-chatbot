# Steering mid-turn en dos fases (followUp → steer)

El coding agent necesitaba recibir instrucciones en mitad de un Turn sin abortar tools en curso. Se decide un chip único de **Mensaje en Espera** (texto plano v1): el botón followUp nuevo —a la izquierda del submit, que conserva su dualidad enviar/cancelar— encola como `followUp`; el chip ofrece editar (`clearQueue()` + vuelta al textarea), eliminar (`clearQueue()` + descartar) y enviar (`clearQueue() + steer()`, sin duplicar). Con chip pendiente el composer queda deshabilitado salvo chip y cancelar; modelo, thinking, attachments, skills, prompts y comentarios también se deshabilitan en Turn activo; abortar con chip devuelve el texto al textarea; al reconectar se rehidrata el chip desde el worker.

## Considered Options

- **Borrador local + steer directo**: descartado porque el chip debe sobrevivir como estado del worker (visible tras reconexión) y porque `followUp` expresa "al final" frente a `steer` ("siguiente request").
- **`followUp()` + `steer()` sin limpiar**: descartado porque el SDK (dos colas sin dedup) lo ejecuta dos veces, con doble coste LLM.
- **Submit dual (idle=enviar, running=followUp)**: descartado para no bifurcar la lógica del submit; el followUp tiene botón propio.

## Consequences

- El worker necesita endpoints finos de texto (`steer`/`followUp` vía `clearQueue()` + re-encolado) y el traductor debe visibilizar el mensaje inyectado dentro del mismo Turn; `Turn` deja de ser "un user message" y pasa a incluir inyecciones en curso.
- Cambio de modelo/thinking mid-turn queda bloqueado en UI y worker: el SDK snapshottea la config al arrancar el run y lo ignoraría hasta el próximo Turn.
