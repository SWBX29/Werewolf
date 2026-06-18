"""
配置管理模块 - 读取/写入 .env 文件
"""
import os
import shutil
from pathlib import Path
from typing import Dict, Optional


class ConfigManager:
    """管理 .env 配置文件"""
    
    # 环境变量定义（名称、描述、默认值、是否必需）
    ENV_VARS = {
        'PORT': {
            'description': '服务端 WebSocket 端口',
            'default': '3001',
            'required': True,
        },
        'VITE_PORT': {
            'description': '前端开发服务器端口',
            'default': '5180',
            'required': True,
        },
        'MONGODB_URI': {
            'description': 'MongoDB 连接字符串',
            'default': '',
            'required': True,
        },
        'ADMIN_SECRET': {
            'description': '管理员密钥',
            'default': '',
            'required': False,
        },
        'ZEGO_APP_ID': {
            'description': 'Zego App ID',
            'default': '',
            'required': False,
        },
        'ZEGO_SERVER_SECRET': {
            'description': 'Zego Server Secret',
            'default': '',
            'required': False,
        },
        'MEFRP_ARGS': {
            'description': 'ME Frp 启动参数（可选）',
            'default': '',
            'required': False,
        },
    }
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.env_file = self.project_root / '.env'
        self.env_example = self.project_root / '.env.example'
        self._config: Dict[str, str] = {}
        
    def ensure_env_file(self) -> bool:
        """确保 .env 文件存在，不存在则从 .env.example 复制"""
        if not self.env_file.exists():
            if self.env_example.exists():
                shutil.copy(self.env_example, self.env_file)
                return True
            else:
                # 创建空的 .env 文件
                self.env_file.touch()
                return True
        return False
    
    def load_config(self) -> Dict[str, str]:
        """加载 .env 文件配置"""
        self.ensure_env_file()
        
        with open(self.env_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 解析环境变量
        self._config = {}
        for line in content.splitlines():
            line = line.strip()
            # 跳过注释和空行
            if not line or line.startswith('#'):
                continue
            # 解析键值对
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                self._config[key] = value
        
        # 补充默认值
        for var_name, var_info in self.ENV_VARS.items():
            if var_name not in self._config:
                self._config[var_name] = var_info['default']
        
        return self._config
    
    def save_config(self) -> bool:
        """保存配置到 .env 文件"""
        try:
            # 读取原有文件内容，保留注释
            original_lines = []
            if self.env_file.exists():
                with open(self.env_file, 'r', encoding='utf-8') as f:
                    original_lines = f.readlines()
            
            # 构建新的文件内容
            new_lines = []
            config_written = set()
            
            for line in original_lines:
                stripped = line.strip()
                # 保留注释和空行
                if not stripped or stripped.startswith('#'):
                    new_lines.append(line)
                    continue
                # 更新已存在的变量
                if '=' in stripped:
                    key = stripped.split('=', 1)[0].strip()
                    if key in self._config:
                        new_lines.append(f"{key}={self._config[key]}\n")
                        config_written.add(key)
                    else:
                        new_lines.append(line)
            
            # 添加新变量
            for var_name, value in self._config.items():
                if var_name not in config_written:
                    new_lines.append(f"{var_name}={value}\n")
            
            # 写入文件
            with open(self.env_file, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
            
            return True
        except Exception as e:
            print(f"保存配置失败: {e}")
            return False
    
    def get(self, key: str) -> Optional[str]:
        """获取配置值"""
        return self._config.get(key)
    
    def set(self, key: str, value: str) -> bool:
        """设置配置值"""
        if key not in self.ENV_VARS:
            return False
        self._config[key] = value
        return True
    
    def get_port(self) -> int:
        """获取服务端端口"""
        return int(self._config.get('PORT', '3001'))
    
    def get_vite_port(self) -> int:
        """获取前端端口"""
        return int(self._config.get('VITE_PORT', '5180'))
    
    def get_mefrp_args(self) -> str:
        """获取 ME Frp 参数"""
        return self._config.get('MEFRP_ARGS', '')
    
    def has_mefrp_config(self) -> bool:
        """检查是否配置了 ME Frp"""
        args = self.get_mefrp_args()
        return bool(args and args.strip())
    
    def get_all_vars(self) -> Dict[str, Dict[str, str]]:
        """获取所有环境变量的详细信息"""
        result = {}
        for var_name, var_info in self.ENV_VARS.items():
            result[var_name] = {
                'description': var_info['description'],
                'default': var_info['default'],
                'required': var_info['required'],
                'current_value': self._config.get(var_name, var_info['default']),
            }
        return result