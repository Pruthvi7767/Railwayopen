import express from "express";
import { chromium } from "playwright";

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
  } catch (err) {
    console.log("AI Error:", err.message);
    return "";
  }
}

// ===== INTENT DETECTION =====
async function detectIntent(query) {
  const q = query.toLowerCase();

  if (q.includes("flat") || q.includes("rent") || q.includes("2bhk")) return "real_estate";
  if (q.includes("price") || q.includes("buy") || q.includes("iphone")) return "product";
  if (q.includes("who") || q.includes("what") || q.includes("meaning")) return "knowledge";

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const ai = await callAI(`
Classify this query into one:
knowledge / real_estate / product / general

Query: ${query}
Answer only one word.
      `);

      return ai.trim().toLowerCase();
    } catch {
      return "general";
    }
  }

  return "general";
}

// ===== BROWSER =====
async function getBrowser() {
  return await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}

// ===== SAFE PAGE NAVIGATION =====
async function safeGoto(page, url) {
  try {
    await page.goto(url, { timeout: 20000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    return true;
  } catch {
    return false;
  }
}

// ===== KNOWLEDGE SEARCH =====
async function quickAnswer(page, query) {
  const ok = await safeGoto(page, `https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
  if (!ok) return null;

  return await page.evaluate(() => {
    const el = document.querySelector("a[data-testid='result-title-a']");
    return {
      title: el?.innerText || "",
      link: el?.href || ""
    };
  });
}

// ===== GENERAL SEARCH =====
async function multiSearch(page, query) {
  const urls = [
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  ];

  let results = [];

  for (const url of urls) {
    const ok = await safeGoto(page, url);
    if (!ok) continue;

    const data = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map(a => ({
          title: a.innerText,
          link: a.href
        }))
        .filter(r =>
          r.link &&
          r.link.startsWith("http") &&
          !r.link.includes("login") &&
          !r.link.includes("settings")
        )
        .slice(0, 5);
    });

    results.push(...data);
  }

  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  }).slice(0, 5);
}

// ===== REAL ESTATE =====
async function scrapeHousing(page) {
  const ok = await safeGoto(page, "https://housing.com/in/buy/searches/Pune");
  if (!ok) return [];

  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("article"))
      .map(el => ({
        title: el.innerText.slice(0, 100)
      }))
      .slice(0, 5);
  });
}

// ===== PRODUCTS =====
async function scrapeProducts(page, query) {
  const ok = await safeGoto(page, `https://www.amazon.in/s?k=${encodeURIComponent(query)}`);
  if (!ok) return [];

  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("h2"))
      .map(el => ({
        title: el.innerText
      }))
      .slice(0, 5);
  });
}

// ===== MAIN =====
app.post("/search", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.json({ success: false, error: "Query required" });
  }

  let browser;

  try {
    const intent = await detectIntent(query);

    browser = await getBrowser();
    const page = await browser.newPage();

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
  res.send("Strong System Running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});