import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../../useGameStore';
import CountdownTimer from '../CountdownTimer';
import TargetSelector from '../TargetSelector';
import KnightDuel from '../skills/KnightDuel';

const SpeechPhase: React.FC = () => {
  const playerState = useGameStore((s) => s.playerState);
  const speechMessages = useGameStore((s) => s.speechMessages);
  const sendSpeech = useGameStore((s) => s.sendSpeech);
  const finishSpeech = useGameStore((s) => s.finishSpeech);
  const ruleConfig = useGameStore((s) => s.ruleConfig);
  const whiteWolfExplode = useGameStore((s) => s.whiteWolfExplode);
  const isActionLocked = useGameStore((s) => s.isActionLocked);
  const dayAnnouncement = useGameStore((s) => s.dayAnnouncement);
  const dismissDayAnnouncement = useGameStore((s) => s.dismissDayAnnouncement);
  const speechTimeRemaining = useGameStore((s) => s.speechTimeRemaining);

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 白狼王自爆状态
  const [showWolfExplode, setShowWolfExplode] = useState(false);
  const [wolfTarget, setWolfTarget] = useState<number | null>(null);
  const [showWolfConfirm, setShowWolfConfirm] = useState(false);

  // 遗言状态
  const [lastWordsInput, setLastWordsInput] = useState('');
  const [lastWordsSubmitted, setLastWordsSubmitted] = useState(false);

  // 天亮公告：5秒倒计时全屏覆盖 → 倒计时结束后显示内联摘要
  const [showDawnOverlay, setShowDawnOverlay] = useState(false);
  const [dawnCountdown, setDawnCountdown] = useState(5);
  const [showNightSummary, setShowNightSummary] = useState(false);

  // 当 dayAnnouncement 到达时，启动全屏倒计时
  useEffect(() => {
    if (!dayAnnouncement) return;
    setShowDawnOverlay(true);
    setShowNightSummary(false);
    setDawnCountdown(5);
  }, [dayAnnouncement]);

  // 5秒倒计时
  useEffect(() => {
    if (!showDawnOverlay) return;
    if (dawnCountdown <= 0) {
      setShowDawnOverlay(false);
      setShowNightSummary(true);
      return;
    }
    const timer = setTimeout(() => setDawnCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [showDawnOverlay, dawnCountdown]);

  if (!playerState) return null;

  const myPlayer = playerState.players.find((p) => p.id === playerState.myPlayerId);
  const mySeat = myPlayer?.seatNumber ?? 0;
  const isAlive = myPlayer?.status === 'alive';
  const isMuted = myPlayer?.isMuted ?? false;

  const { speechOrder, currentSpeakerIndex, players } = playerState;
  const currentSpeakerSeat = speechOrder[currentSpeakerIndex] ?? null;
  const isMyTurn = currentSpeakerSeat === mySeat;

  // 使用服务端同步的倒计时，若未启用则回退到本地配置值
  const speechCountdownSeconds = speechTimeRemaining > 0 ? speechTimeRemaining : ruleConfig.speechTimeout;

  const isKnight = myPlayer?.role === 'knight';
  const isWhiteWolfKing = myPlayer?.role === 'white_wolf_king';

  // 判断是否需要发表遗言（被投票出局等场景，自己已死亡且处于发言阶段）
  const needLastWords = !isAlive && myPlayer?.status === 'dead';

  // 白狼王自爆目标：所有存活玩家（排除自己）
  const wolfExplodeTargets = players
    .filter((p) => !p.isJudge && p.status === 'alive' && p.seatNumber !== mySeat)
    .map((p) => p.seatNumber);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [speechMessages]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    sendSpeech(trimmed);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLastWordsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleLastWordsSend();
    }
  };

  const handleLastWordsSend = () => {
    const trimmed = lastWordsInput.trim();
    if (!trimmed) return;
    sendSpeech(trimmed);
    setLastWordsSubmitted(true);
    setLastWordsInput('');
  };

  const getPlayerName = (seat: number) => {
    const p = players.find((pl) => pl.seatNumber === seat);
    return p?.nickname ?? '';
  };

  const getPlayerMuted = (seat: number) => {
    const p = players.find((pl) => pl.seatNumber === seat);
    return p?.isMuted ?? false;
  };

  // 白狼王自爆操作
  const handleWolfExplodeStart = () => {
    setShowWolfExplode(true);
    setWolfTarget(null);
  };

  const handleWolfTargetConfirm = () => {
    if (wolfTarget === null) return;
    setShowWolfConfirm(true);
  };

  const handleWolfExplodeConfirm = () => {
    if (wolfTarget === null) return;
    whiteWolfExplode(wolfTarget);
    setShowWolfConfirm(false);
    setShowWolfExplode(false);
    setWolfTarget(null);
  };

  const handleWolfExplodeCancel = () => {
    setShowWolfConfirm(false);
    setShowWolfExplode(false);
    setWolfTarget(null);
  };

  // 格式化时间戳
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="speech-panel p-4 space-y-3">
      {/* 标题 + 发言进度 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-amber-300">发言阶段</h3>
        <span className="text-sm text-gray-400">
          第 {currentSpeakerIndex + 1}/{speechOrder.length} 位发言
        </span>
      </div>

      {/* ===== 全屏"天亮了"覆盖层（5秒倒计时） ===== */}
      {dayAnnouncement && showDawnOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-amber-900/90 to-black/90 animate-fade-in-up">
          <div className="max-w-md w-full mx-4 text-center space-y-5">
            <h2 className="text-3xl font-bold text-amber-300 drop-shadow-lg">🌅 天亮了</h2>

            {/* 死亡结果 */}
            <div className="space-y-2">
              {dayAnnouncement.deaths.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-lg text-red-400 font-semibold">昨晚出局的是——</p>
                  {dayAnnouncement.deaths.map((d) => (
                    <p key={d.seatNumber} className="text-xl text-red-300 font-bold">
                      {d.seatNumber}号玩家 {d.nickname}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xl text-green-400 font-bold">昨晚是平安夜</p>
              )}
            </div>

            {/* 禁言信息 */}
            {dayAnnouncement.mutedSeats.length > 0 && (
              <p className="text-sm text-yellow-400">
                🔇 {dayAnnouncement.mutedSeats.map((s) => `${s}号`).join('、')} 被禁言
              </p>
            )}

            {/* 倒计时 */}
            <div className="mt-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border-4 border-amber-500 text-3xl font-bold text-amber-300">
                {dawnCountdown}
              </div>
              <p className="text-xs text-gray-400 mt-2">即将进入发言阶段...</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== 昨晚情况摘要（发言阶段持久显示） ===== */}
      {dayAnnouncement && showNightSummary && (
        <div className="animate-fade-in-up">
          <div className={`p-3 rounded-lg border ${
            dayAnnouncement.deaths.length > 0
              ? 'bg-red-950/30 border-red-800'
              : 'bg-green-950/30 border-green-800'
          }`}>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className={`font-bold text-sm ${dayAnnouncement.deaths.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  🌅 昨晚情况
                </p>
                {dayAnnouncement.deaths.length > 0 ? (
                  <div className="space-y-0.5">
                    {dayAnnouncement.deaths.map((d) => (
                      <p key={d.seatNumber} className="text-sm text-red-200">
                        {d.seatNumber}号 {d.nickname} 出局
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-green-300">平安夜</p>
                )}
                {dayAnnouncement.mutedSeats.length > 0 && (
                  <p className="text-sm text-yellow-400">
                    🔇 {dayAnnouncement.mutedSeats.map((s) => `${s}号`).join('、')} 禁言
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowNightSummary(false)}
                className="text-gray-500 hover:text-gray-300 ml-2 flex-shrink-0 text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 发言顺序条 */}
      <div className="flex flex-wrap gap-1.5">
        {speechOrder.map((seat, idx) => {
          const isCurrent = idx === currentSpeakerIndex;
          const hasSpoken = idx < currentSpeakerIndex;
          const playerMuted = getPlayerMuted(seat);
          return (
            <span
              key={seat}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                isCurrent
                  ? 'bg-amber-600 text-white seat-speaking'
                  : hasSpoken
                    ? 'bg-gray-700 text-gray-400'
                    : 'bg-night-700 text-gray-300'
              }`}
            >
              {seat}号
              {playerMuted && <span className="ml-0.5">🔇</span>}
            </span>
          );
        })}
      </div>

      {/* 当前发言者信息区 */}
      {currentSpeakerSeat !== null && (
        <div className="card p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎤</span>
            <div>
              <p className="text-amber-300 font-bold">
                {currentSpeakerSeat}号 {getPlayerName(currentSpeakerSeat)}
              </p>
              <p className="text-xs text-gray-400">
                {isMyTurn ? '轮到你发言' : '正在发言中...'}
              </p>
            </div>
          </div>
          <CountdownTimer seconds={speechCountdownSeconds} urgentThreshold={10} />
        </div>
      )}

      {/* 消息列表 */}
      <div className="h-64 overflow-y-auto space-y-1.5 pr-1">
        {speechMessages.map((msg, idx) => {
          const isSelf = msg.seatNumber === mySeat;
          return (
            <div
              key={idx}
              className={`chat-msg ${isSelf ? 'chat-msg-self' : 'chat-msg-other'}`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold text-sm">
                  {msg.seatNumber}号 {msg.nickname}
                </span>
                <span className="text-xs text-gray-500">{formatTime(msg.timestamp)}</span>
              </div>
              <p className="text-sm mt-0.5">{msg.content}</p>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 骑士决斗按钮（仅在自己发言回合显示） */}
      {isKnight && isMyTurn && isAlive && <KnightDuel />}

      {/* 白狼王自爆按钮（发言阶段可随时自爆） */}
      {isWhiteWolfKing && isAlive && !isActionLocked && !showWolfExplode && (
        <button
          className="w-full py-2 px-4 rounded-lg bg-red-900 hover:bg-red-800 text-white font-bold
                     border-2 border-red-600 transition-colors duration-200 flex items-center justify-center gap-2"
          onClick={handleWolfExplodeStart}
        >
          <span className="text-xl">🐺</span>
          白狼王自爆
        </button>
      )}

      {/* 白狼王自爆目标选择 */}
      {showWolfExplode && (
        <div className="space-y-3 p-3 bg-red-950/30 rounded-lg border border-red-800 animate-fade-in-up">
          <p className="text-sm text-red-300 font-semibold">选择自爆带走的目标</p>
          <TargetSelector
            targets={wolfExplodeTargets}
            players={players}
            mySeat={mySeat}
            selected={wolfTarget}
            onSelect={setWolfTarget}
          />
          <div className="flex gap-2">
            <button
              className="btn-danger flex-1"
              onClick={handleWolfTargetConfirm}
              disabled={wolfTarget === null}
            >
              确认目标
            </button>
            <button className="btn-secondary" onClick={handleWolfExplodeCancel}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 白狼王自爆确认对话框 */}
      {showWolfConfirm && wolfTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card max-w-sm w-full mx-4 space-y-4 animate-fade-in-up">
            <div className="text-center">
              <span className="text-4xl">🐺</span>
            </div>
            <p className="text-center text-lg font-semibold text-red-400">
              确定自爆带走 {wolfTarget}号 {getPlayerName(wolfTarget)} 吗？
            </p>
            <p className="text-center text-xs text-gray-500">
              自爆后你将死亡，并带走目标玩家
            </p>
            <div className="flex gap-3">
              <button className="btn-danger flex-1" onClick={handleWolfExplodeConfirm}>
                确认自爆
              </button>
              <button className="btn-secondary flex-1" onClick={handleWolfExplodeCancel}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 遗言阶段 */}
      {needLastWords && !lastWordsSubmitted && (
        <div className="space-y-2 p-3 bg-gray-900/50 rounded-lg border border-gray-700 animate-fade-in-up">
          <p className="text-sm text-gray-300 font-semibold text-center">📝 请发表遗言</p>
          <CountdownTimer seconds={speechCountdownSeconds} urgentThreshold={10} />
          <div className="flex gap-2">
            <input
              type="text"
              className="input-field flex-1"
              placeholder="请输入遗言内容..."
              value={lastWordsInput}
              onChange={(e) => setLastWordsInput(e.target.value)}
              onKeyDown={handleLastWordsKeyDown}
              maxLength={200}
            />
            <button
              className="btn-primary"
              onClick={handleLastWordsSend}
              disabled={!lastWordsInput.trim()}
            >
              发送
            </button>
          </div>
        </div>
      )}

      {needLastWords && lastWordsSubmitted && (
        <p className="text-gray-500 text-sm text-center">遗言已发送</p>
      )}

      {/* 输入区域：轮到自己且存活且未禁言 */}
      {isMyTurn && isAlive && !isMuted && !needLastWords && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              className="input-field flex-1"
              placeholder="请输入发言内容..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={200}
            />
            <button
              className="btn-primary"
              onClick={handleSend}
              disabled={!inputValue.trim()}
            >
              发送
            </button>
          </div>
          <button
            className="w-full py-2 px-4 rounded-lg bg-amber-800 hover:bg-amber-700 text-white font-semibold
                       border border-amber-600 transition-colors duration-200 text-sm"
            onClick={finishSpeech}
          >
            结束发言
          </button>
        </div>
      )}

      {/* 禁言提示 */}
      {isMyTurn && isMuted && (
        <p className="text-yellow-500 text-sm text-center">🔇 你被禁言了，无法发言</p>
      )}

      {/* 非自己回合等待提示 */}
      {!isMyTurn && currentSpeakerSeat && !needLastWords && (
        <p className="text-gray-400 text-sm text-center">
          等待 {currentSpeakerSeat}号 {getPlayerName(currentSpeakerSeat)} 发言中...
        </p>
      )}
    </div>
  );
};

export default SpeechPhase;
