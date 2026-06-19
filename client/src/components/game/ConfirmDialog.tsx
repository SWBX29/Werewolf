import React, { ReactNode, useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** 确认按钮标签 */
  confirmLabel?: string;
  /** 取消按钮标签 */
  cancelLabel?: string;
  /** 确认按钮样式类型 */
  confirmVariant?: 'primary' | 'danger';
  /** 顶部图标（emoji 或 ReactNode） */
  icon?: ReactNode;
  /** 额外提示信息（显示在消息下方） */
  hints?: Array<{ text: string; type: 'warning' | 'info' | 'danger' }>;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 弹窗层级 */
  zIndex?: number;
}

/**
 * 通用二次确认弹窗
 * 支持图标、多类型提示、自定义按钮样式
 */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmVariant = 'primary',
  icon,
  hints,
  onConfirm,
  onCancel,
  zIndex = 40,
}: ConfirmDialogProps) {
  const mountedRef = useRef(true);
  const triggeredRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    triggeredRef.current = false;
  }, [open]);

  const handleConfirm = () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    if (mountedRef.current) onConfirm();
  };

  const handleCancel = () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    if (mountedRef.current) onCancel();
  };

  if (!open) return null;

  const confirmBtnClass = confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary';

  return (
    <div 
      className="fixed inset-0 z-${zIndex} flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up"
      style={{ zIndex }}
    >
      <div className="card max-w-sm w-full mx-4 space-y-4 text-center">
        {/* 图标 */}
        {icon && (
          <div className="text-4xl">{icon}</div>
        )}
        
        {/* 标题 */}
        <h3 className="text-lg font-bold text-gray-100">{title}</h3>
        
        {/* 消息 */}
        <p className="text-sm text-gray-400">{message}</p>
        
        {/* 额外提示 */}
        {hints && hints.length > 0 && (
          <div className="space-y-1">
            {hints.map((hint, idx) => (
              <p 
                key={idx}
                className={`text-xs ${
                  hint.type === 'warning' ? 'text-yellow-400' :
                  hint.type === 'danger' ? 'text-red-400 font-semibold' :
                  'text-gray-500'
                }`}
              >
                {hint.text}
              </p>
            ))}
          </div>
        )}
        
        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            className="btn-secondary flex-1"
            onClick={handleCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`${confirmBtnClass} flex-1`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ConfirmDialog);
