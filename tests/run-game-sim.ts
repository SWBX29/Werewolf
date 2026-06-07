/**
 * 狼人杀游戏模拟器 - WebSocket 集成测试程序
 *
 * 用法：
 *   1. 先启动服务端: cd server && npm run dev
 *   2. 运行: npx tsx tests/run-game-sim.ts [--auto|--interactive]
 */

import WebSocket from "ws";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ========== 类型定义 ==========

type RoleId =
  | "villager" | "seer" | "witch" | "hunter" | "guard" | "idiot" | "knight"
  | "werewolf" | "white_wolf_king" | "wolf_king" | "nightmare_shadow"
  | "hidden_wolf" | "mechanical_wolf";

type Faction = "good" | "evil";
type GamePhase =
  | "LOBBY" | "ROLE_REVEAL" | "PRE_NIGHT" | "NIGHT" | "NIGHT_SETTLEMENT"
  | "DAY_ANNOUNCE" | "SHERIFF_ELECTION" | "SHERIFF_TRANSFER"
  | "DAY_SPEECH" | "DAY_VOTE" | "DAY_SETTLEMENT" | "DAY_INTERRUPT"
  | "PK_VOTE" | "GAME_OVER";
type GameMode = "HUMAN" | "SYSTEM";
type PlayerStatus = "alive" | "dead" | "poisoned" | "voted_out";

interface RuleConfig {
  playerCount: number;
  roleDistribution: Partial<Record<RoleId, number>>;
  nightActionOrder: RoleId[];
  witchSaveSelf: "NEVER" | "FIRST_NIGHT" | "ALWAYS";
  witchCanUseBothPotions: boolean;
  guardWitchConflict: "DEATH" | "ALIVE";
  poisonBlockGun: boolean;
  knightDuelWolfKing: "CAN_SHOOT" | "SILENCED";
  knightDuelSuicide: "SUICIDE" | "REVEAL_ONLY";
  tieVoteResolution: "SKIP" | "PK_VOTE" | "RANDOM";
  winCondition: "SLAUGHTER_SIDE" | "SLAUGHTER_ALL";
  daytimeKillSequence: "TRIGGER_ALL" | "TRIGGER_DEFERRED";
  werewolfSharedVision: "ALL_SHARE" | "LEADER_ONLY" | "NONE";
  sharedWolfRoles: RoleId[];
  speechOrderStrategy: string;
  nightActionTimeout: number;
  speechTimeout: number;
  voteTimeout: number;
  revealIdentityOnDayVote: string;
  sheriffElectionEnabled: boolean;
  sheriffVoteWeight: 1 | 1.5 | 2;
}

interface Player {
  id: string;
  nickname: string;
  seatNumber: number;
  role: RoleId;
  status: PlayerStatus;
  isJudge: boolean;
  isSheriff: boolean;
  isHost: boolean;
  isReady: boolean;
  isNightmared: boolean;
  isMuted: boolean;
  witchAntidoteUsed: boolean;
  witchPoisonUsed: boolean;
  guardLastProtected: number | null;
  guardProtectedHistory: number[];
  nightmareTargetHistory: number[];
  idiotRevealed: boolean;
  hunterGunFired: boolean;
  wolfKingGunFired: boolean;
  hiddenWolfHasActed: boolean;
  mechanicalWolfImitateTarget: number | null;
  mechanicalWolfPhase: string | null;
  mechanicalWolfImitatedRole: RoleId | null;
  mechanicalWolfSkillDeferred: boolean;
  deathCause: string | null;
  deathRound: number | null;
}

interface NightSubPhase {
  currentRole: RoleId;
  currentRoleIndex: number;
  isBlockedByNightmare: boolean;
}

interface RoomState {
  roomCode: string;
  gameMode: GameMode;
  phase: GamePhase;
  nightSubPhase: NightSubPhase | null;
  round: number;
  config: RuleConfig;
  players: Player[];
  speechOrder: number[];
  currentSpeakerIndex: number;
  votes: Record<number, number>;
  sheriffElectionVotes: Record<number, number>;
  pkCandidates: number[];
  nightActions: Record<string, unknown>;
  werewolfTarget: number | null;
  witchSaveTarget: number | null;
  witchPoisonTarget: number | null;
  guardProtectTarget: number | null;
  nightmareTarget: number | null;
  wolfVotes: Record<number, number>;
  wolfVoteConsensus: boolean;
  wolfChatMessages: unknown[];
  nightDeaths: unknown[];
  dayDeaths: unknown[];
  isPaused: boolean;
  winner: Faction | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  configVersion: number;
}

type ClientMessage = Record<string, unknown>;
type ServerMessage = Record<string, unknown>;

// ========== 终端颜色 ==========

const C = {
  r: "\x1b[0m",
  b: "\x1b[1m",
  dim: "\x1b[2m",
  R: "\x1b[31m",
  G: "\x1b[32m",
  Y: "\x1b[33m",
  B: "\x1b[34m",
  M: "\x1b[35m",
  Cy: "\x1b[36m",
  W: "\x1b[37m",
};

function c(text: string, ...codes: string[]): string {
  return codes.join("") + text + C.r;
}

// ========== 日志系统 ==========

class Logger {
  private logLines: string[] = [];
  private logFile: string | null = null;

