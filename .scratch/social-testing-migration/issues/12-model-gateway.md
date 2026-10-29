# 12: Migrar las pruebas del Model Gateway

**What to build:** Organizar y consolidar las pruebas del Model Gateway y
de su toolkit JavaScript bajo la taxonomía acordada, preservando las
decisiones distintas del guard de despliegue.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** done

- [x] Se inventarían y migran las pruebas Python del Model Gateway y las del toolkit JavaScript, manteniendo el carácter independiente del servicio y la selección por archivo.
- [x] Se conservan los contratos y fallos significativos del catálogo, el servicio y el toolkit; se consolidan solo garantías duplicadas demostradas.
- [x] El guard de despliegue con cambios sin confirmar conserva cobertura de la interacción y del override explícito; se simplifican variantes equivalentes sin presentar el guard como frontera de seguridad.
- [x] La prueba del guard usa un repositorio temporal y no despliega servicios; ninguna prueba requiere proveedores reales ni modifica Production.
- [x] Se registran las decisiones y equivalencias en los comentarios y se ejecutan las suites afectadas, incluida la Python.

## Evidencia

- Suites Python y JavaScript trasladadas a `tests/unit`; el inventario de
  garantías y decisiones está en `docs/model-gateway-testing-migration.md`.
- El guard conserva el prompt interactivo y el override explícito. La variante
  `y` se consolidó con el caso equivalente; se añadieron variantes en
  mayúsculas y con acento. El repositorio usado por los tests es temporal.
- Python: 56 tests pasan con `LC_ALL=C` y `en_US.UTF-8`; `pnpm test:gateway`
  pasa. JavaScript: 48 tests pasan, lint y type-check limpios.
- No se ejecutó `deploy.sh` ni se tocó Production. `litellm` no estaba
  instalado y la comprobación de `server.py` es estática. La matriz Bash 3.2
  de los casos nuevos no se repitió tras el último cambio.
