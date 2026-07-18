# Playwright E2E Tests

Este directorio contiene las pruebas end-to-end (E2E) del proyecto usando Playwright.

## Estructura

```
tests/
├── fixtures.ts      # Fixtures para dependency injection (AI providers y DB mocks)
├── chat-page.ts     # Page Object Model para el chat
├── chat.spec.ts     # Tests E2E del chat
├── example.spec.ts  # Ejemplo básico de Playwright
└── README.md        # Esta documentación
```

## Fixtures

Los fixtures utilizan dependency injection para reemplazar los servicios reales con mocks durante las pruebas:

### AI Providers Mock
- Utiliza `MockLanguageModelV2` y `MockEmbeddingModelV2` de Vercel AI SDK
- Los modelos retornan respuestas predecibles para testing
- Se configura mediante `setProviders()` de `lib/ai/models/providers`
- Cada mock incluye el `modelId` en la respuesta

### Database Mock
- Utiliza `drizzle.mock()` con el schema de la aplicación
- Se configura mediante `setDb()` de `lib/db/db`

## Ejecutar Tests

```bash
# Ejecutar todos los tests
pnpm test:e2e

# Ejecutar tests con UI interactiva
pnpm test:e2e:ui

# Ejecutar tests con el navegador visible
pnpm test:e2e:headed

# Ejecutar un test específico
pnpm test:e2e tests/chat.spec.ts
```

## Page Objects

### ChatPage

El Page Object Model encapsula las interacciones con la interfaz del chat:

**Métodos principales:**
- `goto(chatId?)` - Navega a la página del chat
- `sendMessage(message)` - Envía un mensaje (escribe + submit)
- `typeMessage(message)` - Escribe un mensaje sin enviar
- `submitMessage()` - Envía el mensaje actual
- `waitForAssistantResponse()` - Espera la respuesta del asistente
- `waitForLoadingComplete()` - Espera que termine la carga
- `verifyAssistantResponded()` - Verifica que el asistente respondió
- `verifyAssistantResponseContains(text)` - Verifica que la respuesta contiene texto específico
- `getLastAssistantMessage()` - Obtiene el último mensaje del asistente
- `getUserMessages()` - Obtiene todos los mensajes del usuario
- `getAssistantMessages()` - Obtiene todos los mensajes del asistente
- `isChatInputEnabled()` - Verifica si el input está habilitado

## Escribir Nuevos Tests

```typescript
import { test, expect } from "./fixtures";
import { ChatPage } from "./chat-page";

test.describe("Mi funcionalidad", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, mockProviders, testDb }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    
    // Los fixtures están disponibles para verificación
    expect(mockProviders).toBeDefined();
    expect(testDb).toBeDefined();
  });

  test("mi test", async () => {
    await chatPage.sendMessage("Hello");
    await chatPage.waitForAssistantResponse();
    
    await chatPage.verifyAssistantResponded();
  });
});
```

## Configuración

La configuración de Playwright se encuentra en `playwright.config.ts`:
- **Base URL**: `http://localhost:3000`
- **Web Server**: Inicia automáticamente `pnpm dev` antes de los tests
- **Timeout**: 120 segundos para que el servidor esté listo
- **Browsers**: Chromium, Firefox, WebKit
- **Retry**: 2 reintentos en CI, 0 en local

## Test Actual: Chat

El primer test (`chat.spec.ts`) verifica:
1. El usuario puede enviar una consulta al chat
2. El asistente responde correctamente
3. La respuesta contiene el texto esperado del mock
4. Los mensajes se muestran en la interfaz

## Notas

- Los tests requieren que el servidor de desarrollo esté corriendo o se iniciará automáticamente
- Los mocks reemplazan los proveedores de AI y la base de datos para pruebas aisladas y predecibles
- Se recomienda usar Page Objects para mantener los tests mantenibles y reducir duplicación
- Los selectores en ChatPage pueden necesitar ajustes según los atributos data-* actuales del HTML

