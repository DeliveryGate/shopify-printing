import os, sys, subprocess, requests, time, io
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

# Platform logos hosted in the shopify-printing GitHub repo. When Robert
# pushes the logo PNGs to a `logos/` folder in the repo, these URLs will
# resolve. If they don't (repo not pushed yet or 404), the renderer falls
# back to a plain-text rendition so the label still prints legibly.
PLATFORM_LOGO_URLS = {
    "just_eat": "https://raw.githubusercontent.com/DeliveryGate/shopify-printing/main/logos/just_eat_logo.png",
    "ordit":    "https://raw.githubusercontent.com/DeliveryGate/shopify-printing/main/logos/ordit_logo.png",
}

# Simple in-memory cache so we don't re-download platform logos every label
_logo_cache = {}

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

def get_platform_logo(platform):
    """Fetch and cache a platform logo. Returns PIL Image or None on failure."""
    if platform in _logo_cache:
        return _logo_cache[platform]
    url = PLATFORM_LOGO_URLS.get(platform)
    if not url:
        return None
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        logo = Image.open(io.BytesIO(r.content)).convert("RGB")
        _logo_cache[platform] = logo
        return logo
    except Exception as e:
        log(f"Platform logo fetch failed ({platform}): {e}")
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

# ---------------------------------------------------------------------------
# Shared PIL helpers for platform renderers
# ---------------------------------------------------------------------------

def _wrap_by_pixel(draw, text, font, max_width):
    """Word-wrap to fit max_width in pixels (not chars). Returns list of lines."""
    words = text.split()
    lines, current = [], ""
    for w in words:
        trial = f"{current} {w}".strip()
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = w
    if current:
        lines.append(current)
    return lines

def _draw_wrapped(draw, xy, text, font, max_width, fill=(0,0,0), line_spacing=4):
    x, y = xy
    for line in _wrap_by_pixel(draw, text, font, max_width):
        draw.text((x, y), line, font=font, fill=fill)
        bbox = draw.textbbox((0, 0), line, font=font)
        y += (bbox[3] - bbox[1]) + line_spacing
    return y

def _paste_logo_fit(canvas, logo, xy, target_height, max_width):
    """Paste logo scaled to target_height, shrinking further if it would
    exceed max_width. No alpha mask since our platform logos are RGB."""
    ratio = target_height / logo.height
    new_w = int(logo.width * ratio)
    new_h = target_height
    if new_w > max_width:
        ratio = max_width / logo.width
        new_w = max_width
        new_h = int(logo.height * ratio)
    resized = logo.resize((new_w, new_h), Image.LANCZOS)
    canvas.paste(resized, xy)
    return new_w, new_h

# ---------------------------------------------------------------------------
# Existing Shopify/VK renderer — UNCHANGED from handover version
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# NEW: Just Eat for Business renderer
# ---------------------------------------------------------------------------

