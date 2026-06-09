"""
精简诊断脚本: 只测1个玩家加入, 监听所有网络请求和console日志
"""
import os
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:5180"
SCREENSHOT_DIR = "e:/GitHub/langrensha/test_screenshots"

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        channel="msedge",
        executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        args=["--no-sandbox"],
    )
    
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    
    # 收集所有 console 消息
    console_msgs = []
    def on_console(msg):
        console_msgs.append(f"[{msg.type}] {msg.text}")
    page.on("console", on_console)
    
    # 收集所有 WebSocket 消息
    ws_messages = []
    
    # === 步骤1: 法官创建房间 ===
    print("=" * 60)
    print("步骤1: 法官创建房间")
    print("=" * 60)
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    
    page.locator("input[placeholder*='昵称']").first.fill("法官")
    page.locator('button:has-text("配置村规并创建")').first.click()
    page.wait_for_timeout(3000)
    
    # 填昵称
    nick_input = page.locator("input[placeholder*='昵称']")
    if nick_input.count() > 0:
        val = nick_input.first.input_value()
        if not val.strip():
            nick_input.first.fill("法官")
            page.wait_for_timeout(500)
    
    # 点击创建 - 用 get_by_text 避免中文括号问题
    create_btn = page.get_by_text("创建房间（12人局")
    if create_btn.count() > 0:
        create_btn.first.click()
    page.wait_for_timeout(5000)
    
    judge_text = page.locator("body").inner_text()
    print(f"法官视角:\n{judge_text[:600]}")
    page.screenshot(path=f"{SCREENSHOT_DIR}/diag_judge.png")
    
    # 提取房间码
    import re
    m = re.search(r'房间码[：:]\s*([A-Z0-9]{4,8})', judge_text)
    room_code = m.group(1) if m else None
    print(f"\n房间码: {room_code}")
    
    # === 步骤2: 玩家尝试加入 ===
    print("\n" + "=" * 60)
    print("步骤2: 玩家A 尝试加入房间")
    print("=" * 60)
    
    player_page = browser.new_page(viewport={"width": 1280, "height": 900})
    
    # 监听 player_page 的 console 和 network
    p_console_msgs = []
    def p_on_console(msg):
        p_console_msgs.append(f"[{msg.type}] {msg.text}")
        print(f"  [CONSOLE {msg.type}] {msg.text[:200]}")
    player_page.on("console", p_on_console)
    
    player_page.goto(BASE_URL)
    player_page.wait_for_load_state("networkidle")
    player_page.wait_for_timeout(2000)
    
    # 填写表单
    player_page.locator("input[placeholder*='昵称']").first.fill("玩家A")
    code_input = player_page.locator("input[placeholder*='房间码']")
    if code_input.count() > 0 and room_code:
        code_input.first.fill(room_code)
        print(f"  已填入房间码: {room_code}")
    
    player_page.screenshot(path=f"{SCREENSHOT_DIR}/diag_before_join.png")
    
    # 点击前检查按钮状态
    join_btn = player_page.locator('button:has-text("加入房间")').first
    is_disabled = join_btn.is_disabled()
    print(f"  加入按钮 disabled={is_disabled}")
    
    # 点击加入
    print("\n  >>> 点击 '加入房间' 按钮 <<<")
    try:
        join_btn.click(timeout=10000)
        print("  click() 返回成功 (无异常)")
    except Exception as e:
        print(f"  click() 异常: {e}")
    
    # 等待足够长时间观察变化
    for sec in range(1, 11):
        player_page.wait_for_timeout(1000)
        text = player_page.locator("body").inner_text()
        url = player_page.url
        changed = "大厅" in text or "座位" in text or "准备" in text or "Lobby" in text
        if changed:
            print(f"  [{sec}s] 页面已变化! 进入房间!")
            break
        print(f"  [{sec}s] URL={url} | 文本片段: {text[:100]}")
    
    player_page.screenshot(path=f"{SCREENSHOT_DIR}/diag_after_join.png")
    
    final_text = player_page.locator("body").inner_text()
    print(f"\n最终玩家页面:\n{final_text[:600]}")
    
    # 打印所有 console 消息
    print(f"\n=== Console 日志 ({len(p_console_msgs)} 条) ===")
    for msg in p_console_msgs:
        print(f"  {msg}")
    
    player_page.close()
    page.close()
    browser.close()
