# 08: Verificación final sin rastros

**What to build:** Comprobación de extremo a extremo de que no queda ningún rastro de la purga: el catálogo resultante es el especificado, ningún fichero activo referencia lo eliminado, y las suites y la compilación aislada están en verde. Es la única verificación de ausencia de todo el esfuerzo.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 09.

**Status:** ready-for-agent

- [ ] Un grep determinista sobre el repo no encuentra referencias al término eliminado en código, configuración ni documentación activa, excluyendo el propio esfuerzo (`.scratch/purga-skills/`), la salida generada (artefactos) y las trazas históricas.
- [ ] El catálogo de operador tiene 29 skills y ninguna de las 11 bajas está presente.
- [ ] Suites rápidas del repo en verde (`verify:fast`).
- [ ] Verificación de compilación aislada en verde (`build:verify`), nunca el build de producción.
- [ ] El chequeo de ausencia ha sido efímero: no se ha añadido ningún test permanente que lo codifique.
