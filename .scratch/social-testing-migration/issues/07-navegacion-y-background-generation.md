# 07: Revisar navegación y Background Generation

**What to build:** Mantener cobertura realista de navegación, geometría,
scroll y recuperación del cliente, sin afirmar que una simulación prueba
suspensión real del dispositivo.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** done

- [x] Se revisa cada escenario de navegación, posición, viewport, scroll y recuperación por su garantía concreta, incluidos los cuatro escenarios de navegación omitidos.
- [x] Se conservan y justifican los riesgos distintos que requieran navegador real; las reglas comprobables fielmente sin él se llevan a tests sociales con cobertura equivalente.
- [x] Se conserva la simulación acordada de interrupción de red y cambio de visibilidad de Background Generation; su descripción no afirma suspensión del sistema operativo ni apagado real de pantalla.
- [x] Los escenarios omitidos se investigan como ausencia de cobertura y se restauran o eliminan justificadamente; se consulta al operador ante dudas funcionales.
- [x] Se registran las garantías y decisiones en los comentarios y se ejecutan las pruebas afectadas con recursos de Test Environment aislados.

## Evidence

Four previously skipped navigation cases were re-enabled after a real wheel
gesture released the initial anchor lock. Each passed ten repetitions (40/40);
the full navigation spec passed three repetitions (36/36).
Background Generation tests simulate fetch interruption and visibility events;
they do not prove OS suspension or a real screen turning off.