  setLogFile(path: string) {
    this.logFile = path;
    const dir = join(path, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private ts(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  }

  info(msg: string) {
    const line = `[${this.ts()}] ${msg}`;
    console.log(c(line, C.Cy));
    this.logLines.push(line);
  }

  action(msg: string) {
    const line = `[${this.ts()}] ${c(">", C.Y)} ${msg}`;
    console.log(line);
    this.logLines.push(`[ACTION] ${msg}`);
  }

  success(msg: string) {
    const line = `[${this.ts()}] ${c("[OK]", C.G)} ${msg}`;
    console.log(c(line, C.G));
    this.logLines.push(`[OK] ${msg}`);
  }

  error(msg: string) {
    const line = `[${this.ts()}] ${c("[ERR]", C.R)} ${msg}`;
    console.error(c(line, C.R, C.b));
    this.logLines.push(`[ERROR] ${msg}`);
  }

  warn(msg: string) {
    const line = `[${this.ts()}] ${c("[WARN]", C.Y)} ${msg}`;
    console.warn(c(line, C.Y));
    this.logLines.push(`[WARN] ${msg}`);
  }

  judge(msg: string) {
    const line = `[${this.ts()}] ${c("[JUDGE]", C.M, C.b)} ${msg}`;
    console.log(line);
    this.logLines.push(`[JUDGE] ${msg}`);
  }

  phase(phaseName: string, detail?: string) {
    const d = detail ? ` ${C.dim}${detail}${C.r}` : "";
    const line = `[${this.ts()}] ${c("*", C.b, C.Cy)} PHASE: ${c(phaseName, C.b, C.Cy)}${d}`;
    console.log(line);
    this.logLines.push(`[PHASE] ${phaseName} ${detail ?? ""}`);
  }

  result(msg: string) {
    const line = `[${this.ts()}] ${c("#", C.b)} ${msg}`;
    console.log(line);
    this.logLines.push(`[RESULT] ${msg}`);
  }

  gameover(winner: string) {
    const sep = c("=".repeat(55), C.b, C.Y);
    console.log(sep);
    const w = winner === "good" ? "GOOD SIDE WINS!" : "EVIL SIDE (WEREWOLF) WINS!";
    const winLine = `[${this.ts()}]  GAME OVER! ${w}`;
    console.log(c(winLine, C.b, C.Y));
    console.log(sep);
    this.logLines.push(`[GAMEOVER] ${winner === "good" ? "GOOD" : "EVIL"} WINS`);
  }

  separator() {
    const line = c("-".repeat(70), C.dim);
    console.log(line);
    this.logLines.push("---");
  }

  stateSummary(state: RoomState, label: string = "") {
    const alive = state.players.filter((p) => !p.isJudge && p.status === "alive");
    const dead = state.players.filter((p) => !p.isJudge && p.status !== "alive");
    const roles: Record<string, number> = {};
    for (const p of alive) {
      roles[p.role] = (roles[p.role] || 0) + 1;
    }
    const roleStr = Object.entries(roles)
      .map(([r, cnt]) => `${r}x${cnt}`)
      .join(", ");
    this.result(
      `${label || "STATE"} | phase:${state.phase} | round:${state.round} | alive:${alive.length}/${state.players.length - 1} | [${roleStr || "-"}]`
    );
    if (dead.length > 0) {
      for (const p of dead) {
        this.result(`  X #${p.seatNumber} ${p.nickname}(${p.role}) - ${p.status} ${p.deathCause ? `[${p.deathCause}]` : ""}`);
      }
    }
  }

  flush() {
    if (this.logFile) {
      try {
        const fd = require("fs").openSync(this.logFile, "a");
        require("fs").writeSync(fd, this.logLines.join("\n") + "\n", "utf-8");
        require("fs").closeSync(fd);
      } catch {
        /* ignore */
      }
      this.logLines = [];
    }
  }
}

const ROLE_NAMES: Record<RoleId, string> = {
  villager: "Villager",
  seer: "Seer",
  witch: "Witch",
  hunter: "Hunter",
  guard: "Guard",
  idiot: "Idiot",
  knight: "Knight",
  werewolf: "Werewolf",
  white_wolf_king: "WhiteWolfKing",
  wolf_king: "WolfKing",
  nightmare_shadow: "NightmareShadow",
  hidden_wolf: "HiddenWolf",
  mechanical_wolf: "MechanicalWolf",
};

const globalLog = new Logger();

// ========== TestClient - WebSocket 客户端封装 ==========

class TestClient {
  public ws: WebSocket | null = null;
  public playerId = "";
  public nickname: string;
  public seatNumber = 0;
  public isJudge = false;
  public lastRoomState: RoomState | null = null;
  public messageQueue: Array<{ type: string; data: unknown }> = [];
  public resolveWaiters: Map<string, Array<(data: any) => void>> = new Map();
  private url: string;
  private connected = false;

  constructor(nickname: string, url: string, judge: boolean = false) {
    this.nickname = nickname;
    this.url = url;
    this.isJudge = judge;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this.connected = true;
        globalLog.info(`${this.nickname} connected`);
        resolve();
      });

      this.ws.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(msg as ServerMessage);
        } catch (e) {
          globalLog.error(`${this.nickname} parse error: ${e}`);
        }
      });

      this.ws.on("error", (err) => {
        globalLog.error(`${this.nickname} WS error: ${(err as Error).message}`);
        if (!this.connected) reject(err);
      });

      this.ws.on("close", () => {
        this.connected = false;
        globalLog.info(`${this.nickname} disconnected`);
      });
    });
  }

  private handleMessage(msg: ServerMessage) {
    const type = msg.type as string;
    if (type === "ROOM_STATE" && msg.state) {
      this.lastRoomState = msg.state as RoomState;
    }
    this.messageQueue.push({ type, data: msg });

    const waiters = this.resolveWaiters.get(type);
    if (waiters) {
      for (const fn of waiters) fn(msg);
      this.resolveWaiters.delete(type);
    }

    const starWaiters = this.resolveWaiters.get("*");
    if (starWaiters) {
      const fn = starWaiters.shift();
      if (fn) fn(msg);
      if (starWaiters.length === 0) this.resolveWaiters.delete("*");
    }
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.nickname}: WS not connected`);
    }
    this.ws.send(JSON.stringify(msg));
  }

  waitFor(type: string, timeoutMs = 10000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const idx = this.messageQueue.findIndex((m) => m.type === type);
      if (idx >= 0) {
        const found = this.messageQueue.splice(idx, 1)[0];
        resolve(found.data);
        return;
      }

      const timer = setTimeout(() => {
        this.removeWaiter(type, resolve);
        reject(new Error(`${this.nickname}: waitFor(${type}) timeout`));
      }, timeoutMs);

      const wrapped = (data: any) => {
        clearTimeout(timer);
        resolve(data);
      };

      if (!this.resolveWaiters.has(type)) {
        this.resolveWaiters.set(type, []);
      }
      this.resolveWaiters.get(type)!.push(wrapped);
    });
  }

  getState(): RoomState | null {
    return this.lastRoomState;
  }

  getMyPlayer(): Player | null {
    if (!this.lastRoomState) return null;
    return (
      this.lastRoomState.players.find((p) => p.id === this.playerId) || null
    );
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private removeWaiter(type: string, fn: Function) {
    const waiters = this.resolveWaiters.get(type);
    if (waiters) {
      const idx = waiters.indexOf(fn as any);
      if (idx >= 0) waiters.splice(idx, 1);
    }
  }
}

// ========== 游戏配置 ==========

const GAME_CONFIG: RuleConfig = {
  playerCount: 12,
  roleDistribution: {
    villager: 1,
    seer: 1,
    witch: 1,
    hunter: 1,
    guard: 1,
    idiot: 1,
    knight: 1,
    werewolf: 1,
    white_wolf_king: 0,
    wolf_king: 1,
    nightmare_shadow: 1,
    hidden_wolf: 1,
    mechanical_wolf: 1,
  },
  nightActionOrder: ["nightmare_shadow", "werewolf", "witch", "seer", "guard", "mechanical_wolf"],
  witchSaveSelf: "ALWAYS",
  witchCanUseBothPotions: true,
  guardWitchConflict: "DEATH",
  poisonBlockGun: false,
  knightDuelWolfKing: "CAN_SHOOT",
  knightDuelSuicide: "SUICIDE",
  tieVoteResolution: "PK_VOTE",
  winCondition: "SLAUGHTER_SIDE",
  daytimeKillSequence: "TRIGGER_ALL",
  werewolfSharedVision: "ALL_SHARE",
  sharedWolfRoles: ["werewolf", "wolf_king", "nightmare_shadow"],
  speechOrderStrategy: "DEATH_LEFT",
  nightActionTimeout: 30,
  speechTimeout: 60,
  voteTimeout: 20,
  revealIdentityOnDayVote: "NONE",
  sheriffElectionEnabled: false,
  sheriffVoteWeight: 1.5,
};

const PLAYER_NAMES = [
  "Judge",
  "P1", "P2", "P3", "P4", "P5", "P6",
  "P7", "P8", "P9", "P10", "P11", "P12",
];

const SERVER_URL = process.env.SERVER_URL || "ws://localhost:3001";
const MODE = process.argv.includes("--auto") ? "auto" : "interactive";

// ========== GameSimulator 主控类 ==========

class GameSimulator {
  public judge!: TestClient;
  public players: TestClient[] = [];
  public roomCode = "";
  private round = 0;

  get allClients(): TestClient[] {
    return [this.judge, ...this.players];
  }

  get judgeState(): RoomState | null {
    return this.judge.getState();
  }

  get alivePlayers(): Player[] {
    if (!this.judgeState) return [];
    return this.judgeState.players.filter(
      (p) => !p.isJudge && p.status === "alive"
    );
  }

  getPlayerByRole(role: RoleId): Player | undefined {
    return this.alivePlayers.find((p) => p.role === role);
  }

  getClientBySeat(seat: number): TestClient | undefined {
    return this.players.find((p) => p.seatNumber === seat);
  }

  getClientByRole(role: RoleId): TestClient | undefined {
    const player = this.getPlayerByRole(role);
    if (!player) return undefined;
    return this.getClientBySeat(player.seatNumber);
  }

  // ---------- 初始化 ----------

  async init() {
    globalLog.separator();
    globalLog.info(c("Werewolf Game Simulator Starting", C.b, C.W));
    globalLog.info(`Server: ${SERVER_URL}`);
    globalLog.info(`Mode: ${MODE}`);
    globalLog.info(`Config: 12 players (7 good vs 5 evil)`);
    globalLog.separator();

    this.judge = new TestClient(PLAYER_NAMES[0], SERVER_URL, true);
    await this.judge.connect();
    await sleep(200);

    for (let i = 1; i <= 12; i++) {
      const client = new TestClient(PLAYER_NAMES[i], SERVER_URL);
      await client.connect();
      this.players.push(client);
      await sleep(100);
    }

    globalLog.success(`All clients connected (1 judge + ${this.players.length} players)`);
  }

  // ---------- 创建房间 ----------

  async createRoom() {
    globalLog.separator();
    globalLog.action("=== Step 1: Judge creates room ===");

    this.judge.send({
      type: "CREATE_ROOM",
      nickname: PLAYER_NAMES[0],
      gameMode: "HUMAN",
      config: GAME_CONFIG,
    });

    const msg = (await this.judge.waitFor("ROOM_CREATED", 5000)) as any;
    this.roomCode = msg.roomCode;
    globalLog.success(`Room created: ${this.roomCode}`);

    await this.judge.waitFor("ROOM_STATE", 3000);
    this.judge.playerId =
      this.judge.lastRoomState?.players.find((p) => p.isJudge)?.id || "";
    globalLog.info(`Judge playerId: ${this.judge.playerId}`);
  }

  // ---------- 玩家加入 ----------

  async joinPlayers() {
    globalLog.action("=== Step 2: Players join room ===");

    for (let i = 0; i < this.players.length; i++) {
      const client = this.players[i];
      client.send({
        type: "JOIN_ROOM",
        nickname: PLAYER_NAMES[i + 1],
        roomCode: this.roomCode,
      });

      const stateMsg = (await client.waitFor("ROOM_STATE", 5000)) as any;
      const state = stateMsg.state as RoomState;
      const myPlayer = state.players.find(
        (p) => p.nickname === client.nickname
      );
      if (myPlayer) {
        client.playerId = myPlayer.id;
        client.seatNumber = myPlayer.seatNumber;
      }
      globalLog.success(
        `  ${client.nickname} joined -> seat #${client.seatNumber}`
      );
      await sleep(100);
    }

    await this.judge.waitFor("ROOM_STATE", 2000);
    globalLog.stateSummary(this.judgeState!, "All players seated");
  }

  // ---------- 开始游戏 ----------

  async startGame() {
    globalLog.separator();
    globalLog.action("=== Step 3: Judge starts game ===");

    this.judge.send({ type: "START_GAME" });

    let state = await this.waitForJudgePhase(
      ["ROLE_REVEAL", "NIGHT"],
      10000
    );
    globalLog.phase(state.phase, "Game started! Roles assigned");

    this.printRoleAssignment();

    if (state.phase === "ROLE_REVEAL") {
      state = await this.waitForJudgePhase(["NIGHT"], 8000);
      globalLog.phase(state.phase, `Night ${state.round} begins`);
    }

    this.round = state.round;
  }

  // ---------- 夜间行动 ----------

  async runNightActions(roundNum: number) {
    globalLog.separator();
    globalLog.phase("NIGHT", `=== Night ${roundNum} Actions ===`);

    let lastExecutedRole: string | null = null;

    while (true) {
      const state = this.judgeState;
      if (!state || state.phase !== "NIGHT") break;

      const sub = state.nightSubPhase;
      if (!sub) break;

      // 防止同一子阶段重复执行
      if (sub.currentRole === lastExecutedRole) {
        // 子阶段没变，可能需要等待或强制推进
        await sleep(500);
        const newState = this.judgeState;
        if (newState?.nightSubPhase?.currentRole === lastExecutedRole) {
          globalLog.warn(`  Sub-phase ${sub.currentRole} stuck, force advancing`);
          await this.judgeForceNext();
          await sleep(500);
        }
        continue;
      }

      await this.pauseIfInteractive(
        `Night sub-phase: ${sub.currentRole} (blocked: ${sub.isBlockedByNightmare})`
      );

      if (sub.isBlockedByNightmare) {
        globalLog.info(`  ${sub.currentRole} blocked by NightmareShadow, skip`);
        lastExecutedRole = sub.currentRole;
        await sleep(1500);
        continue;
      }

      lastExecutedRole = sub.currentRole;

      switch (sub.currentRole) {
        case "nightmare_shadow":
          await this.doNightmareAction();
          break;
        case "werewolf":
          await this.doWerewolfAction();
          break;
        case "witch":
          await this.doWitchAction(roundNum);
          break;
        case "seer":
          await this.doSeerAction();
          break;
        case "guard":
          await this.doGuardAction();
          break;
        case "mechanical_wolf":
          await this.doMechanicalWolfAction();
          break;
        default:
          globalLog.warn(`  Unknown sub-phase: ${sub.currentRole}`);
          await this.judgeForceNext();
          break;
      }

      await sleep(800);
    }

    const nextState = await this.waitForJudgePhase(
      ["NIGHT_SETTLEMENT", "DAY_ANNOUNCE", "DAY_SPEECH", "GAME_OVER"],
      15000
    );
    globalLog.phase(nextState.phase, `Night ${roundNum} settlement done`);

    this.printNightDeaths();
  }

  /** 等待法官视角的 nightSubPhase 发生变化（表示夜间子阶段已推进） */
  private async waitForSubPhaseChange(
    prevRole: string | null,
    timeoutMs = 5000
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const state = this.judgeState;
      if (!state) { await sleep(200); continue; }
      const cur = state.nightSubPhase?.currentRole || null;
      if (cur !== prevRole) return true;
      // 如果阶段已离开 NIGHT，也算成功
      if (state.phase !== "NIGHT") return true;
      await sleep(200);
    }
    // 超时：子阶段没有推进，可能需要法官强制推进
    globalLog.warn(`  Sub-phase did not advance from ${prevRole}, forcing next`);
    await this.judgeForceNext();
    await sleep(500);
    return false;
  }

  private async doNightmareAction() {
    const client = this.getClientByRole("nightmare_shadow");
    if (!client) {
      globalLog.info("  No living NightmareShadow, skip");
      await this.judgeForceNext();
      return;
    }

    const player = client.getMyPlayer()!;
    const aliveSeats = this.alivePlayers.map((p) => p.seatNumber);
    const history = player.nightmareTargetHistory || [];
    const available = aliveSeats.filter(
      (s) => s !== player.seatNumber && !history.includes(s)
    );

    if (available.length === 0) {
      globalLog.info("  NightmareShadow has no valid target, skip");
      await this.judgeForceNext();
      return;
    }

    const target = available[Math.floor(Math.random() * available.length)];
    globalLog.action(`  NightmareShadow(#${player.seatNumber}) fears #${target}`);

    const prevSub = this.judgeState?.nightSubPhase?.currentRole || null;
    client.send({
      type: "NIGHT_ACTION",
      roleId: "nightmare_shadow",
      targetSeat: target,
      extra: {},
    });

    await this.waitForSubPhaseChange(prevSub);
    globalLog.success(`  NightmareShadow action done -> target #${target}`);
  }

  private async doWerewolfAction() {
    const wolves = this.alivePlayers.filter((p) =>
      GAME_CONFIG.sharedWolfRoles.includes(p.role)
    );

    if (wolves.length === 0) {
      globalLog.info("  No living shared-vision wolves, skip");
      await this.judgeForceNext();
      return;
    }

    const evilRoles = [
      "werewolf", "wolf_king", "nightmare_shadow", "hidden_wolf", "mechanical_wolf",
    ];
    const targets = this.alivePlayers.filter((p) => !evilRoles.includes(p.role));

    if (targets.length === 0) {
      globalLog.info("  No non-wolf targets available");
      await this.judgeForceNext();
      return;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];
    globalLog.action(`  Wolves agree to kill: #${target.seatNumber} ${target.nickname}`);

    for (const wolf of wolves) {
      const wc = this.getClientBySeat(wolf.seatNumber)!;
      wc.send({ type: "WOLF_VOTE", targetSeat: target.seatNumber });
      globalLog.info(
        `    ${ROLE_NAMES[wolf.role]}(#${wolf.seatNumber}) votes -> #${target.seatNumber}`
      );
      await sleep(200);
    }

    await sleep(1000);
    globalLog.success(`  Wolf kill target locked: #${target.seatNumber}`);
  }

  private async doWitchAction(_roundNum: number) {
    const wc = this.getClientByRole("witch");
    if (!wc) {
      globalLog.info("  No living Witch, skip");
      return;
    }

    const witch = wc.getMyPlayer()!;
    const state = this.judgeState!;

    const useAntidote =
      !witch.witchAntidoteUsed &&
      state.werewolfTarget !== null &&
      Math.random() > 0.3;
    const usePoison = !witch.witchPoisonUsed && Math.random() > 0.6;

    let poisonTarget: number | null = null;
    if (usePoison) {
      const candidates = this.alivePlayers.filter(
        (p) => p.seatNumber !== witch.seatNumber
      );
      if (candidates.length > 0) {
        poisonTarget =
          candidates[Math.floor(Math.random() * candidates.length)].seatNumber;
      }
    }

    const actions: string[] = [];
    if (useAntidote) actions.push(`save -> #${state.werewolfTarget}`);
    if (usePoison) actions.push(`poison -> #${poisonTarget}`);
    if (!useAntidote && !usePoison) actions.push("no potion");

    globalLog.action(
      `  Witch(#${witch.seatNumber}) acts: ${actions.join(", ")}`
    );

    const prevSub = this.judgeState?.nightSubPhase?.currentRole || null;
    wc.send({
      type: "NIGHT_ACTION",
      roleId: "witch",
      targetSeat: useAntidote ? state.werewolfTarget! : null,
      extra: { useAntidote, usePoison, poisonTarget },
    });

    await this.waitForSubPhaseChange(prevSub);
    globalLog.success("  Witch action done");
  }

  private async doSeerAction() {
    const sc = this.getClientByRole("seer");
    if (!sc) {
      globalLog.info("  No living Seer, skip");
      return;
    }

    const seer = sc.getMyPlayer()!;
    const candidates = this.alivePlayers.filter(
      (p) => p.seatNumber !== seer.seatNumber
    );
    const target = candidates[Math.floor(Math.random() * candidates.length)];

    globalLog.action(
      `  Seer(#${seer.seatNumber}) checks #${target.seatNumber} ${target.nickname}`
    );

    const prevSub = this.judgeState?.nightSubPhase?.currentRole || null;
    sc.send({
      type: "NIGHT_ACTION",
      roleId: "seer",
      targetSeat: target.seatNumber,
      extra: { checkTarget: target.seatNumber },
    });

    // 预言家会收到 NIGHT_ACTION_RESULT 含查验结果
    let faction = "unknown";
    try {
      const result = (await sc.waitFor("NIGHT_ACTION_RESULT", 3000)) as any;
      faction = result.seerResult === "good" ? "GOOD" : "EVIL (WEREWOLF)";
    } catch {
      // 如果没收到 NIGHT_ACTION_RESULT，等待子阶段切换
      await this.waitForSubPhaseChange(prevSub);
      faction = "(result not received)";
    }
    globalLog.success(
      `  Seer result: #${target.seatNumber} ${target.nickname} -> ${faction}`
    );
  }

  private async doGuardAction() {
    const gc = this.getClientByRole("guard");
    if (!gc) {
      globalLog.info("  No living Guard, skip");
      return;
    }

    const guard = gc.getMyPlayer()!;
    const history = guard.guardProtectedHistory || [];
    const candidates = this.alivePlayers.filter(
      (p) => !history.includes(p.seatNumber)
    );

    if (candidates.length === 0) {
      globalLog.info("  Guard has no valid target (all guarded before), skip");
      return;
    }

    const target =
      candidates[Math.floor(Math.random() * candidates.length)].seatNumber;

    globalLog.action(`  Guard(#${guard.seatNumber}) protects #${target}`);

    const prevSub = this.judgeState?.nightSubPhase?.currentRole || null;
    gc.send({
      type: "NIGHT_ACTION",
      roleId: "guard",
      targetSeat: target,
      extra: { protectTarget: target },
    });

    await this.waitForSubPhaseChange(prevSub);
    globalLog.success(`  Guard protects #${target}`);
  }

  private async doMechanicalWolfAction() {
    const mc = this.getClientByRole("mechanical_wolf");
    if (!mc) {
      globalLog.info("  No living MechanicalWolf, skip");
      return;
    }

    const mw = mc.getMyPlayer()!;
    const phase = mw.mechanicalWolfPhase;

    if (phase === "selecting") {
      const evilRoles = [
        "werewolf", "wolf_king", "nightmare_shadow", "hidden_wolf", "mechanical_wolf",
      ];
      const candidates = this.alivePlayers.filter(
        (p) =>
          p.seatNumber !== mw.seatNumber && !evilRoles.includes(p.role)
      );
      if (candidates.length === 0) {
        globalLog.info("  MechanicalWolf has no imitate target, skip");
        return;
      }
      const target =
        candidates[Math.floor(Math.random() * candidates.length)];

      globalLog.action(
        `  MechanicalWolf(#${mw.seatNumber}) picks imitate target: #${target.seatNumber} ${ROLE_NAMES[target.role]}`
      );

      const prevSub = this.judgeState?.nightSubPhase?.currentRole || null;
      mc.send({
        type: "NIGHT_ACTION",
        roleId: "mechanical_wolf",
        targetSeat: target.seatNumber,
        extra: { imitateTarget: target.seatNumber },
      });

      await this.waitForSubPhaseChange(prevSub);
      globalLog.success("  MechanicalWolf imitate target selected");
    } else if (phase === "active") {
      const candidates = this.alivePlayers.filter(
        (p) => p.seatNumber !== mw.seatNumber
      );
      if (candidates.length > 0) {
        const t = candidates[Math.floor(Math.random() * candidates.length)].seatNumber;
        globalLog.action(`  MechanicalWolf(#${mw.seatNumber}) uses skill on #${t}`);

        const prevSub = this.judgeState?.nightSubPhase?.currentRole || null;
        mc.send({
          type: "NIGHT_ACTION",
          roleId: "mechanical_wolf",
          targetSeat: t,
          extra: { imitateSkillTarget: t },
        });

        await this.waitForSubPhaseChange(prevSub);
        globalLog.success("  MechanicalWolf skill used");
      }
    } else if (phase === "learning") {
      globalLog.info(
        `  MechanicalWolf(#${mw.seatNumber}) in learning phase, waiting...`
      );
    } else if (phase === "failed" || phase === "silent") {
      globalLog.info(
        `  MechanicalWolf(#${mw.seatNumber}) in ${phase} phase, cannot act`
      );
    } else {
      globalLog.info(
        `  MechanicalWolf(#${mw.seatNumber}) in phase: ${phase}`
      );
    }
  }

  // ---------- 白天流程 ----------

  async runDayPhase(roundNum: number) {
    globalLog.separator();
    globalLog.phase("DAY", `=== Day ${roundNum} ===`);

    let state = await this.waitForJudgePhase(
      ["DAY_ANNOUNCE", "DAY_SPEECH", "GAME_OVER"],
      10000
    );

    if (state.phase === "GAME_OVER") {
      this.handleGameOver(state);
      return false;
    }

    if (state.phase === "DAY_ANNOUNCE") {
      globalLog.phase(state.phase, "Day announce - report deaths");
      this.printDayAnnounce();
      await this.judgeForceNext();
      state = await this.waitForJudgePhase(
        ["DAY_SPEECH", "SHERIFF_ELECTION", "GAME_OVER"],
        8000
      );
    }

    if (state.phase === "GAME_OVER") {
      this.handleGameOver(state);
      return false;
    }

    if (state.phase === "DAY_SPEECH") {
      globalLog.phase(state.phase, "Speech phase");
      await this.skipAllSpeech();
    }

    state = this.judgeState!;
    if (state.phase === "DAY_VOTE") {
      await this.runVoting();
    }

    state = this.judgeState!;
    if (state.phase === "PK_VOTE") {
      await this.runPKVoting();
    }

    state = this.judgeState!;
    if (state.phase === "GAME_OVER") {
      this.handleGameOver(state);
      return false;
    }

    await this.handleDayInterrupts();

    state = this.judgeState!;
    if (state.phase === "GAME_OVER") {
      this.handleGameOver(state);
      return false;
    }

    return true;
  }

  private async skipAllSpeech() {
    const state = this.judgeState!;
    const order = state.speechOrder;
    globalLog.action(`Speech order: ${order.join(" -> ")}`);

    for (const seat of order) {
      const player = state.players.find((p) => p.seatNumber === seat);
      if (!player || player.status !== "alive" || player.isJudge) continue;

      await this.pauseIfInteractive(`#${seat} ${player.nickname} speaking...`);

      this.judge.send({ type: "JUDGE_SKIP_SPEECH", seatNumber: seat });
      await sleep(300);
    }

    await this.waitForJudgePhase(["DAY_VOTE"], 5000);
    globalLog.phase("DAY_VOTE", "Enter voting phase");
  }

  private async runVoting() {
    globalLog.action("--- Day Voting ---");

    const voters = this.alivePlayers.filter(
      (p) => !p.idiotRevealed && !p.isJudge
    );

    for (const voter of voters) {
      const client = this.getClientBySeat(voter.seatNumber);
      if (!client) continue;

      const candidates = this.alivePlayers.filter(
        (p) => p.seatNumber !== voter.seatNumber && !p.idiotRevealed
      );
      if (candidates.length === 0) {
        client.send({ type: "DAY_VOTE", targetSeat: null });
        globalLog.info(`  #${voter.seatNumber} ${voter.nickname} abstains`);
      } else {
        const target =
          candidates[Math.floor(Math.random() * candidates.length)];
        client.send({
          type: "DAY_VOTE",
          targetSeat: target.seatNumber,
        });
        globalLog.info(
          `  #${voter.seatNumber} ${voter.nickname} -> #${target.seatNumber} ${target.nickname}`
        );
      }
      await sleep(150);
    }

    await sleep(1500);
  }

  private async runPKVoting() {
    globalLog.action("--- PK Voting ---");

    const state = this.judgeState!;
    const pkList = state.pkCandidates || [];
    if (pkList.length === 0) {
      globalLog.warn("  PK candidates list is empty, skip");
      return;
    }
    globalLog.info(`PK candidates: ${pkList.map((s) => "#" + s).join(", ")}`);

    const voters = this.alivePlayers.filter(
      (p) => !p.idiotRevealed && !p.isJudge
    );

    for (const voter of voters) {
      const client = this.getClientBySeat(voter.seatNumber);
      if (!client) continue;

      const target = pkList[Math.floor(Math.random() * pkList.length)];
      client.send({ type: "DAY_VOTE", targetSeat: target });
      globalLog.info(
        `  #${voter.seatNumber} ${voter.nickname}(PK) -> #${target}`
      );
      await sleep(150);
    }

    await sleep(1500);
  }

  private async handleDayInterrupts() {
    const maxWaitSec = 10;
    const start = Date.now();

    while (Date.now() - start < maxWaitSec * 1000) {
      const cs = this.judgeState;
      if (!cs || cs.phase === "GAME_OVER") {
        this.handleGameOver(cs!);
        return;
      }

      if (cs.phase === "DAY_INTERRUPT") {
        globalLog.phase("DAY_INTERRUPT", "Day interrupt detected!");
        this.printDayDeaths();

        const deadHunter = cs.players.find(
          (p) =>
            p.status !== "alive" &&
            p.role === "hunter" &&
            !p.hunterGunFired
        );
        if (deadHunter) {
          await this.triggerHunterGun(deadHunter);
        }

        const deadWK = cs.players.find(
          (p) =>
            p.status !== "alive" &&
            p.role === "wolf_king" &&
            !p.wolfKingGunFired
        );
        if (deadWK) {
          await this.triggerWolfKingGun(deadWK);
        }

        await this.judgeForceNext();
        await sleep(1000);
      } else if (
        cs.phase === "DAY_SETTLEMENT" ||
        cs.phase === "NIGHT" ||
        cs.phase === "PRE_NIGHT"
      ) {
        break;
      } else {
        await sleep(500);
      }
    }
  }

  private async triggerHunterGun(hunter: Player) {
    const client = this.getClientBySeat(hunter.seatNumber);
    if (!client) return;

    const candidates = this.alivePlayers;
    if (candidates.length === 0) return;

    const target =
      candidates[Math.floor(Math.random() * candidates.length)];
    globalLog.action(
      `  Hunter(#${hunter.seatNumber}) shoots -> #${target.seatNumber} ${target.nickname}`
    );

    client.send({ type: "HUNTER_GUN", targetSeat: target.seatNumber });
    await client.waitFor("HUNTER_GUN_RESULT", 5000);
    globalLog.success("  Hunter gun fired");
  }

  private async triggerWolfKingGun(wk: Player) {
    const client = this.getClientBySeat(wk.seatNumber);
    if (!client) return;

    const candidates = this.alivePlayers;
    if (candidates.length === 0) return;

    const target =
      candidates[Math.floor(Math.random() * candidates.length)];
    globalLog.action(
      `  WolfKing(#${wk.seatNumber}) shoots -> #${target.seatNumber} ${target.nickname}`
    );

    client.send({ type: "WOLF_KING_GUN", targetSeat: target.seatNumber });
    await client.waitFor("WOLF_KING_GUN_RESULT", 5000);
    globalLog.success("  WolfKing gun fired");
  }

  // ---------- 法官辅助方法 ----------

  async judgeForceNext() {
    await this.pauseIfInteractive("Judge force next phase");
    this.judge.send({ type: "JUDGE_FORCE_NEXT_PHASE" });
    globalLog.judge("Force next phase");
    await sleep(500);
  }

  async waitForJudgePhase(
    phases: GamePhase[],
    timeoutMs = 10000
  ): Promise<RoomState> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const state = this.judgeState;
      if (state && phases.includes(state.phase)) {
        return state;
      }
      await sleep(200);
    }
    const cur = this.judgeState;
    throw new Error(
      `waitForPhase(${phases.join("/")}) timeout, current: ${cur?.phase || "?"}`
    );
  }

  // ---------- 信息打印 ----------

  private printRoleAssignment() {
    const state = this.judgeState;
    if (!state) return;

    globalLog.separator();
    globalLog.judge("Role Assignment (Judge view):");
    console.log("");

    const sorted = [...state.players]
      .filter((p) => !p.isJudge)
      .sort((a, b) => a.seatNumber - b.seatNumber);

    const evilRoles = [
      "werewolf", "wolf_king", "nightmare_shadow", "hidden_wolf", "mechanical_wolf", "white_wolf_king",
    ];

    for (const p of sorted) {
      const isEvil = evilRoles.includes(p.role);
      const icon = isEvil ? "[W]" : "[G]";
      const colorCode = isEvil ? C.R : C.G;
      console.log(
        `  ${c(icon, colorCode)} #${String(p.seatNumber).padStart(2)} ${p.nickname.padEnd(4)} -> ${c(ROLE_NAMES[p.role], C.b, colorCode)}`
      );
    }

    console.log("");
    globalLog.flush();
  }

  private printNightDeaths() {
    const state = this.judgeState;
    if (!state) return;

    const deaths = state.nightDeaths;
    if (deaths && deaths.length > 0) {
      const parts = deaths.map(
        (d: any) => `#${d.seatNumber}[${d.cause}]${d.saved ? "(saved)" : ""}`
      );
      globalLog.result(`Night deaths: ${parts.join(", ")}`);
    } else {
      globalLog.result("Peaceful night - no deaths");
    }
  }

  private printDayAnnounce() {
    const state = this.judgeState;
    if (!state) return;

    const deaths = (state.nightDeaths || []).filter((d: any) => !d.saved) as any[];
    if (deaths.length > 0) {
      for (const d of deaths) {
        const player = state.players.find(
          (p) => p.seatNumber === d.seatNumber
        );
        globalLog.result(
          `X Last night #${d.seatNumber} ${player?.nickname || "?"} died [${d.cause}]`
        );
      }
    } else {
      globalLog.result("Sunrise - peaceful night, nobody died");
    }
  }

  private printDayDeaths() {
    const state = this.judgeState;
    if (!state) return;

    const deaths = state.dayDeaths;
    if (deaths && deaths.length > 0) {
      for (const d of deaths as any[]) {
        const player = state.players.find(
          (p) => p.seatNumber === d.seatNumber
        );
        globalLog.result(
          `X #${d.seatNumber} ${player?.nickname || "?"} [${d.cause}] ${
            d.triggersBy ? `(triggered by #${d.triggersBy})` : ""
          }`
        );
      }
    }
  }

  private handleGameOver(state: RoomState) {
    globalLog.gameover(state.winner!);
    this.printFinalState(state);
  }

  private printFinalState(state: RoomState) {
    globalLog.separator();
    globalLog.judge("Final State:");
    console.log("");

    const sorted = [...state.players]
      .filter((p) => !p.isJudge)
      .sort((a, b) => a.seatNumber - b.seatNumber);

    const evilRoles = [
      "werewolf", "wolf_king", "nightmare_shadow", "hidden_wolf", "mechanical_wolf", "white_wolf_king",
    ];

    for (const p of sorted) {
      const icon = p.status === "alive" ? "[OK]" : "[XX]";
      const fColor = evilRoles.includes(p.role) ? C.R : C.G;
      const sColor = p.status === "alive" ? C.G : C.R;
      console.log(
        `  ${icon} #${String(p.seatNumber).padStart(2)} ${p.nickname.padEnd(4)} ${c(ROLE_NAMES[p.role], fColor)} - ${c(p.status, sColor)} ${
          p.deathCause ? `[${p.deathCause}]` : ""
        }`
      );
    }

    console.log("");
    globalLog.separator();

    const aliveGood = sorted.filter(
      (p) => p.status === "alive" && !evilRoles.includes(p.role)
    ).length;
    const aliveEvil = sorted.filter(
      (p) => p.status === "alive" && evilRoles.includes(p.role)
    ).length;
    globalLog.result(
      `Final stats: alive_good=${aliveGood}, alive_evil=${aliveEvil}, total_rounds=${state.round}`
    );
    globalLog.flush();
  }

  // ---------- 主循环 ----------

  async runFullGame() {
    try {
      await this.init();
      await this.createRoom();
      await this.joinPlayers();
      await this.startGame();

      const MAX_ROUNDS = 30;
      for (let r = 1; r <= MAX_ROUNDS; r++) {
        this.round = r;

        await this.runNightActions(r);

        const afterNight = this.judgeState;
        if (afterNight?.phase === "GAME_OVER") {
          this.handleGameOver(afterNight);
          break;
        }

        const cont = await this.runDayPhase(r);
        if (!cont) break;

        globalLog.stateSummary(this.judgeState!, `Round ${r} end`);
      }

      globalLog.separator();
      globalLog.success("Game simulation complete!");
    } catch (err) {
      globalLog.error(`Runtime error: ${(err as Error).message}`);
      globalLog.error(`Stack: ${(err as Error).stack}`);
    } finally {
      this.cleanup();
    }
  }

  cleanup() {
    globalLog.info("Cleaning up connections...");
    for (const client of this.allClients) {
      client.disconnect();
    }
    globalLog.flush();
  }

  private async pauseIfInteractive(hint: string) {
    if (MODE === "interactive") {
      globalLog.info(c(`[PAUSED] ${hint} - Press Enter to continue...`, C.b, C.Y));
      await waitForKeyPress();
    }
  }
}

// ========== 工具函数 ==========

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForKeyPress(): Promise<void> {
  return new Promise((resolve) => {
    const rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

// ========== 入口 ==========

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  globalLog.setLogFile(
    join(process.cwd(), "tests", "logs", `game-sim-${timestamp}.log`)
  );

  const sim = new GameSimulator();
  await sim.runFullGame();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
