# 📜 Directiva de Refactorización: Estandarización "User-Centric"

**Rol:** QA Automation Engineer.
**Objetivo:** Auditar la suite de pruebas E2E (`tests/e2e`) para eliminar selectores frágiles y condiciones de espera implícitas, reemplazándolos por una estrategia determinista basada en **Roles Semánticos** y **Texto Visible**.

---

## 1. Fase de Auditoría (Detectar "Code Smells")

Escanear todo el directorio de pruebas buscando los siguientes patrones anti-patrón que comprometen la estabilidad:

1. **Selectores Posicionales:** Uso de `.nth(index)`, `.first()`, o `.last()` para validar lógica de negocio (ej: "el tercer elemento es X").
* *Excepción:* Se permite su uso solo si es estrictamente necesario para iteración, no para aserción de identidad.


2. **Selectores Estructurales:** Uso de XPath complejos (ej: `ancestor::div`) o selectores CSS acoplados a la estructura del DOM (ej: `div > div > span`).
3. **Espera de Estados Internos:** Validaciones que dependen de la *ausencia* de elementos de carga (spinners, loaders invisibles) o el uso de `waitForTimeout`.
4. **Cálculos Manuales:** Lógica que depende de coordenadas de píxeles (`getBoundingClientRect`) o posiciones de scroll numéricas.

---

## 2. Protocolo de Refactorización

Para cada instancia detectada, aplicar el siguiente enfoque de tres pasos:

### Paso A: Garantizar Datos Deterministas (Fixtures)

Revisar la generación de datos en los archivos de configuración (`fixtures` o `beforeEach`).

* **Acción:** Asegurar que los datos generados (títulos, mensajes, nombres) contengan identificadores únicos y predecibles (ej: incluir un índice secuencial en el texto).
* **Meta:** Garantizar que cada elemento renderizado en la UI tenga un texto único que lo diferencie de sus hermanos.

### Paso B: Implementar Localizadores Semánticos

Sustituir los selectores frágiles por selectores orientados al usuario.

* **Antes (Prohibido):** Seleccionar por índice o estructura.
* **Después (Requerido):** Seleccionar combinando **Rol ARIA** + **Texto Único**.
* *Patrón:* `getByRole('listitem').filter({ hasText: 'Texto Único Generado' })`
* *Patrón:* `getByText('Texto Único Generado')`



### Paso C: Aserciones de Visibilidad Directa

Cambiar la lógica de espera.

* **Antes (Prohibido):** Esperar a que algo desaparezca o a que pase un tiempo arbitrario.
* **Después (Requerido):** Realizar la acción (ej: scroll, click) y esperar explícitamente (`await expect(...).toBeVisible()`) a que el elemento con el **Texto Único** aparezca en el viewport.

---

## ✅ Criterio de Aceptación Global

El código refactorizado debe cumplir:

1. **Legibilidad:** El test debe leerse como una acción de usuario ("Hago scroll y veo el elemento 'Item 5'").
2. **Robustez:** El test no debe fallar si cambia el orden del DOM, las clases CSS o la velocidad de la red, siempre que el texto sea visible.
3. **Cero Intrusión:** No se deben añadir `data-testid` al código de producción si existe texto visible único para localizar el elemento.
