# Plan de Pruebas: Chat Hub - AI Chatbot

## Resumen de la Aplicación
El **Chat Hub** es una funcionalidad avanzada que permite a los usuarios interactuar con múltiples modelos de IA de forma simultánea. Los usuarios pueden comparar respuestas, refinar prompts y persistir conversaciones específicas.

### Características Principales:
- **Soporte Multi-Modelo**: Hasta 3 modelos simultáneos seleccionables.
- **Interfaz Responsiva**: Grid ajustable en resolución 2xl y navegación por pestañas en resoluciones menores (móvil/tablet).
- **Bloqueo de Sesión**: La configuración de modelos se bloquea tras el primer mensaje enviado.
- **Persistencia Individual**: Botón para "promocionar" una de las conversaciones del Hub a un chat individual persistente.
- **Herramientas Compartidas**: Soporta refinamiento de prompts, adjuntos y herramientas (RAG/Web Search) aplicadas a todos los modelos.

---

## Escenarios de Prueba

### 1. Gestión de Modelos (Happy Path & Límites)
**Punto de partida**: `/chat/hub` en estado limpio.

#### 1.1 Agregar modelos hasta el límite
**Pasos**:
1. Navegar a `/chat/hub`.
2. Hacer clic en el selector de modelos y elegir un modelo (ej. `Meta Llama 3`).
3. Hacer clic en el botón "+" (Add Model).
4. Seleccionar un segundo modelo diferente (ej. `GPT OSS`).
5. Repetir para un tercer modelo.
**Resultados Esperados**:
- El botón "+" desaparece al alcanzar el límite de 3 modelos.
- El selector de modelos de cada instancia no muestra modelos ya seleccionados (deduplicación).
- El modelo "Router" no aparece en la lista de selección del Hub.

#### 1.2 Eliminación de modelos
**Pasos**:
1. Agregar 3 modelos.
2. Hacer clic en el icono "X" (Eliminar) en uno de los paneles (o en el botón de cerrar pestaña si es móvil).
**Resultados Esperados**:
- El panel/pestaña se elimina de la interfaz.
- El botón "+" vuelve a aparecer al haber menos de 3 modelos.

---

### 2. Mensajería Multi-Modelo
**Punto de partida**: 3 modelos seleccionados en el Hub.

#### 2.1 Envío de mensaje simultáneo
**Pasos**:
1. Escribir "Explica la teoría de la relatividad" en el campo de texto central.
2. Presionar Enter o clic en "Enviar".
**Resultados Esperados**:
- Los 3 paneles/pestañas muestran el mensaje del usuario.
- Los 3 modelos inician el streaming de respuesta simultáneamente.
- El botón "Add Model" y los selectores de modelo se ocultan/deshabilitan (Estado de Bloqueo).
- El botón "Select this chat" aparece debajo de cada respuesta una vez finalizada.

#### 2.2 Navegación en Tablet/Móvil
**Pasos**:
1. Redimensionar el navegador a resolución de Tablet (ej. 768px).
2. Verificar que se visualiza un modelo a la vez con pestañas superiores.
3. Cambiar de pestaña mientras los modelos están respondiendo.
**Resultados Esperados**:
- El streaming no se interrumpe al cambiar de pestaña.
- El indicador de carga es independiente para cada modelo.

---

### 3. Persistencia y Navegación
**Punto de partida**: Una sesión de Hub activa con respuestas recibidas.

#### 3.1 Persistir una conversación específica
**Pasos**:
1. En el panel del segundo modelo (ej. `Claude`), hacer clic en "Select this chat".
**Resultados Esperados**:
- El usuario es redirigido a una nueva URL de chat (ej. `/chat/[uuid]`).
- El historial de ese chat contiene solo los mensajes intercambiados con ese modelo específico.
- El chat aparece en la Sidebar con un título generado automáticamente acorde a la respuesta.

---

### 4. Casos de Error y Estados de Carga
#### 4.1 Error en uno de los modelos
**Pasos**:
1. Iniciar un Hub con 3 modelos.
2. Enviar un mensaje.
3. Simular un fallo de red o API en uno de los modelos.
**Resultados Esperados**:
- El panel con error muestra un mensaje de error y un botón de "Retry".
- Los otros dos modelos continúan funcionando con normalidad sin verse afectados.

#### 4.2 Estado de Carga (Loading)
**Pasos**:
1. Observar la interfaz inmediatamente después de enviar un mensaje.
**Resultados Esperados**:
- El botón de enviar está deshabilitado (`disabled`).
- El icono de "Refine prompt" está deshabilitado mientras hay mensajes generándose.
- Cada panel muestra un estado de carga (skeleton o spinner) antes de iniciar el streaming.

---

### 5. UI y Responsividad
#### 5.1 Ajuste de Grid Desktop
**Pasos**:
1. Alternar entre 1, 2 y 3 modelos en una pantalla con resolución `> 1536px` (2xl).
**Resultados Esperados**:
- 1 modelo: Panel ocupa todo el ancho central.
- 2 modelos: Grid de 2 columnas (división vertical).
- 3 modelos: Grid de 3 columnas horizontales.

---

## Notas Técnicas para el Tester
- **Selectores**: Priorizar `getByRole('combobox')` para modelos y `getByRole('button', { name: 'Select this chat' })` para persistencia.
- **Filtros**: El Hub excluye automáticamente modelos que no soportan comparación.
- **Estado de Bloqueo**: Una vez enviado el primer mensaje, el Hub entra en modo lectura/respuesta para la configuración de modelos hasta que se inicie una nueva sesión.
