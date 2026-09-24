# 06: Model Roles para las features que hoy nombran modelos por id

**What to build:** título de chat, extracción de memoria y descomposición de queries, resumen de búsqueda web, edición de imagen, meta-prompt, workflows de english y compaction obtienen su Model Configuration por Model Role a través del kit (`languageModel(role)` o `createAgent(role, …)`), en lugar de por id literal. Cambiar el modelo de cualquiera de esos roles es una edición de `MODEL_ROLES` en el Model Catalog. El comportamiento de cada feature no cambia.

**Blocked by:** 02 (kit con resolución por id).

**Status:** ready-for-agent

- [ ] `MODEL_ROLES` en `models` cubre los roles internos que hoy se nombran por id: título de chat, extracción de memoria, descomposición de queries de memoria, resumen de búsqueda web, edición de imagen, meta-prompt (sus tres usos), los pasos de los workflows de english y el modelo de compaction. Cada rol apunta a un id existente en `MODEL_CATALOG`; los roles no son seleccionables desde la UI.
- [ ] El kit acepta rol o id en `languageModel` y expone `createAgent(idOrRole, { instructions, tools, overrides })` que devuelve un `ToolLoopAgent` con el modelo trazado cuando el tracing está activo, cubriendo el patrón repetido en los Chat Modes.
- [ ] Las features listadas migran a rol; ninguna de ellas contiene un id literal de modelo. Los Chat Modes seleccionables siguen recibiendo el id del usuario.
- [ ] Unit del paquete: invariante de catálogo (cada rol resuelve a una entrada existente) y resolución por rol devuelve la misma configuración que por id.
- [ ] Los tests de configuración por modelo existentes siguen pasando; los tests de las features migradas no cambian de aserciones.
- [ ] `pnpm verify:fast` en verde; `pnpm build:verify` compila.

## Comments
