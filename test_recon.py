"""Reconnaissance: inspect the home page UI structure and selectors"""
from playwright.sync_api import sync_playwright
import os

SCREENSHOT_DIR = "e:/GitHub/langrensha/test_screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    
    # Navigate to the app
    page.goto('http://localhost:5183')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    
    # Take full page screenshot
    page.screenshot(path=f"{SCREENSHOT_DIR}/01_home_page.png", full_page=True)
    
    # Discover all interactive elements
    buttons = page.locator('button').all()
    inputs = page.locator('input').all()
    selects = page.locator('select').all()
    
    print("=== BUTTONS ===")
    for i, btn in enumerate(buttons):
        text = btn.text_content() or ""
        visible = btn.is_visible()
        disabled = btn.is_disabled()
        btn_id = btn.get_attribute("id") or ""
        btn_class = btn.get_attribute("class") or ""
        print(f"  [{i}] text='{text.strip()}' visible={visible} disabled={disabled} id='{btn_id}' class='{btn_class[:60]}'")
    
    print("\n=== INPUTS ===")
    for i, inp in enumerate(inputs):
        placeholder = inp.get_attribute("placeholder") or ""
        input_type = inp.get_attribute("type") or "text"
        visible = inp.is_visible()
        inp_id = inp.get_attribute("id") or ""
        print(f"  [{i}] type={input_type} placeholder='{placeholder}' visible={visible} id='{inp_id}'")
    
    print("\n=== SELECTS ===")
    for i, sel in enumerate(selects):
        visible = sel.is_visible()
        sel_id = sel.get_attribute("id") or ""
        print(f"  [{i}] visible={visible} id='{sel_id}'")
    
    # Get page text
    body_text = page.locator('body').inner_text()
    print(f"\n=== PAGE TEXT (first 3000 chars) ===")
    print(body_text[:3000])
    
    browser.close()
