import { test, expect } from "../fixtures";
import { HistoryPage } from "./pages/history";

test.describe("Chat History Actions", () => {
  test("should show confirmation modal when deleting a chat", async ({
    page,
    db,
    authenticatedUser,
  }) => {
    expect(authenticatedUser).toBeDefined();

    // Create a chat to delete
    const chatTitle = "Chat To Delete";
    const chats = [
      {
        title: chatTitle,
        messages: [{ role: "user" as const, content: "Hello" }],
      },
    ];
    await db.addChats(chats);

    // Go to history page
    const historyPage = new HistoryPage(page);
    await historyPage.goto();

    // Ensure chat is visible
    await historyPage.assertChatVisible(chatTitle);

    // Click Delete button
    await historyPage.deleteChat(chatTitle);

    // Verify Modal Appears
    await historyPage.confirmModal.isVisible();
    await historyPage.confirmModal.hasMessage(
      `Are you sure you want to delete the chat "${chatTitle}"?`
    );

    // Click Cancel
    await historyPage.confirmModal.cancel();

    // Verify Modal Disappears
    await historyPage.confirmModal.isHidden();

    // Verify Chat is still there
    await historyPage.assertChatVisible(chatTitle);

    // Click Delete again
    await historyPage.deleteChat(chatTitle);
    await historyPage.confirmModal.isVisible();

    // Click Delete in Modal
    await historyPage.confirmModal.confirm();

    // Verify Modal Disappears and Chat is deleted
    await historyPage.confirmModal.isHidden();
    await historyPage.assertChatHidden(chatTitle);
  });

  test("should NOT disable trash button when pinning a chat", async ({
    page,
    db,
    authenticatedUser,
  }) => {
    expect(authenticatedUser).toBeDefined();
    // This test verifies the fix for the animation/state coupling
    const chatTitle = "Chat For Pinning";
    const chats = [
      {
        title: chatTitle,
        messages: [{ role: "user" as const, content: "Hello" }],
        pinned: false,
      },
    ];
    await db.addChats(chats);

    const historyPage = new HistoryPage(page);
    await historyPage.goto();
    await historyPage.assertChatVisible(chatTitle);

    const pinButton = historyPage.getPinButton(chatTitle);
    const deleteButton = historyPage.getDeleteButton(chatTitle);

    // Trigger pin
    await pinButton.click();

    // Check if delete button is disabled
    const isDeleteDisabled = await deleteButton.isDisabled();
    // We expect it to be FALSE.
    expect(isDeleteDisabled).toBe(false);

    // Wait for pin to finish (button becomes enabled or changes state to "Unpin")
    // If it becomes "Unpin", the aria label changes.
    await expect(
      page.getByRole("button", { name: "Unpin chat" })
    ).toBeVisible();
  });
});
