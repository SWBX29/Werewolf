"""
菜单界面模块 - 使用 rich 库创建美观的命令行界面
"""
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.prompt import Prompt
from rich.text import Text
from rich import box

from config import ConfigManager
from process_manager import ProcessManager


class Menu:
    """菜单界面"""
    
    def __init__(self, config: ConfigManager, process_manager: ProcessManager):
        self.config = config
        self.process_manager = process_manager
        self.console = Console()
    
    def show_header(self):
        """显示标题和状态面板"""
        status = self.process_manager.get_status()
        
        # 项目状态
        project_status = "运行中" if status['project_running'] else "已停止"
        project_color = "green" if status['project_running'] else "red"
        
        # ME Frp 状态
        if not status['mefrpc_configured']:
            mefrp_status = "未配置"
            mefrp_color = "yellow"
        elif status['mefrpc_running']:
            mefrp_status = "运行中"
            mefrp_color = "green"
        else:
            mefrp_status = "已停止"
            mefrp_color = "red"
        
        # 构建状态面板内容
        content_lines = [
            f"[bold]项目状态:[/] [{project_color}]{project_status}[/]",
            f"[bold]服务端口:[/] {status['server_url']}",
            f"[bold]前端地址:[/] {status['client_url']}",
            f"[bold]ME Frp:[/] [{mefrp_color}]{mefrp_status}[/]",
        ]
        
        # 如果项目正在运行，显示访问提示
        if status['project_running']:
            content_lines.append("")
            content_lines.append(f"[cyan]浏览器访问: {status['client_url']}[/]")
        
        panel = Panel(
            "\n".join(content_lines),
            title="[bold cyan]狼人杀项目管理工具[/]",
            border_style="cyan",
            box=box.DOUBLE,
        )
        
        self.console.print(panel)
    
    def show_menu_options(self):
        """显示菜单选项"""
        self.console.print()
        self.console.print("[bold]请选择操作:[/]")
        
        options = [
            ("1", "启动项目", "green"),
            ("2", "关闭项目", "red"),
            ("3", "重启项目", "yellow"),
            ("4", "修改环境变量", "blue"),
            ("5", "启动 ME Frp (单独)", "cyan"),
            ("6", "停止 ME Frp (单独)", "cyan"),
            ("7", "查看日志", "white"),
            ("0", "退出", "white"),
        ]
        
        for num, desc, color in options:
            self.console.print(f"  [{color}][{num}][/] {desc}")
        
        self.console.print()
    
    def get_user_choice(self) -> str:
        """获取用户输入"""
        return Prompt.ask("输入选项编号", default="0")
    
    def show_env_vars(self):
        """显示环境变量列表"""
        vars_info = self.config.get_all_vars()
        
        table = Table(title="环境变量配置", box=box.ROUNDED)
        table.add_column("变量名", style="cyan")
        table.add_column("描述", style="white")
        table.add_column("当前值", style="green")
        table.add_column("必需", style="yellow")
        
        for var_name, info in vars_info.items():
            required = "是" if info['required'] else "否"
            # 隐藏敏感信息
            current_value = info['current_value']
            if var_name in ('MONGODB_URI', 'ADMIN_SECRET', 'ZEGO_SERVER_SECRET'):
                if current_value:
                    current_value = "***已配置***"
                else:
                    current_value = "(空)"
            
            table.add_row(var_name, info['description'], current_value, required)
        
        self.console.print(table)
    
    def edit_env_var(self):
        """编辑环境变量"""
        self.show_env_vars()
        self.console.print()
        
        var_name = Prompt.ask("输入要修改的变量名（或输入 q 返回）")
        
        if var_name.lower() == 'q':
            return
        
        if var_name not in self.config.ENV_VARS:
            self.console.print(f"[red]错误: 变量 {var_name} 不存在[/]")
            return
        
        current_value = self.config.get(var_name) or ""
        self.console.print(f"[cyan]当前值: {current_value}[/]")
        
        new_value = Prompt.ask("输入新值（留空则保持当前值）", default=current_value)
        
        if new_value != current_value:
            self.config.set(var_name, new_value)
            if self.config.save_config():
                self.console.print(f"[green]已更新 {var_name}[/]")
                
                # 提示是否需要重启
                status = self.process_manager.get_status()
                if status['project_running']:
                    restart = Prompt.ask("项目正在运行，是否重启使配置生效？", choices=["y", "n"], default="n")
                    if restart == "y":
                        self.process_manager.restart_project()
                        self.console.print("[green]项目已重启[/]")
            else:
                self.console.print("[red]保存失败[/]")
    
    def show_logs(self):
        """显示日志信息"""
        status = self.process_manager.get_status()
        
        self.console.print()
        self.console.print("[bold]系统状态:[/]")
        
        # 项目状态
        if status['project_running']:
            self.console.print(f"[green]项目运行中[/]")
            self.console.print(f"  - 服务端: {status['server_url']}")
            self.console.print(f"  - 前端: {status['client_url']}")
        else:
            self.console.print("[red]项目已停止[/]")
        
        # ME Frp 状态
        self.console.print()
        self.console.print("[bold]ME Frp:[/]")
        if not status['mefrpc_configured']:
            self.console.print("[yellow]未配置 MEFRP_ARGS[/]")
        elif status['mefrpc_running']:
            self.console.print("[green]运行中[/]")
        else:
            self.console.print("[red]已停止[/]")
        
        self.console.print()
        self.console.print("[dim]提示: 详细日志请查看项目目录下的终端输出[/]")
    
    def show_success(self, message: str):
        """显示成功消息"""
        self.console.print(f"[green]✓ {message}[/]")
    
    def show_error(self, message: str):
        """显示错误消息"""
        self.console.print(f"[red]✗ {message}[/]")
    
    def show_warning(self, message: str):
        """显示警告消息"""
        self.console.print(f"[yellow]⚠ {message}[/]")
    
    def show_info(self, message: str):
        """显示信息消息"""
        self.console.print(f"[cyan]ℹ {message}[/]")
    
    def confirm_action(self, message: str) -> bool:
        """确认操作"""
        return Prompt.ask(message, choices=["y", "n"], default="n") == "y"