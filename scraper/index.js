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
      storageState: "auth.json",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    });

    const page = await context.newPage();

    // block write actions
    await page.route("**/*", (route) => {
      if (route.request().method() === "POST") {
        return route.abort();
      }
      route.continue();
    });

    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9"
    });

    await page.waitForTimeout(2000);

    // ===== SEARCH ENGINE LOGIC =====
    let links = [];

    // TRY GOOGLE FIRST
    try {
      console.log("Trying Google...");
      await page.goto(
        `https://www.google.com/search?hl=en&q=${encodeURIComponent(query)}`,
        { timeout: 20000 }
      );

      await page.waitForTimeout(3000);

      links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a"))
          .map((a) => a.href)
          .filter((href) => href.startsWith("http"))
          .slice(0, 5);
      });

      // detect block
      if (links.some((l) => l.includes("sorry"))) {
        throw new Error("Google blocked");
      }

    } catch (err) {
      console.log("Google blocked → switching to DuckDuckGo");

      await page.goto(
        `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        { timeout: 20000 }
      );

      await page.waitForTimeout(3000);

      links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a"))
          .map((a) => a.href)
          .filter((href) => href.startsWith("http"))
          .slice(0, 5);
      });
    }

    let results = [];

    // ===== VISIT LINKS =====
    for (const link of links) {
      try {
        console.log("Opening:", link);

        await page.goto(link, { timeout: 20000 });
        await page.waitForTimeout(3000);

        // scroll like human
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
