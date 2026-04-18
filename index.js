import express from "express";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";

const app = express();
const PORT = process.env.PORT || 3000;
const sql = neon(process.env.DATABASE_URL);

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

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
  console.log("DB ready");
}

const ALLERGEN_KEYS = ["celery","gluten","crustaceans","eggs","fish","lupin","milk","mustard","molluscs","sesame","soya","sulphites"];
const ALLERGEN_LABELS = {celery:"Celery",gluten:"Gluten",crustaceans:"Crustaceans",eggs:"Eggs",fish:"Fish",lupin:"Lupin",milk:"Milk",mustard:"Mustard",molluscs:"Molluscs",sesame:"Sesame",soya:"Soya",sulphites:"Sulphites"};

const ALLERGEN_MATRIX = {
  "Avocado & Smoked Salmon Sourdough Toast Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:1,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Avocado Toast Platter":{celery:0,gluten:1,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Baked Salmon & Seasonal Roast Veg Salad":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:1,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:1,sulphites:0},
  "Beef Bagel Platter":{celery:0,gluten:1,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Beetroot Brownies":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Beetroot Quinoa Tabbouleh":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Berry Quinoa Tabbouleh":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Blue Chia Pudding":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
  "Brazilian Cajun Jackfruit Salpicao":{celery:0,gluten:0,crustaceans:0,eggs:0,fish:0,lupin:0,milk:0,mustard:0,molluscs:0,sesame:0,soya:0,sulphites:0},
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
  "Gluten Free Bagel Platter":{celery:0,gluten:0,crustaceans:0,eggs:1,fish:0,lupin:0,milk:0,mustard:1,molluscs:0,sesame:0,soya:1,sulphites:1},
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
  if (ALLERGEN_MATRIX[productName]) return ALLERGEN_MATRIX[productName];
  const lower = productName.toLowerCase();
  const match = Object.keys(ALLERGEN_MATRIX).find(k => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()));
  return match ? ALLERGEN_MATRIX[match] : null;
}

function getAllergenText(productName) {
  const matrix = getAllergens(productName);
  if (!matrix) return "Allergen info unavailable";
  const contains = ALLERGEN_KEYS.filter(k => matrix[k]).map(k => ALLERGEN_LABELS[k]);
  return contains.length > 0 ? `CONTAINS: ${contains.join(", ")}` : "No listed allergens";
}

function verifyShopify(req) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac || !process.env.SHOPIFY_WEBHOOK_SECRET) return true;
  const hash = crypto.createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET).update(req.body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

app.get("/", (req, res) => res.json({ status: "ok", service: "VK Label Server" }));

app.post("/webhook/orders", async (req, res) => {
  if (!verifyShopify(req)) return res.status(401).json({ error: "Invalid signature" });
  try {
    const order = JSON.parse(req.body);
    const orderNumber = order.name || `#${order.order_number}`;
    const orderDate = new Date(order.created_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
    const items = (order.line_items || []).map(item => ({
      name: item.name,
      quantity: item.quantity,
      allergen_text: getAllergenText(item.name),
    }));
    if (items.length === 0) return res.status(200).json({ message: "No line items" });
    await sql`INSERT INTO print_jobs (order_number, order_date, items) VALUES (${orderNumber}, ${orderDate}, ${JSON.stringify(items)})`;
    res.status(200).json({ queued: true, order: orderNumber });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/jobs/next", async (req, res) => {
  if (req.headers["x-agent-secret"] !== process.env.AGENT_SECRET) return res.status(401).json({ error: "Unauthorized" });
  try {
    const jobs = await sql`
      UPDATE print_jobs SET status = 'claimed'
      WHERE id = (SELECT id FROM print_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1)
      RETURNING *
    `;
    res.json({ job: jobs.length ? jobs[0] : null });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/jobs/:id/done", async (req, res) => {
  if (req.headers["x-agent-secret"] !== process.env.AGENT_SECRET) return res.status(401).json({ error: "Unauthorized" });
  await sql`UPDATE print_jobs SET status = 'printed' WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.post("/jobs/:id/reset", async (req, res) => {
  if (req.headers["x-agent-secret"] !== process.env.AGENT_SECRET) return res.status(401).json({ error: "Unauthorized" });
  await sql`UPDATE print_jobs SET status = 'pending' WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

app.get("/jobs", async (req, res) => {
  if (req.headers["x-agent-secret"] !== process.env.AGENT_SECRET) return res.status(401).json({ error: "Unauthorized" });
  const jobs = await sql`SELECT * FROM print_jobs ORDER BY created_at DESC LIMIT 50`;
  res.json(jobs);
});

app.get("/test", async (req, res) => {
  const testItems = [
    { name: "Chicken Bagel Platter", quantity: 2, allergen_text: "CONTAINS: Gluten, Milk, Sulphites" },
    { name: "Beetroot Brownies", quantity: 1, allergen_text: "No listed allergens" },
  ];
  const orderNumber = `#TEST-${Date.now().toString().slice(-4)}`;
  const orderDate = new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  await sql`INSERT INTO print_jobs (order_number, order_date, items) VALUES (${orderNumber}, ${orderDate}, ${JSON.stringify(testItems)})`;
  res.json({ queued: true, order: orderNumber, labels: 3, message: "Test job created - watch the phone!" });
});

// Serves updated print agent to the phone
app.get("/agent", (req, res) => {
  const script = `import os, sys, subprocess, requests, socket, time
from datetime import datetime

# Install dependencies if needed
def install(pkg):
    subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Installing Pillow...")
    install("Pillow")
    from PIL import Image, ImageDraw, ImageFont

try:
    from brother_ql.conversion import convert
    from brother_ql.backends.helpers import send
    from brother_ql.raster import BrotherQLRaster
except ImportError:
    print("Installing brother_ql...")
    install("brother-ql")
    from brother_ql.conversion import convert
    from brother_ql.backends.helpers import send
    from brother_ql.raster import BrotherQLRaster

RAILWAY_URL = "https://shopify-printing-production.up.railway.app"
AGENT_SECRET = "vk-print-shopify-2013-secret"
PRINTER_IP = "192.168.68.55"
PRINTER_MODEL = "QL-820NWB"
LABEL_TYPE = "62"
POLL_SECONDS = 30
HEADERS = {"x-agent-secret": AGENT_SECRET}

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def fetch_next_job():
    try:
        r = requests.get(f"{RAILWAY_URL}/jobs/next", headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json().get("job")
    except Exception as e:
        log(f"Poll failed: {e}")
        return None

def mark_done(job_id):
    try: requests.post(f"{RAILWAY_URL}/jobs/{job_id}/done", headers=HEADERS, timeout=10)
    except: pass

def make_label_image(name, allergen, order_number, order_date, idx, total):
    W, H = 696, 270
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)
    try:
        font_big = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 28)
        font_med = ImageFont.truetype("/system/fonts/DroidSans.ttf", 22)
        font_sml = ImageFont.truetype("/system/fonts/DroidSans.ttf", 18)
    except:
        font_big = ImageFont.load_default()
        font_med = font_big
        font_sml = font_big

    draw.rectangle([0, 0, W, 40], fill="black")
    draw.text((10, 8), "VANDA'S KITCHEN  |  ST PAUL'S LONDON EC4", fill="white", font=font_med)
    draw.text((10, 50), name[:55], fill="black", font=font_big)
    if len(name) > 55:
        draw.text((10, 85), name[55:], fill="black", font=font_big)
    draw.text((10, 125), f"Order: {order_number}   Date: {order_date}   Label {idx}/{total}", fill="black", font=font_sml)
    draw.line([10, 150, W-10, 150], fill="black", width=1)
    allergen_color = (180, 0, 0) if "CONTAINS" in allergen else (0, 120, 0)
    draw.text((10, 158), allergen, fill=allergen_color, font=font_med)
    draw.line([10, 220, W-10, 220], fill="black", width=1)
    draw.text((10, 228), "100% NUT-FREE KITCHEN  *  HALAL CERTIFIED", fill="black", font=font_sml)
    return img

def print_label(img):
    try:
        qlr = BrotherQLRaster(PRINTER_MODEL)
        qlr.exception_on_warning = False
        convert(qlr=qlr, images=[img], label=LABEL_TYPE, rotate="0", threshold=70.0,
                dither=False, compress=False, red=False, dpi_600=False, hq=True, cut=True)
        send(instructions=qlr.data, printer_identifier=f"tcp://{PRINTER_IP}:9100",
             backend_identifier="network", blocking=True)
        return True
    except Exception as e:
        log(f"Print error: {e}")
        return False

def process_job(job):
    order_number = job["order_number"]
    order_date = job["order_date"]
    items = job["items"]
    total = sum(i["quantity"] for i in items)
    log(f"Printing {total} labels for {order_number}")
    idx = 1
    for item in items:
        for _ in range(item["quantity"]):
            img = make_label_image(item["name"], item["allergen_text"], order_number, order_date, idx, total)
            ok = print_label(img)
            log(f"Label {idx}/{total}: {'OK' if ok else 'FAILED'} - {item['name'][:30]}")
            idx += 1
            time.sleep(1)

def main():
    log("VK Label Agent v2 started")
    log(f"Printer: {PRINTER_IP} Model: {PRINTER_MODEL}")
    while True:
        job = fetch_next_job()
        if job:
            log(f"New job: {job['order_number']}")
            process_job(job)
            mark_done(job["id"])
        else:
            log("No jobs - sleeping")
        time.sleep(POLL_SECONDS)

main()
`;
  res.type("text/plain").send(script);
});

setupDb().then(() => {
  app.listen(PORT, () => console.log(`VK Label Server running on port ${PORT}`));
});
