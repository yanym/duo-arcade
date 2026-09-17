import { isPlayableGameId, type Seat } from "@duo/game-core";
import type { RoomView } from "@duo/protocol";

export function phaseHint(room: Pick<RoomView, "gameId" | "game" | "phase" | "mode" | "rematchVotes">, ownSeat: Seat): string {
  if (!isPlayableGameId(room.gameId) && room.phase === "completed") return "本局结果已保留，请回首页选择其他游戏。";
  if (room.phase === "reconnect_grace") return "等待好友回来；倒计时结束后本局会自动结算";
  if (room.phase === "completed") {
    if (room.mode === "ai") return "查看结果，或立即和 AI 再来一局";
    if (room.rematchVotes.includes(ownSeat)) return "你的重赛意愿已同步，正在等待对方回应";
    if (room.rematchVotes.includes(ownSeat === 0 ? 1 : 0)) return "对方已经同意重赛，现在轮到你决定";
    return "看看结果，或者两人同意再来一局";
  }
  if (room.game.kind === "ember_crew") return "计划对双方可见；补水和灭火先执行，再移动。双方确认后一起行动。";
  if (room.game.kind === "gomoku") return "率先横、竖或斜线连成五子即可获胜";
  if (room.game.kind === "reversi") return "夹住对方棋子来翻面，无棋可下会自动跳过";
  if (room.game.kind === "split_maze") return "你们分别控制纵向与横向，撞墙会计数";
  if (room.game.kind === "sync_tap") return `两人都按下后进入下一轮，共进行 ${room.game.totalRounds} 轮`;
  if (room.game.kind === "starship_defuse") return "答案只发给分析员；每完成一个舱段就交换角色";
  if (room.game.kind === "echo_relay") return "序列只发给译码员；声音都有名称、形状和编号等价线索，每段完成后换岗";
  if (room.game.kind === "core_rally") return "接球方独立控制自己的挡板；对准轨道并在服务器窗口内弹射，每拍自动换边";
  if (room.game.kind === "skyline_rescue") return "引导员只知道热源区域，泵站员只知道所需水压；口头合并情报后各自操作，每波换岗";
  if (room.game.kind === "meteor_dash") return "每轮只有一次选择；双方作答前，对手的坐标和反应时间都保持保密";
  if (room.game.kind === "dual_thrusters") return "左舷推向较大编号、右舷推向较小编号；档位与当前惯性相加，双方选择在结算前保密";
  if (room.game.kind === "fog_sonar") return "暗礁只向声呐领航员显示；舵手可接收公开方向脉冲，每片雾区完成后双方交换岗位";
  if (room.game.kind === "storm_grid") return "目标节点与极性只向观测员显示；调度员负责路由，观测员在服务器放电窗口内触发，每波交换岗位";
  if (room.game.kind === "trajectory_intercept") return "目标轨道会同时公开；双方只能看到自己的追踪器，位置与反应时间在本轮结算前保密，40ms 内判同轮平手";
  if (room.game.kind === "star_trace") return "星点路径只向引导员显示；操笔员看见自己的光笔和已走轨迹，每移动一格都会消耗星墨，完成一图后交换岗位";
  if (room.game.kind === "magnet_haul") return "两侧位置与目标公开；每人只能移动自己的磁臂，张力达到上限时必须让落后的一侧先跟上，每步消耗公共电量";
  if (room.game.kind === "lumen_bridge") return "一人控制发射台高度，另一人控制光束弧度；命中目标后两人必须在短暂服务器共振窗内各锁定一次，每个节点交换岗位";
  if (room.game.kind === "neon_dash") return "低墙跳跃、高架滑行、右墙左闪、左墙右闪、脉冲场急停；正确优先，同为正确时反应差 40ms 内按同拍结算";
  if (room.game.kind === "signal_bluff") return "真相只向发报员显示，扫描分组只向审查员显示；相信真话或质疑谎报都能得分，每轮自动换岗";
  if (room.game.kind === "prism_heist") return "安全航道只向侦察员显示；驾驶员先换道，窗口开启后两人分别旁路和冲刺，每段交换岗位";
  if (room.game.kind === "nova_volley") return "只有接球方能移动挡板；对准公开来球后，在服务器击球窗内选择回球轨道。连拍逐步加速，错位或超时直接失分";
  if (room.game.kind === "pulse_pass") return "精确爆点对双方保密；持有者选择充能档位后立刻传出，达到阈值或持有超时都会让对手得分。冷却次数贯穿整局";
  if (room.game.kind === "drop_rescue") return "航道与侧风只向领航员显示，速度与安全值只向制动员显示；两项控制分别锁定后由服务器结算，每个救援点交换岗位";
  if (room.game.kind === "quantum_duel") return "突击克蓄能、蓄能克防御、防御克突击；双方选择互相保密";
  if (room.game.kind === "starway_escort") return "驾驶员和护盾员各自只看一半情报，每航段交换角色";
  if (room.game.kind === "orbital_repair") return "目标刻度只发给发射员；工程师完成旋转后由发射员确认发射";
  if (room.game.kind === "rhythm_gravity") return "每轮只按一次；对方击拍的具体时机要到双方完成后才会公开";
  if (room.game.kind === "shadow_shuttle") return "记忆阶段后所有舱体会隐藏标记；换位由服务器逐步驱动并在两端同步";
  return "藏身点只会发送给潜行者；猎手的扫描结果也保持私密";
}
