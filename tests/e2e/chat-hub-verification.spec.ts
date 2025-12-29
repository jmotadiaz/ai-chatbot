
import { test, expect } from '@playwright/test';

test('Chat Hub UI renders correctly', async ({ page }) => {
  // Mock login and visit the page
  await page.goto('/chat/hub');

  // Check if Textarea is present
  const textarea = page.getByRole('textbox', { name: 'Say something...' });
  await expect(textarea).toBeVisible();

  // Check if ToolsControl is present (Settings icon for mobile or buttons for desktop)
  // Assuming desktop for now based on most tests, but checking for visibility of RAG/Web toggle
  const ragToggle = page.getByRole('button', { name: 'Toggle RAG' });
  const webToggle = page.getByRole('button', { name: 'Toggle Web Search' });

  // Wait for a bit for hydration
  await page.waitForTimeout(1000);

  if (await ragToggle.isVisible()) {
      await expect(ragToggle).toBeVisible();
      await expect(webToggle).toBeVisible();
  } else {
      // Mobile view check
       const settingsIcon = page.locator('svg.lucide-settings-2');
       await expect(settingsIcon).toBeVisible();
  }

  // Check if AttachmentsControl is present (Paperclip)
  const attachmentButton = page.getByRole('button', { name: 'Add attachment' });
  await expect(attachmentButton).toBeVisible();

  // Take a screenshot
  await page.screenshot({ path: 'frontend_verification.png' });
});
