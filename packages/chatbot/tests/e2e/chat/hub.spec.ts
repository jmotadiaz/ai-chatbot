import { test, expect } from "../fixtures";
import { ChatHubPage } from "./pages/hub";
import { CAPABILITY_ALIASES } from "@/tests/mocks/ai/capabilities";

const TOOLS_MODEL = CAPABILITY_ALIASES.canExecuteTools;
const FAILING_MODEL = CAPABILITY_ALIASES.failsMidStream;
const VISION_MODEL = CAPABILITY_ALIASES.canSeeImages;
const BASIC_MODEL = CAPABILITY_ALIASES.basicChat;
const BASIC_ALT_MODEL = CAPABILITY_ALIASES.basicChatAlt;

test.describe("Chat Hub", () => {
  let hubPage: ChatHubPage;

  test.beforeEach(async ({ page }) => {
    hubPage = new ChatHubPage(page);
    // Force a large viewport to ensure we are in Grid mode for desktop tests
    await page.setViewportSize({ width: 1600, height: 1200 });
    await hubPage.goto();
    // Ensure the user is authenticated (handled by fixture)
    await expect(page).toHaveURL(/\/chat\/hub/);
  });

  test("Model Management - 3 models limit", async ({ page }) => {
    // 1.1 Añadir hasta 3 modelos. Verificar que al llegar a 3, el botón de añadir desaparece.

    // Add first model
    await hubPage.header.addModel("canExecuteTools");
    await expect(page.getByText(TOOLS_MODEL).first()).toBeVisible();

    // Add second model
    await hubPage.header.addModel("failsMidStream");
    await expect(page.getByText(FAILING_MODEL).first()).toBeVisible();

    // Add third model
    await hubPage.header.addModel("canSeeImages");
    await expect(page.getByText(VISION_MODEL).first()).toBeVisible();

    // Verify add-model UI is gone after 3 models.
    // Depending on the variant, this can be a "New Model" button (tabs) or the add-model combobox (grid).
    await expect(page.getByRole("button", { name: "New Model" })).toBeHidden();
    await expect(hubPage.header.modelPicker).toBeHidden();

    // 1.2 Eliminar un modelo y verificar que el botón de añadir reaparece.
    const visionPanel = hubPage.getPanel(VISION_MODEL);
    // Ensure the model is selected if we are in mobile/tab view
    await hubPage.header.selectTab(VISION_MODEL);
    await visionPanel.removeButton.click();

    // Verify add-model UI reappears
    const newModelButton = page.getByRole("button", { name: "New Model" });
    if (await newModelButton.isVisible()) {
      await expect(newModelButton).toBeVisible();
    } else {
      await expect(hubPage.header.modelPicker).toBeVisible();
    }
  });

  test("Messaging Multi-Modelo and Locking", async ({ page }) => {
    // 2.1 Enviar un mensaje y verificar el streaming simultáneo en los paneles activos.
    // The hub runs without tools, so both models must be ones that answer with
    // plain text — no tool calls and no mid-stream failure.
    await hubPage.header.addModel("basicChat");
    await hubPage.header.addModel("basicChatAlt");

    const message = "Hello models, give me a short response.";
    await hubPage.hubContent.sendMessage(message);

    // 2.2 Verificar que el botón de enviar se bloquea durante la generación
    await expect
      .soft(page.getByRole("button", { name: "Send message" }))
      .toBeDisabled();

    // Verify both models respond
    const basicPanel = hubPage.getPanel(BASIC_MODEL);
    const basicAltPanel = hubPage.getPanel(BASIC_ALT_MODEL);

    // In desktop view both should be visible.
    // If they are not (e.g. small screen), we might need to select tabs.
    // Let's assume desktop for now and if it fails we check the snapshot.

    // Wait for assistant messages using Page Object methods
    await expect
      .soft(async () => {
        // We select the tab to ensure it's in the DOM/visible if needed
        await hubPage.header.selectTab(BASIC_MODEL);
        const basicMsg = await basicPanel.getLastAssistantMessage();
        expect(basicMsg).not.toBeNull();
        expect(basicMsg?.length).toBeGreaterThan(0);

        await hubPage.header.selectTab(BASIC_ALT_MODEL);
        const basicAltMsg = await basicAltPanel.getLastAssistantMessage();
        expect(basicAltMsg).not.toBeNull();
        expect(basicAltMsg?.length).toBeGreaterThan(0);
      })
      .toPass({ timeout: 20000 });

    // Verify input unlocks.
    // The "Send message" button is disabled when the input is empty, so we validate unlock by
    // typing again and expecting the send button to become enabled.
    await hubPage.hubContent.chatInput.fill("ping");
    await expect
      .soft(page.getByRole("button", { name: "Send message" }))
      .toBeEnabled({ timeout: 15000 });
  });

  test("Persistence - Select this chat", async ({ page }) => {
    // 3.1 Pulsar "Select this chat" en uno de los paneles.
    await hubPage.header.addModel("canExecuteTools");
    await hubPage.hubContent.sendMessage("Hello there");

    const toolsPanel = hubPage.getPanel(TOOLS_MODEL);
    // Ensure we are on the right tab to see the button
    await hubPage.header.selectTab(TOOLS_MODEL);

    await expect(toolsPanel.selectButton).toBeVisible();
    await toolsPanel.selectButton.click();

    // 3.2 Verificar que permanece en el Hub y el botón cambia a Delete
    await expect(page).toHaveURL(/\/chat\/hub/);
    await expect(toolsPanel.selectButton).toBeHidden();
    await expect(toolsPanel.deleteButton).toBeVisible();

    // 3.3 Verificar que Delete elimina la instancia (limpia)
    await toolsPanel.deleteButton.click();
    await expect(toolsPanel.container).toBeHidden();
  });

  test("UI & Responsive Grid", async ({ page }) => {
    // 5.1 Cambiar entre vista grid (desktop) y vista tabs (mobile).
    await hubPage.header.addModel("canExecuteTools");
    await hubPage.header.addModel("failsMidStream");

    // Default desktop grid view - both panels should be visible
    const toolsPanel = hubPage.getPanel(TOOLS_MODEL);
    const failingPanel = hubPage.getPanel(FAILING_MODEL);

    // Desktop can render as grid (multiple panels visible) or as tabs (single panel visible).
    const toolsTab = page.getByRole("button", {
      name: TOOLS_MODEL,
      exact: true,
    });
    const failingTab = page.getByRole("button", { name: FAILING_MODEL, exact: true });

    if ((await toolsTab.isVisible()) && (await failingTab.isVisible())) {
      await hubPage.header.selectTab(TOOLS_MODEL);
      await expect.soft(toolsPanel.container).toBeVisible();
      await hubPage.header.selectTab(FAILING_MODEL);
      await expect.soft(failingPanel.container).toBeVisible();
    } else {
      await expect.soft(toolsPanel.container).toBeVisible();
      await expect.soft(failingPanel.container).toBeVisible();
    }

    // Mobile view - only the active tab panel should be visible
    await page.setViewportSize({ width: 375, height: 667 });

    // Select Claude tab
    await hubPage.header.selectTab(TOOLS_MODEL);
    await expect.soft(toolsPanel.container).toBeVisible();
    // In mobile, non-active panel might be hidden or detached
    await expect.soft(failingPanel.container).toBeHidden();

    await hubPage.header.selectTab(FAILING_MODEL);
    await expect.soft(failingPanel.container).toBeVisible();
    await expect.soft(toolsPanel.container).toBeHidden();
  });

  test("Error States - Offline simulation", async ({ page }) => {
    await hubPage.header.addModel("failsMidStream");
    await page.context().setOffline(true);
    await hubPage.hubContent.sendMessage("Should fail");
    // Wait for any error message to appear
    await expect(page.getByText(/error|failed|offline/i).first()).toBeVisible();
    await page.context().setOffline(false);
  });
});
