# 12: Migrar las pruebas del Model Gateway

**What to build:** Organizar y consolidar las pruebas del Model Gateway y
de su toolkit JavaScript bajo la taxonomía acordada, preservando las
decisiones distintas del guard de despliegue.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían y migran las pruebas Python del Model Gateway y las del toolkit JavaScript, manteniendo el carácter independiente del servicio y la selección por archivo.
- [ ] Se conservan los contratos y fallos significativos del catálogo, el servicio y el toolkit; se consolidan solo garantías duplicadas demostradas.
- [ ] El guard de despliegue con cambios sin confirmar conserva cobertura de la interacción y del override explícito; se simplifican variantes equivalentes sin presentar el guard como frontera de seguridad.
- [ ] La prueba del guard usa un repositorio temporal y no despliega servicios; ninguna prueba requiere proveedores reales ni modifica Production.
- [ ] Se registran las decisiones y equivalencias en los comentarios y se ejecutan las suites afectadas, incluida la Python.
