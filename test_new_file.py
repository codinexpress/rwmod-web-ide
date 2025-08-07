import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
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

            print("Test passed!")

        except Exception as e:
            print(f"Test failed: {e}")
            await page.screenshot(path="test-failure.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
