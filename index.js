import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({ status: "OpenClaw running" });
});

app.get("/search", async (req, res) => {
  const query = req.query.q;
  
  // TODO: plug your scraper logic here
  res.json({
    query,
    results: ["sample result"]
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});