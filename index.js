import express from "express";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";

const app = express();
const PORT = process.env.PORT || 3000;
const sql = neon(process.env.DATABASE_URL);

// ── Middleware ────────────────────────────────────────────────
// Raw body needed for Shopify HMAC verification
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// ── DB Setup ──────────────────────────────────────────────────
async function setupDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS print_jobs (
      id SERIAL PRIMARY KEY,
      order_number TEXT NOT NULL,
      order_date TEXT NOT NULL,
      items JSONB NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✅ DB ready");
}

// ── Allergen matrix (source of truth) ────────────────────────
const ALLERGEN_KEYS = ["celery","gluten","crustaceans","eggs","fish","lupin","milk","mustard","molluscs","sesame","soya","sulphites"];
const ALLERGEN_LABELS = {
  celery:"Celery", gluten:"Gluten", crustaceans:"Crustaceans", eggs:"Eggs",
  fish:"Fish", lupin:"Lupin", milk:"Milk", mustard:"Mustard",
  molluscs:"Molluscs", sesame:"Sesame", soya:"Soya", sulphites:"Sulphites"
};

const ALLERGEN_MATRIX = {
  "Avocado & Smoked Salmon Sourdough Toast Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:1,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Avocado Toast Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Baked Salmon & Seasonal Roast Veg Salad":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:1,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Beef Bagel Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Beetroot Brownies":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Beetroot Quinoa Tabbouleh":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Berry Quinoa Tabbouleh":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Blue Chia Pudding":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Brazilian Cajun Jackfruit Salpicão":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Brazilian Salpicao Chicken Platter":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Chicken & Sundried Tomato Quiche":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Chicken Bagel Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:1},
  "Chicken Supreme Roast Dinner":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Chocolate Chip Cookies Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Ciabatta Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Classic Caesar Salad":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:1,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Classic Greek Salad":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Coconut & Apple Granola Fruit Mix":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Coconut Brownie Energy Balls":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Cut Fruit Platter":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Deluxe Bagel Platter":{celery:1,gluten:1,crustaceans:0,eggs:1,fish:1,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Fish Sandwich Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:1,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Fusilli Verdi Pesto & Sundried Tomato Salad":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Gluten Free Avocado Toast Platter":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Gluten Free Bagel Platter (6)":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:1,molluscs:0,sesame:0,soya:1,sulphites:1},
  "Gluten Free Fish Sandwich Platter":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:1,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Gluten Free Lemon & Poppyseed Cupcakes":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Gluten Free Matcha & Raspberry Cookies":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Gluten Free Meat Sandwich Platter":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:1,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Gluten Free Muffins":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Gluten Free Pastry Platter":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Gluten Free Poultry Sandwich Platter":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Gluten Free Sweet Potato Brownie Bites":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Gluten Free Vegan Sandwich Platter":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Gluten Free Vegetarian Sandwich Platter":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Goats Cheese with Watercress Quiche":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Leek & Mushroom Quiche":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Levantine Hummus & Falafel Salad":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:1,soya:0,sulphites:0},
  "Meat Sandwich Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:1,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Mini Viennese Pastries Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Organic Whole Earth Platters":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Overnight Oats & Fruit":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Parmesan Chicken Garden Salad":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Poultry Sandwich Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Salmon & Red Confit Quiche":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:1,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Salmon Wellington":{celery:0,gluten:1,crustaceans:1,eggs:1,fish:1,lupin:0,milk:1,mustard:1,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Salted Caramel Brownies":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Slow-Braised Pulled Beef Roast":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Spinach & Asparagus Quiche":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Super Berry Granola Bowl":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Sweet Potato Brownies":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Vegan Avocado Croissant Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Vegan Bagel Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:1,soya:0,sulphites:1},
  "Vegan Chai Tea Cake Loaf Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Vegan Pastries Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Vegan Sandwich Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Vegan Wellington":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Vegetarian Sandwich Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Vegetarian Wellington":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:1,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
};

function getAllergens(productName) {
  // Exact match first
  if (ALLERGEN_MATRIX[productName]) return ALLERGEN_MATRIX[productName];
  // Fuzzy match — find closest product name
  const lower = productName.toLowerCase();
  const match = Object.keys(ALLERGEN_MATRIX).find(k => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()));
  return match ? ALLERGEN_MATRIX[match] : null;
}

function getAllergenText(productName) {
  const matrix = getAllergens(productName);
  if (!matrix) return "Allergen info unavailable — check matrix";
  const contains = ALLERGEN_KEYS.filter(k => matrix[k]).map(k => ALLERGEN_LABELS[k]);
  return contains.length > 0 ? `CONTAINS: ${contains.join(", ")}` : "No listed allergens";
}

// ── Shopify HMAC verification ─────────────────────────────────
function verifyShopify(req) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac || !process.env.SHOPIFY_WEBHOOK_SECRET) return true; // skip in dev
  const hash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.body)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

// ── Routes ────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => res.json({ status: "ok", service: "VK Label Server" }));

// Shopify webhook — orders/create
app.post("/webhook/orders", async (req, res) => {
  if (!verifyShopify(req)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    const order = JSON.parse(req.body);
    const orderNumber = order.name || `#${order.order_number}`;
    const orderDate = new Date(order.created_at).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric"
    });

    // Build items array — one entry per line item with qty
    const items = (order.line_items || []).map(item => ({
      name: item.name,
      quantity: item.quantity,
      allergenText: getAllergenText(item.name),
    }));

    if (items.length === 0) {
      return res.status(200).json({ message: "No line items, skipping" });
    }

    await sql`
      INSERT INTO print_jobs (order_number, order_date, items)
      VALUES (${orderNumber}, ${orderDate}, ${JSON.stringify(items)})
    `;

    console.log(`✅ Print job queued: ${orderNumber} — ${items.reduce((t,i) => t+i.quantity, 0)} labels`);
    res.status(200).json({ queued: true, order: orderNumber });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Phone agent polls this — returns oldest pending job and marks it claimed
app.get("/jobs/next", async (req, res) => {
  const secret = req.headers["x-agent-secret"];
  if (secret !== process.env.AGENT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const jobs = await sql`
      UPDATE print_jobs
      SET status = 'claimed'
      WHERE id = (
        SELECT id FROM print_jobs WHERE status = 'pending'
        ORDER BY created_at ASC LIMIT 1
      )
      RETURNING *
    `;

    if (jobs.length === 0) {
      return res.json({ job: null });
    }

    res.json({ job: jobs[0] });
  } catch (err) {
    console.error("Job fetch error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Phone agent marks job done
app.post("/jobs/:id/done", async (req, res) => {
  const secret = req.headers["x-agent-secret"];
  if (secret !== process.env.AGENT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  await sql`UPDATE print_jobs SET status = 'printed' WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// Admin — view recent jobs
app.get("/jobs", async (req, res) => {
  const secret = req.headers["x-agent-secret"];
  if (secret !== process.env.AGENT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const jobs = await sql`SELECT * FROM print_jobs ORDER BY created_at DESC LIMIT 50`;
  res.json(jobs);
});

// ── Start ─────────────────────────────────────────────────────
setupDb().then(() => {
  app.listen(PORT, () => console.log(`🚀 VK Label Server running on port ${PORT}`));
});
