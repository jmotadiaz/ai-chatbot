import { test, expect } from "../fixtures";

test.describe.skip("Chat History", () => {
  // Use authenticatedUser fixture to auto-login
  test.use({ storageState: { cookies: [], origins: [] } }); // Reset state if needed, but fixtures handle it

  test("should navigate to history page from sidebar", async ({ page, db }) => {
    // Navigate to home after login (handled by fixture, but we might need to go to / explicitly)
    await page.goto("/");

    // Create some chats to ensure list is visible
    // db.addChats expects title and messages array
    const chats = Array.from({ length: 5 }).map((_, i) => ({
      title: `Chat Title ${i}`,
      messages: [{ role: "user" as const, content: "Hello" }],
    }));
    await db.addChats(chats);
    await page.reload();

    await expect(page.getByText("Chats")).toBeVisible();
    await page.getByText("See all").click();
    await page.waitForURL("/chat/history");
    await expect(page.getByText("Chat History")).toBeVisible();
  });

  test("should list chats, filter and delete", async ({ page, db }) => {
    const targetTitle = "Special Unique Chat Title";
    const otherTitle = "Another Chat Title";
    const chats = [
      {
        title: targetTitle,
        messages: [{ role: "user" as const, content: "Hello" }],
      },
      {
        title: otherTitle,
        messages: [{ role: "user" as const, content: "Hello" }],
      },
    ];
    await db.addChats(chats);

    await page.goto("/chat/history");

    await expect(page.getByText(targetTitle)).toBeVisible();
    await expect(page.getByText(otherTitle)).toBeVisible();

    // Filter
    await page.getByPlaceholder("Filter chats...").fill("Special Unique");

    // Wait for debounce and refresh
    await expect(page.getByText(targetTitle)).toBeVisible();
    await expect(page.getByText(otherTitle)).not.toBeVisible();

    // Clear filter
    await page.getByPlaceholder("Filter chats...").fill("");
    await expect(page.getByText(otherTitle)).toBeVisible();

    // Delete
    const row = page.locator("li").filter({ hasText: targetTitle });
    await row.getByRole("button", { name: `Delete chat ${targetTitle}` }).click();

    await expect(page.getByText(targetTitle)).not.toBeVisible();
    await expect(page.getByText(otherTitle)).toBeVisible();
  });

  test("should support infinite scroll", async ({ page, db }) => {
    // create 25 chats
    // Note: addChats transaction might be fast, timestamps might be close.
    // The sorting is by updatedAt.
    // We should ensure enough variation or just trust implicit order of insertion/update?
    // addChats inserts sequentially in transaction.

    const chats = Array.from({ length: 25 }).map((_, i) => ({
      title: `History Chat ${i}`,
      messages: [{ role: "user" as const, content: "Hello" }],
    }));

    // Insert them in reverse order or ensure timestamps?
    // The db fixture doesn't let us set createdAt easily.
    // But latest inserted will likely be last updated.
    // If we want "History Chat 0" to be newest, we should insert it last.
    // Or we just check that we can find them all.

    // Let's insert them one by one to ensure timestamp diffs if needed?
    // Actually addChats does a loop in transaction. Postgres commit time might be same?
    // But `returning()` and then next insert...
    // Let's just assume standard sort.

    await db.addChats(chats);

    await page.goto("/chat/history");

    // We expect some to be visible.
    // Scroll to bottom
    const list = page.locator('ul[aria-label="Chat history list"]');
    await expect(list).toBeVisible();

    // Scroll
    await list.evaluate((el) => el.scrollTop = el.scrollHeight);

    // Wait for more to load.
    // Since we don't control exact sort easily without mocking db time,
    // just verifying that we can scroll and see more items or specific count logic.

    // We can check that the list has grown.
    // Initial count should be 20.
    // After scroll, should be 25.

    await expect(async () => {
        const count = await list.locator("li").count();
        expect(count).toBeGreaterThan(20);
    }).toPass();
  });
});
