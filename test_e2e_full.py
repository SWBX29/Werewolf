"""
狼人杀 E2E 全流程浏览器自动化测试 (v2)
通过真实浏览器操作模拟完整游戏流程，发现 UI/逻辑 bug

场景：12人局（法官+11玩家）
  - 法官点击"配置村规并创建" → 创建房间
  - 玩家输入房间码加入 → 准备
  - 法官开始游戏 → 走完整游戏流程
"""

import os
import sys
import time
from playwright.sync_api import sync_playwright, BrowserContext, Page

# ============================================================
# 配置
# ============================================================
BASE_URL = "http://localhost:5180"
SCREENSHOT_DIR = "e:/GitHub/langrensha/test_screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

JUDGE_NICKNAME = "法官"
PLAYERS = [f"玩家{chr(65+i)}" for i in range(12)]  # 玩家A~L = 12人, 配合12人局配置

bugs_found = []

def log_bug(severity, title, detail):
    bugs_found.append({"severity": severity, "title": title, "detail": detail})
    print(f"\n{'!'*60}\n  [{severity}] BUG: {title}\n  {detail}\n{'!'*60}")

def log_info(msg):
    print(f"  [INFO] {msg}")

def log_step(step):
    print(f"\n{'='*60}\n  >>> {step}\n{'='*60}")

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path, full_page=True)
    log_info(f"截图: {path}")


# ============================================================
# 阶段1: 侦察首页
# ============================================================

def step_1_recon(browser):
    log_step("阶段1: 侦察首页")
    page = browser.new_page()
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)
    screenshot(page, "01_home")

    # 列出所有可见元素
    for inp in page.locator("input:visible").all():
        ph = inp.get_attribute("placeholder") or ""
        tp = inp.get_attribute("type") or ""
        val = inp.input_value() if tp != "password" else "***"
        log_info(f"  input: type={tp} placeholder='{ph}' value='{val}'")

    for btn in page.locator("button:visible").all():
        txt = (btn.text_content() or "").strip()
        disabled = btn.is_disabled()
        log_info(f"  button: '{txt}' disabled={disabled}")

    body = page.locator("body").inner_text()
    log_info(f"\n页面文本:\n{body[:600]}")
    page.close()


# ============================================================
# 阶段2: 法官创建房间
# ============================================================

def step_2_judge_create(judge_ctx) -> tuple:
    """返回 (judge_page, room_code_str)"""
    log_step("阶段2: 法官创建房间")
    page = judge_ctx.new_page()
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # 输入昵称
    page.locator("input[placeholder*='昵称']").first.fill(JUDGE_NICKNAME)
    screenshot(page, "02_judge_input_name")

    # 步骤A: 点击"配置村规并创建"进入配置页
    clicked = False
    for sel in ['text="配置村规并创建"', 'button:has-text("配置")', 'button:has-text("创建")']:
        try:
            b = page.locator(sel).first
            if b.is_visible():
                b.click()
                clicked = True
                log_info(f"步骤A: 点击了 '{sel}'")
                break
        except:
            continue
    if not clicked:
        for b in page.locator("button:visible").all():
            t = (b.text_content() or "").strip()
            if "配置" in t or "创建" in t:
                b.click()
                clicked = True
                log_info(f"步骤A: fallback '{t}'")
                break

    page.wait_for_timeout(3000)
    screenshot(page, "03_config_page")

    # 步骤B-1: 检查配置页是否有昵称输入框需要填写
    config_nick = page.locator("input[placeholder*='昵称']")
    if config_nick.count() > 0:
        val = config_nick.first.input_value()
        if not val or not val.strip():
            config_nick.first.fill(JUDGE_NICKNAME)
            log_info(f"步骤B-1: 在配置页补充填写昵称: {JUDGE_NICKNAME}")
            page.wait_for_timeout(1000)

    # 步骤B-1b: 保持默认12人配置（不调整角色数量）
    log_info("步骤B-1b: 使用默认12人局配置")
    
    page.wait_for_timeout(500)

    # 步骤B: 在配置页上点击"创建房间（N人局）"按钮真正创建房间
    create_room_btns = [
        'text="创建房间（12人局）"',
        'text="创建房间"',
        'button:has-text("创建房间（")',
    ]
    
    room_created = False
    for sel in create_room_btns:
        try:
            b = page.locator(sel).first
            if b.is_visible():
                b.click()
                room_created = True
                log_info(f"步骤B: 点击了 '{sel}' — 创建房间!")
                break
        except:
            continue
    
    if not room_created:
        # fallback: 找包含"创建房间"和数字的按钮
        for b in page.locator("button:visible").all():
            t = (b.text_content() or "").strip()
            if "创建房间" in t and ("人局" in t or "局)" in t):
                b.click()
                room_created = True
                log_info(f"步骤B: fallback '{t}'")
                break
    
    if not room_created:
        log_bug("CRITICAL", "无法找到'创建房间(N人局)'按钮",
                f"可用按钮: {[(b.text_content() or '').strip() for b in page.locator('button:visible').all()]}")
    
    page.wait_for_timeout(5000)
    screenshot(page, "04_after_create_room")
    
    final_text = page.locator("body").inner_text()
    log_info(f"最终法官视角:\n{final_text[:800]}")
    
    return page


