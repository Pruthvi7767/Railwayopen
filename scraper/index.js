import express from "express";
import { chromium } from "playwright";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== AI (OPTIONAL) =====
async function callAI(prompt) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

// ===== INTENT DETECTION =====
async function detectIntent(query) {
  // fallback logic first (fast)
  const q = query.toLowerCase();

  if (q.includes("flat") || q.includes("rent") || q.includes("2bhk")) return "real_estate";
  if (q.includes("price") || q.includes("buy") || q.includes("iphone")) return "product";
  if (q.includes("who") || q.includes("what") || q.includes("meaning")) return "knowledge";

  // optional AI (smarter)
  if (process.env.OPENROUTER_API_KEY) {
    const ai = await callAI(`
Classify this query into one:
knowledge / real_estate / product / general

Query: ${query}
Answer only one word.
    `);

    return ai.trim().toLowerCase();
  }

  return "general";
}

// ===== BROWSER =====
async function getPage() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();
  return { browser, page };
}

// ===== KNOWLEDGE SEARCH =====
async function quickAnswer(page, query) {
  await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
  await page.waitForTimeout(3000);

  return await page.evaluate(() => {
    const el = document.querySelector("a[data-testid='result-title-a']");
    return {
      title: el?.innerText,
      link: el?.href
    };
  });
}

// ===== GENERAL SEARCH (MULTI ENGINE) =====
async function multiSearch(page, query) {
  const urls = [
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  ];

  let results = [];

  for (const url of urls) {
    try {
      await page.goto(url);
      await page.waitForTimeout(3000);

      const data = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a"))
          .map(a => ({
            title: a.innerText,
            link: a.href
          }))
          .filter(r => r.link && r.link.startsWith("http"))
          .slice(0, 5);
      });

      results.push(...data);

    } catch {
      continue;
    }
  }

  // dedupe
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  }).slice(0, 5);
}

// ===== REAL ESTATE SCRAPER =====
async function scrapeHousing(page) {
  await page.goto("https://housing.com/in/buy/searches/Pune");
  await page.waitForTimeout(6000);

  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("article"))
      .map(el => ({
        title: el.innerText.slice(0, 100)
      }))
      .slice(0, 5);
  });
}

// ===== PRODUCT SCRAPER =====
async function scrapeProducts(page, query) {
  await page.goto(`https://www.amazon.in/s?k=${encodeURIComponent(query)}`);
  await page.waitForTimeout(6000);

  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("h2"))
      .map(el => ({
        title: el.innerText
      }))
      .slice(0, 5);
  });
}

// ===== MAIN ROUTE =====
app.post("/search", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.json({ success: false, error: "Query required" });
  }

  let browser, page;

  try {
    const intent = await detectIntent(query);

    ({ browser, page } = await getPage());

    let result;

    if (intent === "knowledge") {
      result = await quickAnswer(page, query);
    }
    else if (intent === "real_estate") {
      result = await scrapeHousing(page);
    }
    else if (intent === "product") {
      result = await scrapeProducts(page, query);
    }
    else {
      result = await multiSearch(page, query);
    }

    await browser.close();

    // optional AI formatting
    let finalResult = result;

    if (process.env.OPENROUTER_API_KEY) {
      const cleaned = await callAI(`
Convert this into clean JSON:
${JSON.stringify(result)}
      `);

      try {
        finalResult = JSON.parse(cleaned);
      } catch {}
    }

    res.json({
      success: true,
      intent,
      query,
      result: finalResult
    });

  } catch (err) {
    if (browser) await browser.close();

    res.json({
      success: false,
      error: err.message
    });
  }
});

// ===== HEALTH =====
app.get("/", (req, res) => {
  res.send("Strong AI Search + Scraper Running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});