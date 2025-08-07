import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            # Navigate to the app
            await page.goto("http://localhost:8000/index.html")

            # Create a new project
            await page.fill("#newProjectName", "test-project")
            await page.click("#createProjectBtn")

            # Go to the editor page
            await page.click('text="test-project"')

            # Wait for the editor to load
            await page.wait_for_selector("#fileExplorer")

            # Create file.txt in the root
            async with page.expect_event("dialog") as dialog_info:
                await page.click("#newFileBtn")
            dialog = await dialog_info.value
            await dialog.accept("file.txt")
            await page.wait_for_selector('text="file.txt"')

            # Create dir1
            async with page.expect_event("dialog") as dialog_info:
                await page.click("#newDirectoryBtn")
            dialog = await dialog_info.value
            await dialog.accept("dir1")
            await page.wait_for_selector('text="dir1"')

            # Go into dir1 and create another file.txt
            await page.click('text="dir1"')
            await page.wait_for_selector('text=".. (Up)"')
            async with page.expect_event("dialog") as dialog_info:
                await page.click("#newFileBtn")
            dialog = await dialog_info.value
            await dialog.accept("file.txt")
            await page.wait_for_selector('text="file.txt"')

            # Go back to the root
            await page.click('text=".. (Up)"')
            await page.wait_for_selector('text="dir1"')

            # Find the file.txt in the root and click its move button
            root_file_li = page.locator('li.type-file', has_text='file.txt').first
            await root_file_li.locator('.move-btn').click()

            # In the move modal, click on dir1 to navigate into it
            await page.wait_for_selector('#moveItemModal', state='visible')
            await page.locator('#moveModalDirectoryList li', has_text='dir1').click()

            # Wait for the directory to load
            await expect(page.locator('#moveModalCurrentPath')).to_have_text('/dir1')

            # Click the "Move Here" button
            async with page.expect_event("dialog") as dialog_info:
                await page.click("#moveModalMoveHereBtn")
            dialog = await dialog_info.value
            await dialog.accept()

            # Wait for the modal to disappear
            await page.wait_for_selector('#moveItemModal', state='hidden')

            # Verify that file.txt is gone from the root
            await expect(page.locator('li.type-file', has_text='file.txt')).to_have_count(0)

            # Verify that dir1 still exists
            await expect(page.locator('li.type-directory', has_text='dir1')).to_have_count(1)

            # Go into dir1 and verify that file.txt is there
            await page.click('text="dir1"')
            await page.wait_for_selector('text=".. (Up)"')
            await expect(page.locator('li.type-file', has_text='file.txt')).to_have_count(1)

            print("Test passed!")

        except Exception as e:
            print(f"Test failed: {e}")
            await page.screenshot(path="test-failure.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