# ============================================================
# 阶段3: 玩家加入房间（带房间码）
# ============================================================

def step_3_players_join(browser, judge_page):
    log_step("阶段3: 玩家加入房间")

    # 先从法官页面获取房间码
    judge_text = judge_page.locator("body").inner_text()
    
    # 尝试多种方式获取房间码
    room_code = None
    
    # 方式1: 从页面文本中找6位数字/字母代码
    import re
    code_patterns = [
        r'房间码[：:]\s*([A-Za-z0-9]{4,8})',
        r'Room\s*[Cc]ode[：:]\s*([A-Za-z0-9]{4,8})',
        r'([A-Z0-9]{6})\s*(?:复制|copy)',
        r'(?:code|Code)[=:]?\s*"?([A-Za-z0-9]{4,8})',
    ]
    for pat in code_patterns:
        m = re.search(pat, judge_text)
        if m:
            room_code = m.group(1)
            break
    
    # 方式2: 查找包含房间码的元素
    if not room_code:
        code_elements = judge_page.locator('[class*="room-code"], [class*="roomCode"], [data-room-code]').all()
        for el in code_elements:
            txt = el.inner_text().strip()
            if len(txt) >= 4 and len(txt) <= 10:
                room_code = txt
                break
    
    # 方式3: 查找 input 或显示的房间码
    if not room_code:
        # 可能在某个 span/div 中显示
        all_spans = judge_page.locator('span:visible, div:visible, p:visible').all()
        for sp in all_spans:
            txt = (sp.text_content() or "").strip()
            if re.match(r'^[A-Z0-9]{4,8}$', txt) and txt.isupper():
                room_code = txt
                log_info(f"从span找到可能的房间码: {txt}")
                break

    if room_code:
        log_info(f"获取到房间码: {room_code}")
    else:
        log_bug("HIGH", "无法自动获取房间码", 
                f"法官页面文本片段: {judge_text[:400]}")
        # 尝试从 URL 获取
        url = judge_page.url
        log_info(f"法官页面URL: {url}")

    player_pages = []
    
    for i, nickname in enumerate(PLAYERS):
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()
        pg.goto(BASE_URL)
        pg.wait_for_load_state("networkidle")
        pg.wait_for_timeout(1500)

        # 输入昵称
        nick_input = pg.locator("input[placeholder*='昵称']")
        if nick_input.count() > 0:
            nick_input.first.fill(nickname)

        # 输入房间码
        code_input = pg.locator("input[placeholder*='房间码'], input[placeholder*='code']")
        if code_input.count() > 0 and room_code:
            code_input.first.fill(room_code)
            log_info(f"玩家{nickname} 输入房间码: {room_code}")
        elif code_input.count() > 0 and not room_code:
            log_bug("MEDIUM", f"玩家{nickname}有房间码框但无房间码可填", "")
            ctx.close()
            player_pages.append(None)
            continue

        screenshot(pg, f"05_p{i+1}_before_join")

        # 点击加入房间 - 必须用 button:has-text 避免匹配到标题文本
        join_clicked = False
        for sel in ['button:has-text("加入房间")', 'button:has-text("加入")']:
            try:
                b = pg.locator(sel).first
                if b.is_visible():
                    b.click()
                    join_clicked = True
                    log_info(f"点击了加入按钮: {sel}")
                    break
            except Exception as e:
                log_info(f"  选择器 {sel} 失败: {str(e)[:100]}")
                continue
        
        if not join_clicked:
            # fallback: 找所有可见的button
            for b in pg.locator("button:visible").all():
                t = (b.text_content() or "").strip()
                if "加入" in t:
                    try:
                        b.click()
                        join_clicked = True
                        log_info(f"fallback 点击: '{t}'")
                        break
                    except:
                        pass

        pg.wait_for_timeout(5000)  # 给足够时间让WS连接+ROOM_STATE推送+页面渲染
        screenshot(pg, f"06_p{i+1}_joined")

        # 检查是否成功
        pg_text = pg.locator("body").inner_text()
        error_kws = ["错误", "失败", "不存在", "已满", "ERROR"]
        has_err = any(k in pg_text for k in error_kws)
        if has_err:
            log_bug("HIGH", f"玩家{nickname}加入失败", pg_text[:300])
        
        success_kws = ["准备", "玩家列表", "Lobby", "等待", "座位"]
        is_in_room = any(k in pg_text for k in success_kws)
        if is_in_room:
            log_info(f"✓ 玩家{nickname} 成功进入房间")
        else:
            log_info(f"? 玩家{nickname} 状态不明: {pg_text[:200]}")

        player_pages.append((ctx, pg))

    return player_pages


