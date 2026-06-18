"""
进程管理模块 - 启动/停止项目进程和 mefrpc

生命周期策略：
- 项目启动时：如果配置了 MEFRP_ARGS，启动 mefrpc
- 项目关闭时：关闭 mefrpc
- 管理工具关闭时：不关闭 mefrpc（保持常驻）
"""
import os
import time
import subprocess
from pathlib import Path
from typing import Optional, Tuple, List

from config import ConfigManager
from utils import (
    check_port_in_use,
    get_process_info,
    kill_process,
    find_node_processes,
    find_mefrpc_process,
    is_mefrpc_running,
    run_command,
    get_project_root,
)


class ProcessManager:
    """进程管理器"""
    
    def __init__(self, config: ConfigManager):
        self.config = config
        self.project_root = get_project_root()
        self.dev_process: Optional[subprocess.Popen] = None
        self.mefrpc_process: Optional[subprocess.Popen] = None
        
    def _get_mefrpc_path(self) -> str:
        """获取 mefrpc.exe 的路径"""
        return str(Path(self.project_root) / 'server' / 'bin' / 'mefrpc.exe')
    
    def _parse_mefrp_args(self, args_str: str) -> List[str]:
        """解析 MEFRP_ARGS 参数"""
        if not args_str or not args_str.strip():
            return []
        
        # 简单解析：按空格分割，处理引号
        args = []
        current = ''
        in_quote = False
        quote_char = ''
        
        for char in args_str.strip():
            if char in ('"', "'") and not in_quote:
                in_quote = True
                quote_char = char
            elif char == quote_char and in_quote:
                in_quote = False
                quote_char = ''
            elif char == ' ' and not in_quote:
                if current:
                    args.append(current)
                    current = ''
            else:
                current += char
        
        if current:
            args.append(current)
        
        # 移除可执行文件名（如果包含）
        executable_names = ['mefrpc', 'mefrpc.exe', './mefrpc', '.\\mefrpc', 
                          './mefrpc.exe', '.\\mefrpc.exe']
        if args and args[0].replace('\\', '/').lower() in executable_names:
            args = args[1:]
        
        return args
    
    def check_ports_available(self) -> Tuple[bool, List[int]]:
        """检查端口是否可用"""
        port = self.config.get_port()
        vite_port = self.config.get_vite_port()
        
        occupied_ports = []
        
        if check_port_in_use(port):
            occupied_ports.append(port)
        
        if check_port_in_use(vite_port):
            occupied_ports.append(vite_port)
        
        return len(occupied_ports) == 0, occupied_ports
    
    def release_ports(self, ports: List[int]) -> bool:
        """释放被占用的端口"""
        for port in ports:
            pid = check_port_in_use(port)
            if pid:
                info = get_process_info(pid)
                if info:
                    print(f"正在终止进程 {pid} ({info['name']})...")
                    kill_process(pid)
        
        # 等待端口释放
        time.sleep(2)
        
        # 再次检查
        still_occupied = []
        for port in ports:
            if check_port_in_use(port):
                still_occupied.append(port)
        
        return len(still_occupied) == 0
    
    def start_project(self) -> Tuple[bool, str]:
        """
        启动项目
        
        流程：
        1. 检查端口是否可用
        2. 启动 npm run dev
        3. 如果配置了 MEFRP_ARGS，启动 mefrpc
        
        返回：(成功状态, 消息)
        """
        # 1. 检查端口
        available, occupied = self.check_ports_available()
        if not available:
            return False, f"端口 {occupied} 已被占用"
        
        # 2. 启动 npm run dev
        try:
            self.dev_process = run_command(
                'npm run dev',
                cwd=self.project_root,
            )
        except Exception as e:
            return False, f"启动项目失败: {e}"
        
        # 3. 如果配置了 MEFRP_ARGS，启动 mefrpc
        if self.config.has_mefrp_config():
            success, msg = self._start_mefrpc_internal()
            if not success:
                # mefrpc 启动失败不影响项目启动，仅提示
                print(f"警告: {msg}")
        
        return True, "项目启动成功"
    
    def stop_project(self) -> Tuple[bool, str]:
        """
        关闭项目
        
        流程：
        1. 查找并终止 node/npm 进程
        2. 关闭 mefrpc（跟随项目生命周期）
        
        返回：(成功状态, 消息)
        """
        # 1. 终止 node/npm 进程
        killed_count = 0
        processes = find_node_processes()
        
        for proc in processes:
            try:
                proc.terminate()
                killed_count += 1
            except Exception:
                pass
        
        # 等待进程终止
        time.sleep(2)
        
        # 强制终止仍在运行的进程
        for proc in processes:
            try:
                if proc.is_running():
                    proc.kill()
            except Exception:
                pass
        
        # 2. 关闭 mefrpc（跟随项目生命周期）
        self._stop_mefrpc_internal()
        
        # 清理进程引用
        self.dev_process = None
        
        return True, f"已终止 {killed_count} 个进程，mefrpc 已关闭"
    
    def restart_project(self) -> Tuple[bool, str]:
        """重启项目"""
        # 关闭项目
        success, msg = self.stop_project()
        if not success:
            return False, f"关闭项目失败: {msg}"
        
        # 等待 2 秒
        time.sleep(2)
        
        # 启动项目
        success, msg = self.start_project()
        if not success:
            return False, f"启动项目失败: {msg}"
        
        return True, "项目重启成功"
    
    def _start_mefrpc_internal(self) -> Tuple[bool, str]:
        """
        内部方法：启动 mefrpc 进程
        
        返回：(成功状态, 消息)
        """
        # 检查是否已运行
        if is_mefrpc_running():
            return True, "mefrpc 已在运行"
        
        # 检查可执行文件是否存在
        mefrpc_path = self._get_mefrpc_path()
        if not os.path.exists(mefrpc_path):
            return False, f"mefrpc.exe 不存在: {mefrpc_path}"
        
        # 解析参数
        args_str = self.config.get_mefrp_args()
        args = self._parse_mefrp_args(args_str)
        
        if not args:
            return False, "MEFRP_ARGS 参数为空"
        
        # 启动进程
        try:
            self.mefrpc_process = subprocess.Popen(
                [mefrpc_path] + args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
            )
            return True, "mefrpc 启动成功"
        except Exception as e:
            return False, f"启动 mefrpc 失败: {e}"
    
    def _stop_mefrpc_internal(self) -> Tuple[bool, str]:
        """
        内部方法：停止 mefrpc 进程
        
        返回：(成功状态, 消息)
        """
        # 查找 mefrpc 进程
        proc = find_mefrpc_process()
        
        if not proc:
            self.mefrpc_process = None
            return True, "mefrpc 未运行"
        
        # 终止进程
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        
        self.mefrpc_process = None
        return True, "mefrpc 已关闭"
    
    def start_mefrpc(self) -> Tuple[bool, str]:
        """
        用户操作：单独启动 mefrpc
        
        返回：(成功状态, 消息)
        """
        if not self.config.has_mefrp_config():
            return False, "未配置 MEFRP_ARGS"
        
        return self._start_mefrpc_internal()
    
    def stop_mefrpc(self) -> Tuple[bool, str]:
        """
        用户操作：单独停止 mefrpc
        
        返回：(成功状态, 消息)
        """
        return self._stop_mefrpc_internal()
    
    def get_status(self) -> dict:
        """获取当前状态"""
        port = self.config.get_port()
        vite_port = self.config.get_vite_port()
        
        project_running = check_port_in_use(port) is not None
        mefrpc_running = is_mefrpc_running()
        mefrpc_configured = self.config.has_mefrp_config()
        
        return {
            'project_running': project_running,
            'mefrpc_running': mefrpc_running,
            'mefrpc_configured': mefrpc_configured,
            'server_port': port,
            'vite_port': vite_port,
            'server_url': f"ws://localhost:{port}",
            'client_url': f"http://localhost:{vite_port}",
        }
    
    def cleanup_on_exit(self):
        """
        管理工具退出时的清理
        
        注意：不关闭 mefrpc，保持常驻运行
        """
        # 仅清理内部引用，不终止进程
        self.dev_process = None
        self.mefrpc_process = None