def render_just_eat_label(name, allergen_raw, order_number, prepared_date):
    """
    Just Eat for Business style:
      Left:  big bold product name, allergens in red, order number
      Right: 'Vanda's Kitchen', Prepared date, 5°C storage notice
      Footer: Just Eat for Business logo + legal disclaimer
    """
    W, H = 696, 900
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    try:
        font_name = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 52)
        font_allergen = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 30)
        font_order = ImageFont.truetype("/system/fonts/DroidSans.ttf", 30)
        font_vk = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 18)
        font_prep_label = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 24)
        font_prep_date = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 28)
        font_notice = ImageFont.truetype("/system/fonts/DroidSans.ttf", 22)
        font_legal = ImageFont.truetype("/system/fonts/DroidSans.ttf", 15)
    except:
        font_name = font_allergen = font_order = font_vk = font_prep_label = \
            font_prep_date = font_notice = font_legal = ImageFont.load_default()

    BLACK = (0, 0, 0)
    RED = (192, 0, 0)
    GREEN = (0, 128, 0)
    GREY = (120, 120, 120)

    left_pad = 28
    right_col_x = 510
    right_col_w = W - right_col_x - 20
    left_col_w = right_col_x - left_pad - 20

    # Vertical separator
    d.line([(right_col_x - 14, 40), (right_col_x - 14, 740)], fill=GREY, width=2)

    # Product name
    _draw_wrapped(d, (left_pad, 40), name, font_name,
                  max_width=left_col_w, line_spacing=6, fill=BLACK)

    # Allergens
    allergens_clean = (allergen_raw or "").strip()
    has_allergens = bool(allergens_clean) and allergens_clean.lower() != "none"
    allergen_text = f"Allergens: {allergens_clean}" if has_allergens else "Allergens: None"
    allergen_colour = RED if has_allergens else GREEN
    y_after = _draw_wrapped(d, (left_pad, 520), allergen_text, font_allergen,
                             max_width=left_col_w, line_spacing=4, fill=allergen_colour)

    # Order number
    d.text((left_pad, y_after + 24), f"Order {order_number}",
           font=font_order, fill=BLACK)

    # Right column: Vanda's Kitchen
    d.text((right_col_x, 50), "Vanda's Kitchen", font=font_vk, fill=BLACK)

    # Prepared date
    d.text((right_col_x, 180), "Prepared", font=font_prep_label, fill=BLACK)
    d.text((right_col_x, 214), prepared_date or "", font=font_prep_date, fill=BLACK)

    # Storage notice
    ry = 380
    for line in ["Store below", "5°C and", "consume on", "day of", "delivery"]:
        d.text((right_col_x, ry), line, font=font_notice, fill=BLACK)
        ry += 32

    # Divider above footer
    d.line([(left_pad, 755), (W - left_pad, 755)], fill=BLACK, width=2)

    # Just Eat logo (footer left)
    logo = get_platform_logo("just_eat")
    if logo:
        _paste_logo_fit(img, logo, (left_pad, 785), target_height=72, max_width=110)
    else:
        d.text((left_pad, 800), "JUST EAT", font=font_prep_label, fill=BLACK)
        d.text((left_pad, 830), "for business", font=font_legal, fill=BLACK)

    # Legal disclaimer
    legal_x = left_pad + 125
    legal_text = (
        "Product information is supplied by the vendor partner and "
        "cannot be guaranteed by Just Eat for Business. This product "
        "may contain traces of other allergens. Please contact Just "
        "Eat for Business on 020 3893 3500 with any direct queries."
    )
    _draw_wrapped(d, (legal_x, 785), legal_text, font_legal,
                  max_width=W - legal_x - 10, line_spacing=2, fill=BLACK)

    return img

# ---------------------------------------------------------------------------
# NEW: Ordit renderer
# ---------------------------------------------------------------------------

