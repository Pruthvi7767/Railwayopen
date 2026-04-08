import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { url } = req.body;

  try {
    const browser = await chromium.launch({
      headless: false
    });

    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Example: get all visible text
    const content = await page.evaluate(() => document.body.innerText);

    await browser.close();

    res.json({
      success: true,
      data: content.slice(0, 2000) // limit
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3000, () => {
  console.log("Scraper running on port 3000");
});