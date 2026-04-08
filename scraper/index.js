import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { url } = req.body;

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // wait a bit (important for dynamic sites)
    await page.waitForTimeout(3000);

    // scroll once (basic)
    await page.evaluate(() => {
      window.scrollBy(0, 1000);
    });

    await page.waitForTimeout(2000);

    // extract text
    const content = await page.evaluate(() => {
      return document.body.innerText;
    });

    await browser.close();

    res.json({
      success: true,
      data: content.slice(0, 2000) // limit size
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// IMPORTANT: use Railway port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Scraper running on port ${PORT}`);
});