# ============================================================
# 阶段4: 准备 & 开始游戏
# ============================================================

def step_4_start_game(judge_page, player_pages):
    log_step("阶段4: 准备 & 开始游戏")

    # 先看法官当前状态
    jtext = judge_page.locator("body").inner_text()
    log_info(f"法官当前状态:\n{jtext[:500]}")
    screenshot(judge_page, "07_before_start")

    # 所有玩家点准备
    for i, pp in enumerate(player_pages):
        if not pp: continue
        _, p = pp
        try:
            for sel in ['text="准备"', 'text="我准备好了"', 'button:has-text("准备")']:
                try:
                    b = p.locator(sel).first
                    if b.is_visible():
                        b.click()
                        log_info(f"玩家{PLAYERS[i]} 准备")
                        p.wait_for_timeout(300)
                        break
                except:
                    continue
            
            # 也尝试找 toggle 类的按钮
            ready_btns = p.locator('button[class*="ready"]').all()
            for rb in ready_btns:
                if rb.is_visible():
                    rb.click()
                    log_info(f"玩家{PLAYERS[i]} 通过class准备")
                    break
        except Exception as e:
            log_bug("LOW", f"玩家{PLAYERS[i]}准备异常", str(e))

    judge_page.wait_for_timeout(2000)
    screenshot(judge_page, "08_all_ready")

    # 法官找开始游戏按钮
    jtext2 = judge_page.locator("body").inner_text()
    start_clicked = False
    
    # 列出所有按钮供调试
    all_btns = [(b.text_content() or "").strip() for b in judge_page.locator("button:visible").all()]
    log_info(f"法官可用按钮: {all_btns}")

    for sel in ['text="开始游戏"', 'text="开始"', 'button:has-text("开始游戏")',
                 'button:has-text("开始")', 'text="Start Game"']:
        try:
            b = judge_page.locator(sel).first
            if b.is_visible():
                b.click()
                start_clicked = True
                log_info(f"法官点击了: '{sel}'")
                break
        except:
            continue
    
    if not start_clicked:
        # 尝试任何包含"开始"的按钮
        for b in judge_page.locator("button:visible").all():
            t = (b.text_content() or "").strip()
            if "开始" in t:
                b.click()
                start_clicked = True
                log_info(f"fallback 开始: '{t}'")
                break

    if not start_clicked:
        log_bug("CRITICAL", "找不到开始游戏按钮", f"按钮: {all_btns}")

    # 等待游戏推进
    log_info("等待游戏启动...")
    judge_page.wait_for_timeout(10000)
    screenshot(judge_page, "09_game_started")

    final_text = judge_page.locator("body").inner_text()
    log_info(f"启动后状态:\n{final_text[:800]}")
    
    phase_checks = ["角色展示", "入夜", "夜晚", "NIGHT", "ROLE_REVEAL", "发言", "投票"]
    entered = any(k in final_text for k in phase_checks)
    if entered:
        log_info("✓ 游戏已进入下一阶段")
    else:
        log_bug("HIGH", "游戏可能未正常启动", final_text[:400])

    return start_clicked


