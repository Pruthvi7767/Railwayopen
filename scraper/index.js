import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

app.post("/search", async (req, res) => {
  const { query } = req.body;

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const context = await browser.newContext({
      storageState: "auth.json"
    });

    const page = await context.newPage();

    // BLOCK ALL WRITE ACTIONS
    await page.route("**/*", (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        return route.abort();
      }
      route.continue();
    });

    console.log("Searching Google...");

    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );

    await page.waitForTimeout(3000);

    // GET SEARCH LINKS
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map((a) => a.href)
        .filter((href) => href.startsWith("http"))
        .slice(0, 5);
    });

    let results = [];

    for (const link of links) {
      try {
        console.log("Opening:", link);

        await page.goto(link, { timeout: 20000 });
        await page.waitForTimeout(3000);

        // scroll
        for (let i = 0; i < 3; i++) {
          await page.mouse.wheel(0, 1000);
          await page.waitForTimeout(1500);
        }

        const data = await page.evaluate(() => {
          const texts = Array.from(document.querySelectorAll("p, span"))
            .map((el) => el.innerText)
            .filter((t) => t.length > 30)
            .slice(0, 10);

          const images = Array.from(document.querySelectorAll("img"))
            .map((img) => img.src)
            .filter((src) => src.startsWith("http"))
            .slice(0, 5);

          return { texts, images };
        });

        results.push({
          source: link,
          ...data
        });

      } catch (err) {
        console.log("Skipped:", link);
        continue;
      }
    }

    await browser.close();

    res.json({
      success: true,
      query,
      results
    });

  } catch (err) {
    console.error("SCRAPER ERROR:", err);

    if (browser) await browser.close();

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Scraper running on port ${PORT}`);
});