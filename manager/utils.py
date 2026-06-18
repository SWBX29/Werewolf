"""
工具函数模块 - 端口检查、进程管理等
"""
import os
import sys
import subprocess
import socket
import psutil
from typing import List, Optional, Tuple


def get_project_root() -> str:
    """获取项目根目录"""
    # 如果是打包后的 exe，获取 exe 所在目录
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    # 如果是脚本运行，获取脚本所在目录的父目录
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def check_port_in_use(port: int) -> Optional[int]:
    """检查端口是否被占用，返回占用进程的 PID"""
    for conn in psutil.net_connections():
        if conn.laddr.port == port and conn.status == 'LISTEN':
            return conn.pid
    return None


def get_process_by_port(port: int) -> Optional[psutil.Process]:
    """通过端口获取进程对象"""
    pid = check_port_in_use(port)
    if pid:
        try:
            return psutil.Process(pid)
        except psutil.NoSuchProcess:
            return None
    return None


def get_process_info(pid: int) -> Optional[dict]:
    """获取进程信息"""
    try:
        proc = psutil.Process(pid)
        return {
            'pid': pid,
            'name': proc.name(),
            'cmdline': ' '.join(proc.cmdline()),
            'exe': proc.exe(),
        }
    except psutil.NoSuchProcess:
        return None


def kill_process(pid: int) -> bool:
    """终止进程"""
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        # 等待进程终止
        proc.wait(timeout=5)
        return True
    except psutil.NoSuchProcess:
        return True
    except psutil.TimeoutExpired:
        # 强制终止
        try:
            proc.kill()
            return True
        except:
            return False
    except Exception:
        return False


def kill_processes_by_name(name_pattern: str) -> List[int]:
    """根据进程名称模式终止进程"""
    killed_pids = []
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            name = proc.info['name']
            cmdline = ' '.join(proc.info['cmdline'] or [])
            # 检查进程名称或命令行是否匹配
            if name_pattern.lower() in name.lower() or name_pattern.lower() in cmdline.lower():
                proc.terminate()
                killed_pids.append(proc.info['pid'])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return killed_pids


def find_node_processes() -> List[psutil.Process]:
    """查找 Node.js 相关进程（npm、node、vite）"""
    processes = []
    keywords = ['node', 'npm', 'vite', 'tsx']
    
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            name = proc.info['name']
            cmdline = ' '.join(proc.info['cmdline'] or [])
            
            for keyword in keywords:
                if keyword.lower() in name.lower() or keyword.lower() in cmdline.lower():
                    # 排除 mefrpc 进程
                    if 'mefrpc' not in name.lower() and 'mefrpc' not in cmdline.lower():
                        processes.append(proc)
                    break
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    return processes


def find_mefrpc_process() -> Optional[psutil.Process]:
    """查找 mefrpc 进程"""
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            name = proc.info['name']
            cmdline = ' '.join(proc.info['cmdline'] or [])
            
            if 'mefrpc' in name.lower() or 'mefrpc' in cmdline.lower():
                return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    return None


def is_mefrpc_running() -> bool:
    """检查 mefrpc 是否正在运行"""
    return find_mefrpc_process() is not None


def is_project_running(port: int) -> bool:
    """检查项目是否正在运行（通过端口判断）"""
    return check_port_in_use(port) is not None


def clear_screen():
    """清屏"""
    os.system('cls' if os.name == 'nt' else 'clear')


def run_command(cmd: str, cwd: str = None, shell: bool = True) -> subprocess.Popen:
    """运行命令并返回进程对象"""
    return subprocess.Popen(
        cmd,
        cwd=cwd,
        shell=shell,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
    )


def get_local_ip() -> str:
    """获取本机 IP 地址"""
    try:
        # 创建一个 UDP socket 连接到外部地址（不会真正发送数据）
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except:
        return "127.0.0.1"