def render_ordit_label(name, allergen_raw, order_number, item_number, item_total):
    """
    Ordit style:
      Left: product name, allergens (red), disclaimer
      Right: Ordit logo, Vanda's Kitchen vendor block, Order #, Item X of Y
      NO delivery date (Ordit labels don't show one)
    """
    W, H = 696, 900
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    try:
        font_name = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 50)
        font_allergen = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 26)
        font_disclaimer = ImageFont.truetype("/system/fonts/DroidSans.ttf", 15)
        font_vendor = ImageFont.truetype("/system/fonts/DroidSans.ttf", 17)
        font_order = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 30)
        font_item = ImageFont.truetype("/system/fonts/DroidSans-Bold.ttf", 22)
    except:
        font_name = font_allergen = font_disclaimer = font_vendor = \
            font_order = font_item = ImageFont.load_default()

    BLACK = (0, 0, 0)
    RED = (192, 0, 0)
    GREEN = (0, 128, 0)
    GREY = (120, 120, 120)

    left_pad = 28
    right_col_x = 450
    right_col_w = 216
    left_col_w = right_col_x - left_pad - 20

    # Separator
    d.line([(right_col_x - 12, 40), (right_col_x - 12, 720)], fill=GREY, width=2)

    # Product name (left)
    _draw_wrapped(d, (left_pad, 40), name, font_name,
                  max_width=left_col_w, line_spacing=6, fill=BLACK)

    # Allergens (left, bottom half)
    allergens_clean = (allergen_raw or "").strip()
    has_allergens = bool(allergens_clean) and allergens_clean.lower() != "none"
    allergen_text = f"Allergens: {allergens_clean}" if has_allergens else "Allergens: None"
    allergen_colour = RED if has_allergens else GREEN
    y_after = _draw_wrapped(d, (left_pad, 560), allergen_text, font_allergen,
                             max_width=left_col_w, line_spacing=4, fill=allergen_colour)

    # Disclaimer below allergens
    disclaimer = (
        "Product information is supplied by the vendor partner and cannot "
        "be guaranteed by Ordit. This product may contain traces of other "
        "allergens. Please contact the vendor partner directly with any "
        "queries."
    )
    _draw_wrapped(d, (left_pad, y_after + 16), disclaimer, font_disclaimer,
                  max_width=left_col_w, line_spacing=2, fill=BLACK)

    # Ordit logo (right, top, centred in column)
    logo = get_platform_logo("ordit")
    if logo:
        target_h = 80
        target_w = int(logo.width * (target_h / logo.height))
        if target_w > right_col_w:
            target_w = right_col_w
            target_h = int(logo.height * (target_w / logo.width))
        logo_x = right_col_x + (right_col_w - target_w) // 2
        _paste_logo_fit(img, logo, (logo_x, 15),
                        target_height=target_h, max_width=right_col_w)
    else:
        d.text((right_col_x, 20), "Ordit", font=font_name, fill=BLACK)

    # Vendor block (right, below logo)
    ry = 120
    for line in ["Vanda's Kitchen -", "Fresh, Free-From,", "and Flavourful",
                 "(Jefferies)"]:
        d.text((right_col_x, ry), line, font=font_vendor, fill=BLACK)
        ry += 22

    # Order number
    d.text((right_col_x, 330), "Order", font=font_order, fill=BLACK)
    d.text((right_col_x, 368), order_number, font=font_order, fill=BLACK)

    # Item X of Y
    d.text((right_col_x, 460), f"Item {item_number} of {item_total}",
           font=font_item, fill=BLACK)

    return img

# ---------------------------------------------------------------------------
# Print + job processing
# ---------------------------------------------------------------------------

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
    # Job-level platform takes precedence, falling back to item-level in case
    # the Mac sender put it there instead. Missing = classic VK/Shopify label.
    job_platform = job.get("platform")
    total = sum(i["quantity"] for i in items)
    log(f"Printing {total} labels for {order_number}"
        + (f" [platform={job_platform}]" if job_platform else ""))
    idx = 1
    for item in items:
        platform = job_platform or item.get("platform")
        for _ in range(item["quantity"]):
            if platform == "just_eat":
                img = render_just_eat_label(
                    name=item["name"],
                    allergen_raw=item["allergen_text"],
                    order_number=order_number,
                    prepared_date=order_date,
                )
            elif platform == "ordit":
                img = render_ordit_label(
                    name=item["name"],
                    allergen_raw=item["allergen_text"],
                    order_number=order_number,
                    item_number=idx,
                    item_total=total,
                )
            else:
                # Classic Shopify / VK path — completely untouched
                img = make_label_image(item["name"], item["allergen_text"],
                                        order_number, order_date, idx, total)
            ok = print_label(img)
            log(f"Label {idx}/{total}: {'OK' if ok else 'FAILED'} - {item['name'][:30]}")
            idx += 1
            time.sleep(1)

def main():
    log("VK Label Agent v5 started (platform-aware)")
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
