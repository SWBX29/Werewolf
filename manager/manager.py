"""
狼人杀项目管理工具 - 主程序入口

功能：
1. 启动/关闭/重启项目
2. 修改环境变量
3. 管理 mefrpc 进程
4. 显示端口和网页信息

使用方法：
双击 langrensha-manager.exe 运行
"""
import sys
import os
import traceback
from pathlib import Path


def main():
    """主函数"""
    try:
        # 导入模块（放在函数内部，便于捕获错误）
        from config import ConfigManager
        from process_manager import ProcessManager
        from menu import Menu
        from utils import clear_screen, get_project_root
        
        # 获取项目根目录
        project_root = get_project_root()
        
        # 初始化配置管理器
        config = ConfigManager(project_root)
        config.load_config()
        
        # 初始化进程管理器
        process_manager = ProcessManager(config)
        
        # 初始化菜单
        menu = Menu(config, process_manager)
        
        # 主循环
        while True:
            try:
                # 清屏
                clear_screen()
                
                # 显示标题和状态
                menu.show_header()
                
                # 显示菜单选项
                menu.show_menu_options()
                
                # 获取用户输入
                choice = menu.get_user_choice()
                
                # 处理选项
                if choice == "0":
                    # 退出
                    menu.show_info("正在退出...")
                    process_manager.cleanup_on_exit()
                    menu.show_info("mefrpc 将保持常驻运行")
                    break
                
                elif choice == "1":
                    # 启动项目
                    menu.show_info("正在启动项目...")
                    success, msg = process_manager.start_project()
                    if success:
                        menu.show_success(msg)
                        # 显示启动信息
                        status = process_manager.get_status()
                        menu.show_info(f"服务端: {status['server_url']}")
                        menu.show_info(f"前端: {status['client_url']}")
                        menu.show_info(f"浏览器访问: {status['client_url']}")
                    else:
                        menu.show_error(msg)
                
                elif choice == "2":
                    # 关闭项目
                    status = process_manager.get_status()
                    if not status['project_running']:
                        menu.show_warning("项目未运行")
                    else:
                        menu.show_info("正在关闭项目...")
                        success, msg = process_manager.stop_project()
                        if success:
                            menu.show_success(msg)
                        else:
                            menu.show_error(msg)
                
                elif choice == "3":
                    # 重启项目
                    menu.show_info("正在重启项目...")
                    success, msg = process_manager.restart_project()
                    if success:
                        menu.show_success(msg)
                        status = process_manager.get_status()
                        menu.show_info(f"服务端: {status['server_url']}")
                        menu.show_info(f"前端: {status['client_url']}")
                    else:
                        menu.show_error(msg)
                
                elif choice == "4":
                    # 修改环境变量
                    menu.edit_env_var()
                
                elif choice == "5":
                    # 启动 ME Frp (单独)
                    status = process_manager.get_status()
                    if not status['mefrpc_configured']:
                        menu.show_warning("未配置 MEFRP_ARGS，请先在环境变量中配置")
                    elif status['mefrpc_running']:
                        menu.show_warning("ME Frp 已在运行")
                    else:
                        menu.show_info("正在启动 ME Frp...")
                        success, msg = process_manager.start_mefrpc()
                        if success:
                            menu.show_success(msg)
                        else:
                            menu.show_error(msg)
                
                elif choice == "6":
                    # 停止 ME Frp (单独)
                    status = process_manager.get_status()
                    if not status['mefrpc_configured']:
                        menu.show_warning("未配置 MEFRP_ARGS")
                    elif not status['mefrpc_running']:
                        menu.show_warning("ME Frp 未运行")
                    else:
                        menu.show_info("正在停止 ME Frp...")
                        success, msg = process_manager.stop_mefrpc()
                        if success:
                            menu.show_success(msg)
                        else:
                            menu.show_error(msg)
                
                elif choice == "7":
                    # 查看日志
                    menu.show_logs()
                
                else:
                    menu.show_warning("无效选项，请重新输入")
                
                # 等待用户确认（非退出操作）
                if choice != "0":
                    menu.console.print()
                    menu.console.print("[dim]按 Enter 键继续...[/]")
                    input()
            
            except KeyboardInterrupt:
                # Ctrl+C 退出
                menu.show_info("\n正在退出...")
                process_manager.cleanup_on_exit()
                menu.show_info("mefrpc 将保持常驻运行")
                break
            
            except Exception as e:
                menu.show_error(f"发生错误: {e}")
                menu.console.print()
                menu.console.print("[dim]按 Enter 键继续...[/]")
                input()
    
    except Exception as e:
        # 捕获所有启动错误，防止闪退
        print("=" * 50)
        print("程序启动失败！")
        print("=" * 50)
        print(f"错误信息: {e}")
        print()
        print("详细错误:")
        traceback.print_exc()
        print()
        print("按 Enter 键退出...")
        input()


if __name__ == "__main__":
    main()