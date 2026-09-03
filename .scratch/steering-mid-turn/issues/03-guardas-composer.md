# 03: Guardas y estados del composer

**What to build:** en Turn activo y con chip pendiente el composer aplica los bloqueos acordados: todo deshabilitado salvo chip y cancelar; attachments, skills, prompts y comentarios deshabilitados (texto plano v1); modelo y thinking deshabilitados; sin Turn activo el Enviar abre un Turn nuevo; abortar con chip pendiente devuelve el texto al textarea.

**Blocked by:** 01 (Encolar Mensaje en Espera y verlo ejecutarse).

**Status:** ready-for-agent

- [ ] Con chip pendiente solo quedan vivos el chip y cancelar; el resto del composer está deshabilitado
- [ ] En Turn activo no se pueden cambiar modelo/thinking ni adjuntar attachments, skills, prompts o comentarios
- [ ] Sin Turn activo, Enviar abre un Turn nuevo en vez de encolar
- [ ] Abortar con chip pendiente devuelve el texto al textarea sin ejecutarlo