# ============================================================
# 阶段5: 夜间行动
# ============================================================

def step_5_night(judge_page, player_pages):
    log_step("阶段5: 夜间行动")
    
    # 给足够时间让夜间阶段展开
    for wait_sec in [5, 10, 15]:
        judge_page.wait_for_timeout(1000 * wait_sec)
        text = judge_page.locator("body").inner_text()
        if any(k in text for k in ["请选择", "行动", "查验", "击杀", "守护"]):
            break
    
    screenshot(judge_page, "10_night_judge")
    log_info(f"夜间法官:\n{judge_page.locator('body').inner_text()[:500]}")

    # 检查各玩家
    for i, pp in enumerate(player_pages):
        if not pp: continue
        _, p = pp
        try:
            pt = p.locator("body").inner_text()[:500]
            
            action_kw = ["选择目标", "击杀目标", "查验", "解药", "毒药", 
                        "守护目标", "恐惧", "模仿", "请选择", "night_action"]
            has_action = any(k in pt.lower() for k in action_kw)
            
            if has_action:
                log_info(f"玩家{PLAYERS[i]} 有行动面板")
                
                # 尝试选一个目标 - 找所有可点击的目标选项
                target_selectors = [
                    '.player-seat:not(.dead):not(.self):visible',
                    '[data-seat]:not([data-disabled]):visible',
                    'button[class*="target"]:visible',
                    'button[class*="seat"]:visible',
                    '.selectable:visible',
                ]
                
                for ts in target_selectors:
                    targets = p.locator(ts)
                    if targets.count() > 0:
                        idx = min(1, targets.count() - 1)  # 选第2个避免自刀
                        try:
                            targets.nth(idx).click()
                            log_info(f"  → 选了目标")
                            p.wait_for_timeout(500)
                            break
                        except:
                            continue
                
                # 提交
                for ss in ['text="提交"', 'text="确认"', 'text="确定"',
                           'button:has-text("提交")', 'button:has-text("确认")']:
                    try:
                        sb = p.locator(ss).first
                        if sb.is_visible():
                            sb.click()
                            log_info(f"  → 提交了行动")
                            p.wait_for_timeout(500)
                            break
                    except:
                        continue
                
                screenshot(p, f"11_p{i+1}_night_action")
            else:
                log_info(f"玩家{PLAYERS[i]} 无行动面板 ({pt[:120]})")
                
        except Exception as e:
            log_bug("LOW", f"玩家{PLAYERS[i]}夜间异常", str(e))

    # 等待结算
    judge_page.wait_for_timeout(15000)
    screenshot(judge_page, "12_night_settle")


# ============================================================
# 阶段6: 白天 & 投票
# ============================================================

