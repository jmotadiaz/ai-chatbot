# 04: Rehidratación y casos límite

**What to build:** recargar con cola pendiente rehidrata el chip desde el worker; un Turn que falla con chip pendiente deja un estado definido y visible; encolar con el worker inalcanzable muestra error sin perder el texto redactado.

**Blocked by:** 02 (Acciones del chip), 03 (Guardas y estados del composer).

**Status:** ready-for-agent

- [ ] Recargar con Mensaje en Espera pendiente rehidrata el chip desde el worker
- [ ] Un Turn que falla con chip pendiente deja estado definido sin ejecuciones fantasma
- [ ] Encolar con el worker inalcanzable muestra error y conserva el texto
- [ ] Suites rápidas del repo en verde (lint, type-check, tests afectados)
