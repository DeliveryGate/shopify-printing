#!/usr/bin/env python3
"""
Vanda's Kitchen — Label Print Agent
Runs on Android phone via Termux.
Polls Railway every 30 seconds for new print jobs.
Sends ESC/P label data to Brother QL-820NWBc over WiFi.

Setup (run once in Termux):
  pkg install python
  pip install requests
  python ~/print_agent.py

Auto-start on boot — handled by Termux:Boot.
"""

import requests
import socket
import time
import json
import os
from datetime import datetime

# ── CONFIG — edit these ───────────────────────────────────────
RAILWAY_URL    = "https://YOUR-APP.railway.app"   # your Railway URL
AGENT_SECRET   = "change_this_to_something_random_and_long"
PRINTER_IP     = "192.168.1.XXX"   # Brother's IP on your WiFi — find in printer settings
PRINTER_PORT   = 9100              # Brother raw print port
POLL_SECONDS   = 30
# ─────────────────────────────────────────────────────────────

HEADERS = {"x-agent-secret": AGENT_SECRET}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def fetch_next_job():
    try:
        r = requests.get(f"{RAILWAY_URL}/jobs/next", headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json().get("job")
    except Exception as e:
        log(f"⚠️  Poll failed: {e}")
        return None

def mark_done(job_id):
    try:
        requests.post(f"{RAILWAY_URL}/jobs/{job_id}/done", headers=HEADERS, timeout=10)
    except Exception as e:
        log(f"⚠️  Mark done failed: {e}")

def build_label_text(order_number, order_date, item_name, allergen_text, index, total):
    """Build plain text label — Brother QL prints this via raw socket."""
    lines = [
        "",
        "  VANDA'S KITCHEN",
        "  ST PAUL'S · LONDON EC4",
        "  " + "-" * 26,
        "",
        f"  {item_name[:32]}",
        f"  {item_name[32:64]}" if len(item_name) > 32 else "",
        "",
        f"  ORDER: {order_number}",
        f"  DATE:  {order_date}",
        f"  LABEL: {index} of {total}",
        "",
        "  " + "-" * 26,
        f"  {allergen_text[:36]}",
        f"  {allergen_text[36:72]}" if len(allergen_text) > 36 else "",
        "",
        "  100% NUT-FREE · HALAL CERTIFIED",
        "",
        "",
    ]
    return "\n".join(l for l in lines if l is not None) + "\n\f"  # \f = form feed

def send_to_printer(data: str):
    """Send raw text to Brother via TCP port 9100."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(10)
            s.connect((PRINTER_IP, PRINTER_PORT))
            s.sendall(data.encode("utf-8"))
        return True
    except Exception as e:
        log(f"❌ Printer error: {e}")
        return False

def process_job(job):
    order_number = job["order_number"]
    order_date   = job["order_date"]
    items        = job["items"]

    # Count total labels (one per unit)
    total_labels = sum(item["quantity"] for item in items)
    log(f"🖨️  Printing {total_labels} labels for {order_number}")

    label_index = 1
    all_ok = True

    for item in items:
        name         = item["name"]
        allergen     = item["allergen_text"]
        quantity     = item["quantity"]

        for _ in range(quantity):
            label_text = build_label_text(
                order_number, order_date, name, allergen,
                label_index, total_labels
            )
            ok = send_to_printer(label_text)
            if ok:
                log(f"  ✅ Label {label_index}/{total_labels}: {name[:30]}")
            else:
                log(f"  ❌ Label {label_index}/{total_labels} FAILED: {name[:30]}")
                all_ok = False
            label_index += 1
            time.sleep(0.5)  # small gap between labels

    return all_ok

def main():
    log("🚀 VK Label Agent started")
    log(f"   Railway: {RAILWAY_URL}")
    log(f"   Printer: {PRINTER_IP}:{PRINTER_PORT}")
    log(f"   Polling every {POLL_SECONDS}s")
    log("")

    while True:
        job = fetch_next_job()
        if job:
            log(f"📦 New job: {job['order_number']}")
            success = process_job(job)
            if success:
                mark_done(job["id"])
                log(f"✅ Job {job['order_number']} complete")
            else:
                log(f"⚠️  Job {job['order_number']} had errors — check printer")
        else:
            log("💤 No jobs — sleeping")

        time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()
