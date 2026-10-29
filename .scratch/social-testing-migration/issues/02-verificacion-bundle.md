# 02: Hacer fiable la inspección del bundle

**What to build:** Permitir que el operador distinga una inspección real del
bundle de cliente de una comprobación no realizada, y garantizar que la
verificación completa inspecciona el resultado recién generado de forma
aislada.

**Blocked by:** Ninguno (puede comenzar inmediatamente).

**Status:** ready-for-agent

- [ ] La verificación rápida informa explícitamente cuando el bundle no está disponible y no presenta una inspección omitida como inspección satisfactoria.
- [ ] La verificación completa ejecuta primero el build de verificación aislado y exige después una inspección satisfactoria de su resultado reciente.
- [ ] Un build o inspección fallidos, un artefacto ausente tras el build o la inspección exclusiva de un artefacto desactualizado hacen fallar la verificación completa.
- [ ] Los tests demuestran los casos de artefacto ausente, desactualizado y reciente, incluida la ejecución efectiva de la inspección y la propagación de errores.
- [ ] Las instrucciones afectadas describen el comportamiento real; no se ejecuta un build de Production ni se modifican sus artefactos.
