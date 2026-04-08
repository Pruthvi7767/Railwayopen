import axios from "axios";
import cron from "node-cron";

// change this to your scraper service URL (Railway gives it)
const SCRAPER_URL = process.env.SCRAPER_URL;

// Example task: scrape buyers
async function scrapeBuyers() {
  try {
    console.log("Starting scraping job...");

    const response = await axios.post(`${SCRAPER_URL}/scrape`, {
      url: "https://example.com"
    });

    const data = response.data;

    console.log("Scraped data length:", data.data.length);

    // send to OpenClaw later here
    // await axios.post("OPENCLAW_URL", data)

  } catch (error) {
    console.error("Scraping failed:", error.message);
  }
}

// Run every day at 2 AM
cron.schedule("0 2 * * *", () => {
  scrapeBuyers();
});

// also run once on start (for testing)
scrapeBuyers();