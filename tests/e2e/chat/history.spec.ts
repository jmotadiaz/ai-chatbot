import { test, expect } from "@playwright/test";
import { addChats, testUser } from "../fixtures";
import { faker } from "@faker-js/faker";

test.describe("Chat History", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to history page
    // We need to login first
    await page.goto("/login");
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
  });

  test("should navigate to history page from sidebar", async ({ page }) => {
     // Create some chats to ensure list is visible
    const chats = Array.from({ length: 5 }).map(() => ({
        id: faker.string.uuid(),
        title: faker.lorem.sentence(),
        userId: testUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: null,
    }));
    await addChats(chats);
    await page.reload();

    // Open sidebar if closed (usually open on desktop)
    // Check if sidebar is visible. If not, toggle it.
    // However, sidebar is usually open.
    // The "See all" link should be visible if there are chats.
    // The logic in ChatList hides it if filteredChats length is 0.
    // "filteredChats" filters out current chat.
    // If we are at root /, chatId is undefined.

    await expect(page.getByText("Chats")).toBeVisible();
    await page.getByText("See all").click();
    await page.waitForURL("/chat/history");
    await expect(page.getByText("Chat History")).toBeVisible();
  });

  test("should list chats, filter and delete", async ({ page }) => {
    const targetTitle = "Special Unique Chat Title";
    const otherTitle = "Another Chat Title";
    const chats = [
        {
            id: faker.string.uuid(),
            title: targetTitle,
            userId: testUser.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            projectId: null,
        },
        {
            id: faker.string.uuid(),
            title: otherTitle,
            userId: testUser.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            projectId: null,
        }
    ];
    await addChats(chats);

    await page.goto("/chat/history");

    // Check both are present
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
    // Find the row with targetTitle
    const row = page.locator("li").filter({ hasText: targetTitle });
    await row.getByRole("button", { name: `Delete chat ${targetTitle}` }).click();

    // Should be gone
    await expect(page.getByText(targetTitle)).not.toBeVisible();

    // Verify toast or simple absence
    await expect(page.getByText(otherTitle)).toBeVisible();
  });

  test("should support infinite scroll", async ({ page }) => {
    // create 25 chats
    const chats = Array.from({ length: 25 }).map((_, i) => ({
        id: faker.string.uuid(),
        title: `History Chat ${i}`,
        userId: testUser.id,
        createdAt: new Date(Date.now() - i * 1000), // Ensure order
        updatedAt: new Date(Date.now() - i * 1000),
        projectId: null,
    }));
    await addChats(chats);

    await page.goto("/chat/history");

    // Default limit is 20.
    // The list is sorted by updatedAt desc.
    // Chat 0 is newest (highest timestamp). Chat 24 is oldest.
    // So we should see Chat 0 to Chat 19.

    await expect(page.getByText("History Chat 0")).toBeVisible();
    // Chat 24 should likely not be visible yet if it renders only 20.
    // We can check count of items.

    const listItems = page.locator('ul[aria-label="Chat history list"] > li:not(.text-muted-foreground)');
    // Excluding the loader "li" which has text-muted-foreground class usually.
    // Or just check for the specific item visibility.

    // Scroll to bottom
    // We can scroll the ul
    const list = page.locator('ul[aria-label="Chat history list"]');

    // Wait for list to load
    await expect(list).toBeVisible();

    // We expect "History Chat 24" to NOT be in the viewport initially?
    // It depends on the screen height.

    // Scroll list
    await list.evaluate((el) => el.scrollTop = el.scrollHeight);

    // Wait for more to load
    await expect(page.getByText("History Chat 24")).toBeVisible();
  });
});
