import { describe, expect, it } from "vitest";

import { GAME_IDS, createGameState, getGameRoleLabel, type GameResult, type Seat } from "@duo/game-core";
import { GAMES } from "@/lib/games";
import { successResultCopy, winResultCopy } from "@/lib/winResultCopy";

import { translate } from ".";

const HAS_HAN = /[一-龥]/;

describe("English localization", () => {
  it("covers the complete 28-game discovery and tutorial catalog", () => {
    expect(GAMES).toHaveLength(28);
    for (const game of GAMES) {
      const visibleCopy = [
        game.title,
        game.description,
        game.meta,
        game.mode,
        game.rules,
        ...game.tutorialSteps,
        game.proTip,
      ];
      for (const copy of visibleCopy) {
        expect(translate(copy, "en"), `${game.id}: ${copy}`).not.toMatch(HAS_HAN);
      }
    }
  });

  it("covers every initial in-game role label", () => {
    for (const [index, gameId] of GAME_IDS.entries()) {
      const state = createGameState(gameId, 0, 1_000, index + 1);
      for (const seat of [0, 1] as const) {
        const role = getGameRoleLabel(state, seat);
        expect(translate(role, "en"), `${gameId} seat ${seat}: ${role}`).not.toMatch(HAS_HAN);
      }
    }
  });

  it("keeps Chinese unchanged and formats dynamic room copy", () => {
    expect(translate("五子棋", "zh")).toBe("五子棋");
    expect(translate("第 3 局进行中", "en")).toBe("Round 3 in progress");
    expect(translate("与 AI 开始五子棋", "en")).toBe("Play Gomoku with AI");
    expect(translate("7 轮 · 6 枚信标 · 1.6 秒随机预备 · 1800ms 捕捉窗口", "en")).not.toMatch(HAS_HAN);
  });

  it("keeps generated status, accessibility, and telemetry copy fully English", () => {
    const generatedCopy = [
      "Alex暂时掉线，对局已暂停",
      "Alex已加入房间",
      "Alex已重新连接",
      "Alex暂时离线，对局已暂停",
      "连接中断，操作已暂停，正在重连",
      "连接已恢复，进度已经同步",
      "来 Duo Arcade 和我玩五子棋！房间码 ABC123",
      "请口述前往第 2 号星点的方向和格数",
      "6 乘 6 星域；光笔位于第 3 行第 4 列；已连接 2 个星点",
      "热源位于中层平台",
      "着陆台 2 · 侧风 向右 1 · 入场 5 / 安全 3",
      "向上移动",
      "当前障碍：高架扫描门",
      "服务器窗口剩余 12 秒 · 本轮结束后交换岗位",
      "能量：中层航道",
      "信标 3，流星目标，你的选择",
      "第 2 个符号：三角",
      "第 4 行第 5 列，空位",
      "惯性向较大编号 2 格",
      "当前第 2 轮，共 5 轮；你 1 分，对手 2 分",
      "掩体 2，晶岩",
      "侦察阶段剩余 8 秒 · 只有侦察员收到安全航道",
      "目标位于轨道 2，你的追踪器位于轨道 3",
      "左侧磁臂移动到高度轨 3",
      "来球 2 号轨道 · 1.5 秒后进入击球窗",
      "第 2 行第 3 列，浓雾未知区域",
      "已完成 4 次，共需 6 次",
      "光桥发射台在高度轨 2，弧度 +1，当前落点 3，目标 4",
      "外环目标刻度 3",
      "第 2 枚，余烬，低音短促",
      "能量核向对手靠近 2 格",
      "第 4 行第 5 列，黑子，最近落子，可以落子",
      "公开电荷 5，可能在 7 到 10 之间爆裂",
      "当前选择节点 2，正极 +",
      "星核正飞向你，目标为第 2 轨道；你的挡板在第 3 轨道",
      "最终目标为第 2 轨道；你的挡板在第 3 轨道",
      "外环当前刻度 2，目标刻度 3",
      "中环当前刻度 2",
      "向右移动一步",
      "现在按下同步按钮",
      "按下“三角”",
      "锁定 2 号航道",
      "把护盾分配到 2 号航道",
      "将第 2 环顺时针旋转一格",
      "现在确认发射",
      "按下“余烬”脉冲",
      "向左移动挡板",
      "现在弹射星核",
      "锁定 2 号区域",
      "锁定 3 档水压",
      "锁定 2 档推进",
      "发送向上声呐",
      "向下掌舵",
      "向左切换节点",
      "切换当前节点极性",
      "现在释放稳定脉冲",
      "向右移动一格",
      "向左移动磁臂",
      "提高当前控制值",
      "现在锁定共振",
      "向左移动潜入舱",
      "现在执行光栅旁路",
      "现在驾驶潜入舱冲刺",
      "向右校准着陆航道",
      "降低一级反推",
      "锁定当前控制",
    ];
    for (const copy of generatedCopy) {
      expect(translate(copy, "en"), copy).not.toMatch(HAS_HAN);
    }
  });

  it("translates every dynamic competitive and cooperative result", () => {
    const winReasons: Extract<GameResult, { kind: "win" }>["reason"][] = [
      "five_in_a_row", "disc_majority", "cover_hunt_score", "quantum_duel_score",
      "rhythm_gravity_score", "shadow_shuttle_score", "meteor_dash_score", "trajectory_intercept_score",
      "neon_dash_score", "signal_bluff_score", "nova_volley_score", "pulse_pass_score",
      "timeout", "resigned", "opponent_left",
    ];
    for (const reason of winReasons) {
      for (const ownSeat of [0, 1] as Seat[]) {
        const copy = winResultCopy({ kind: "win", winnerSeat: 0, reason }, ownSeat);
        expect(translate(copy.title, "en"), `${reason} title`).not.toMatch(HAS_HAN);
        expect(translate(copy.detail, "en"), `${reason} detail`).not.toMatch(HAS_HAN);
      }
    }

    const successReasons: Extract<GameResult, { kind: "success" }>["reason"][] = [
      "exit_reached", "rounds_complete", "defuse_complete", "escort_complete", "relay_repaired",
      "echo_relay_complete", "core_rally_complete", "skyline_rescue_complete", "dual_thrusters_complete",
      "fog_sonar_complete", "storm_grid_complete", "star_trace_complete", "magnet_haul_complete",
      "lumen_bridge_complete", "prism_heist_complete", "drop_rescue_complete",
    ];
    for (const reason of successReasons) {
      const copy = successResultCopy({ kind: "success", reason, score: 78 });
      expect(translate(copy.title, "en"), `${reason} title`).not.toMatch(HAS_HAN);
      expect(translate(copy.detail, "en"), `${reason} detail`).not.toMatch(HAS_HAN);
    }

    expect(translate("多轮谍报交锋后比分完全相同", "en")).not.toMatch(HAS_HAN);
  });

  it("translates the legal and recovery experience", () => {
    const copy = [
      "1. 我们处理哪些数据",
      "本机生成的随机玩家标识、你填写的昵称、房间凭证、语言、AI、声音与显示设置、教程完成状态；服务器处理房间与 AI 对局设置、游戏操作、比分、连接状态和故障请求标识。托管服务商还可能按其安全机制处理 IP 地址、设备与网络日志。我们不要求手机号、邮箱、通讯录、精确位置，也不提供自由文本聊天。",
      "Duo Arcade 提供无需注册的好友联机或单人 AI 小游戏、私人房间码、断线恢复和本机偏好。房间码用于便捷邀请，不等同于账户密码；请只分享给你希望加入的人。当前 1.0 版本不包含付费项目。",
      "6. 责任边界与变更",
      "当前版本不提供付费服务。正式商业发行前，运营主体、联系渠道与适用地区会在本页及应用商店页面补全并再次征得同意。",
      "画面保留了最后进度；重新连接后会以服务端状态为准。",
    ];
    for (const value of copy) expect(translate(value, "en"), value).not.toMatch(HAS_HAN);
  });
});
