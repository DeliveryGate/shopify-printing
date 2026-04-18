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
  res.json({ queued: true, order: orderNumber, labels: 3, message: "Test job created!" });
});

app.post("/manual", async (req, res) => {
  const { order_number, order_date, items } = req.body;
  if (!order_number || !items) return res.status(400).json({ error: "Missing fields" });
  await sql`INSERT INTO print_jobs (order_number, order_date, items) VALUES (${order_number}, ${order_date || new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}, ${JSON.stringify(items)})`;
  res.json({ queued: true, order: order_number });
});

app.get("/agent", (req, res) => {
  const script = `import os, sys, subprocess, requests, time, io
from datetime import datetime

def install(pkg):
    subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    install("Pillow")
    from PIL import Image, ImageDraw, ImageFont

try:
    from brother_ql.conversion import convert
    from brother_ql.backends.helpers import send
    from brother_ql.raster import BrotherQLRaster
except ImportError:
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
LOGO_URL = "https://www.vandaskitchen.co.uk/cdn/shop/files/Landscape_logo_black.jpg"

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

def get_logo():
    try:
        r = requests.get(LOGO_URL, timeout=10)
        logo = Image.open(io.BytesIO(r.content)).convert("L")
        logo.thumbnail((280, 70), Image.LANCZOS)
        return logo
    except:
        return None

def wrap_text(text, max_chars):
    words = text.split()
    lines = []
    line = ""
    for word in words:
        test = (line + " " + word).strip()
        if len(test) <= max_chars:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines

def make_label_image(name, allergen, order_number, order_date, idx, total):
    W = 696
    H = 900  # Tall label like Just Eat
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)

    try:
        font_xxl = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 72)
        font_xl  = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 56)
        font_lg  = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 42)
        font_med = ImageFont.truetype("/system/fonts/DroidSans.ttf", 34)
        font_sml = ImageFont.truetype("/system/fonts/DroidSans.ttf", 26)
        font_xs  = ImageFont.truetype("/system/fonts/DroidSans.ttf", 22)
    except:
        font_xxl = font_xl = font_lg = font_med = font_sml = font_xs = ImageFont.load_default()

    y = 20

    # Logo top left
    logo = get_logo()
    if logo:
        img.paste(logo, (16, y))
        logo_h = logo.size[1]
    else:
        draw.text((16, y), "VANDA'S KITCHEN", fill="black", font=font_lg)
        logo_h = 50

    # Label count top right
    draw.text((W - 160, y + 10), f"Label {idx}/{total}", fill="#555555", font=font_sml)

    y += logo_h + 20
    draw.line([16, y, W-16, y], fill="#cccccc", width=2)
    y += 20

    # Product name — very large
    name_lines = wrap_text(name, 18)
    for line in name_lines[:2]:
        draw.text((16, y), line, fill="black", font=font_xxl)
        y += 82
    y += 10

    # Order + Date
    draw.text((16, y), f"Order: {order_number}", fill="#333333", font=font_med)
    y += 44
    draw.text((16, y), f"Date: {order_date}", fill="#333333", font=font_med)
    y += 56

    draw.line([16, y, W-16, y], fill="#cccccc", width=2)
    y += 24

    # Allergens — large and prominent
    allergen_color = (180, 0, 0) if "CONTAINS" in allergen else (0, 140, 0)
    allergen_lines = wrap_text(allergen, 22)
    for line in allergen_lines[:3]:
        draw.text((16, y), line, fill=allergen_color, font=font_lg)
        y += 52
    y += 16

    draw.line([16, y, W-16, y], fill="#cccccc", width=2)
    y += 20

    # Footer
    draw.text((16, y), "100% NUT-FREE  *  HALAL CERTIFIED  *  5-STAR HYGIENE", fill="#444444", font=font_xs)
    y += 32
    draw.text((16, y), "42-44 Carter Lane, London EC4V 5EA", fill="#444444", font=font_xs)

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
    log("VK Label Agent v4 started")
    log(f"Printer: {PRINTER_IP}")
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
