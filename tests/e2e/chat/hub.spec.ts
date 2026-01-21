import { test, expect } from "../fixtures";
import { ChatHubPage } from "./pages/hub";

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
    await hubPage.header.addModel("Claude Sonnet 4.5");
    await expect(page.getByText("Claude Sonnet 4.5").first()).toBeVisible();

    // Add second model
    await hubPage.header.addModel("GPT OSS");
    await expect(page.getByText("GPT OSS").first()).toBeVisible();

    // Add third model
    await hubPage.header.addModel("Gemini 3 Flash");
    await expect(page.getByText("Gemini 3 Flash").first()).toBeVisible();

    // Verify add-model UI is gone after 3 models.
    // Depending on the variant, this can be a "New Model" button (tabs) or the add-model combobox (grid).
    await expect(page.getByRole("button", { name: "New Model" })).toBeHidden();
    await expect(hubPage.header.modelPicker).toBeHidden();

    // 1.2 Eliminar un modelo y verificar que el botón de añadir reaparece.
    const geminiPanel = hubPage.getPanel("Gemini 3 Flash");
    // Ensure the model is selected if we are in mobile/tab view
    await hubPage.header.selectTab("Gemini 3 Flash");
    await geminiPanel.removeButton.click();

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
    await hubPage.header.addModel("Claude Sonnet 4.5");
    await hubPage.header.addModel("GPT OSS");

    const message = "Hello models, give me a short response.";
    await hubPage.hubContent.sendMessage(message);

    // 2.2 Verificar que el botón de enviar se bloquea durante la generación
    await expect
      .soft(page.getByRole("button", { name: "Send message" }))
      .toBeDisabled();

    // Verify both models respond
    const claudePanel = hubPage.getPanel("Claude Sonnet 4.5");
    const gptPanel = hubPage.getPanel("GPT OSS");

    // In desktop view both should be visible.
    // If they are not (e.g. small screen), we might need to select tabs.
    // Let's assume desktop for now and if it fails we check the snapshot.

    // Wait for assistant messages using Page Object methods
    await expect
      .soft(async () => {
        // We select the tab to ensure it's in the DOM/visible if needed
        await hubPage.header.selectTab("Claude Sonnet 4.5");
        const claudeMsg = await claudePanel.getLastAssistantMessage();
        expect(claudeMsg).not.toBeNull();
        expect(claudeMsg?.length).toBeGreaterThan(0);

        await hubPage.header.selectTab("GPT OSS");
        const gptMsg = await gptPanel.getLastAssistantMessage();
        expect(gptMsg).not.toBeNull();
        expect(gptMsg?.length).toBeGreaterThan(0);
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
    await hubPage.header.addModel("Claude Sonnet 4.5");
    await hubPage.hubContent.sendMessage("Hello there");

    const claudePanel = hubPage.getPanel("Claude Sonnet 4.5");
    // Ensure we are on the right tab to see the button
    await hubPage.header.selectTab("Claude Sonnet 4.5");

    await expect(claudePanel.selectButton).toBeVisible();
    await claudePanel.selectButton.click();

    // 3.2 Verificar que permanece en el Hub y el botón cambia a Delete
    await expect(page).toHaveURL(/\/chat\/hub/);
    await expect(claudePanel.selectButton).toBeHidden();
    await expect(claudePanel.deleteButton).toBeVisible();

    // 3.3 Verificar que Delete elimina la instancia (limpia)
    await claudePanel.deleteButton.click();
    await expect(claudePanel.container).toBeHidden();
  });

  test("UI & Responsive Grid", async ({ page }) => {
    // 5.1 Cambiar entre vista grid (desktop) y vista tabs (mobile).
    await hubPage.header.addModel("Claude Sonnet 4.5");
    await hubPage.header.addModel("GPT OSS");

    // Default desktop grid view - both panels should be visible
    const claudePanel = hubPage.getPanel("Claude Sonnet 4.5");
    const gptPanel = hubPage.getPanel("GPT OSS");

    // Desktop can render as grid (multiple panels visible) or as tabs (single panel visible).
    const claudeTab = page.getByRole("button", {
      name: "Claude Sonnet 4.5",
      exact: true,
    });
    const gptTab = page.getByRole("button", { name: "GPT OSS", exact: true });

    if ((await claudeTab.isVisible()) && (await gptTab.isVisible())) {
      await hubPage.header.selectTab("Claude Sonnet 4.5");
      await expect.soft(claudePanel.container).toBeVisible();
      await hubPage.header.selectTab("GPT OSS");
      await expect.soft(gptPanel.container).toBeVisible();
    } else {
      await expect.soft(claudePanel.container).toBeVisible();
      await expect.soft(gptPanel.container).toBeVisible();
    }

    // Mobile view - only the active tab panel should be visible
    await page.setViewportSize({ width: 375, height: 667 });

    // Select Claude tab
    await hubPage.header.selectTab("Claude Sonnet 4.5");
    await expect.soft(claudePanel.container).toBeVisible();
    // In mobile, non-active panel might be hidden or detached
    await expect.soft(gptPanel.container).toBeHidden();

    await hubPage.header.selectTab("GPT OSS");
    await expect.soft(gptPanel.container).toBeVisible();
    await expect.soft(claudePanel.container).toBeHidden();
  });

  test("Error States - Offline simulation", async ({ page }) => {
    await hubPage.header.addModel("GPT OSS");
    await page.context().setOffline(true);
    await hubPage.hubContent.sendMessage("Should fail");
    // Wait for any error message to appear
    await expect(page.getByText(/error|failed|offline/i).first()).toBeVisible();
    await page.context().setOffline(false);
  });
});