def step_6_day_vote(judge_page, player_pages):
    log_step("阶段6: 白天 / 投票")
    
    judge_page.wait_for_timeout(5000)
    screenshot(judge_page, "13_day_announce")
    
    dt = judge_page.locator("body").inner_text()
    log_info(f"白天法官:\n{dt[:500]}")

    death_kws = ["死亡", "被杀", "毒死", "平安夜", "昨晚", "没有死亡"]
    if any(k in dt for k in death_kws):
        log_info("✓ 有死亡/安全公告")
    else:
        log_bug("MEDIUM", "白天缺少明确公告", dt[:300])

    # 玩家投票
    for i, pp in enumerate(player_pages):
        if not pp: continue
        _, p = pp
        try:
            pt = p.locator("body").inner_text()[:400]
            vote_kw = ["投票", "票出", "弃票", "vote"]
            
            if any(k in pt.lower() for k in vote_kw):
                log_info(f"玩家{PLAYERS[i]} 可投票")
                
                # 选投票目标
                for vsel in ['.vote-option:visible', 'button[data-vote]:visible',
                             'button[class*="vote"]:visible']:
                    opts = p.locator(vsel)
                    if opts.count() > 0:
                        try:
                            opts.nth(min(1, opts.count()-1)).click()
                            p.wait_for_timeout(300)
                            break
                        except:
                            continue
                
                # 提交投票
                for vsub in ['text="投票"', 'text="确认投票"', 'button:has-text("投票")']:
                    try:
                        vb = p.locator(vsub).first
                        if vb.is_visible():
                            vb.click()
                            log_info(f"  → 已投票")
                            p.wait_for_timeout(300)
                            break
                    except:
                            continue
                
                screenshot(p, f"14_p{i+1}_voted")
            else:
                log_info(f"玩家{PLAYERS[i]} 不可投票 ({pt[:120]})")
        except Exception as e:
            log_bug("LOW", f"玩家{PLAYERS[i]}投票异常", str(e))

    # 等结算
    judge_page.wait_for_timeout(15000)
    screenshot(judge_page, "15_vote_result")
    rt = judge_page.locator("body").inner_text()
    log_info(f"投票结果:\n{rt[:500]}")


# ============================================================
# 主流程
# ============================================================

def main():
    print("=" * 70)
    print("  狼人杀 E2E 全流程自动化测试 v2")
    print("=" * 70)
    print(f"  URL: {BASE_URL} | 玩家: {len(PLAYERS)}")
    print("=" * 70)

    results = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            channel="msedge",
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            args=["--no-sandbox"],
        )
        try:
            step_1_recon(browser)
            results["recon"] = True

            judge_ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            judge_page = step_2_judge_create(judge_ctx)
            results["create"] = True

            player_pages = step_3_players_join(browser, judge_page)
            results["joined"] = sum(1 for pp in player_pages if pp)

            started = step_4_start_game(judge_page, player_pages)
            results["started"] = started

            if started:
                step_5_night(judge_page, player_pages)
                step_6_day_vote(judge_page, player_pages)

            judge_ctx.close()
            for pp in player_pages:
                if pp: pp[0].close()

        except Exception as e:
            log_bug("CRITICAL", "未捕获异常", str(e))
            import traceback; traceback.print_exc()
        finally:
            browser.close()

    # 报告
    print("\n\n" + "#" * 70)
    print("#  E2E 测试报告 v2")
    print("#" * 70)
    for k, v in results.items():
        print(f"  {'✓' if v else '✗'} {k}: {'PASS' if v else 'FAIL'}")
    
    print(f"\n  发现问题: {len(bugs_found)} 个\n")
    for i, b in enumerate(bugs_found, 1):
        print(f"  {i}. [{b['severity']}] {b['title']}")
        print(f"     {b['detail'][:250]}\n")
    
    print(f"  截图: {SCREENSHOT_DIR}/")
    return 1 if bugs_found else 0


if __name__ == "__main__":
    sys.exit(main())
