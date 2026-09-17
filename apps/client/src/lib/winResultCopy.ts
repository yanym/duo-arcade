import type { GameResult, Seat } from "@duo/game-core";

type WinResult = Extract<GameResult, { kind: "win" }>;
type SuccessResult = Extract<GameResult, { kind: "success" }>;

const successTitles: Record<SuccessResult["reason"], string> = {
  ember_crew_complete: "全部居民已安全撤离！",
  exit_reached: "成功逃出迷宫！",
  rounds_complete: "同频挑战完成！",
  defuse_complete: "星舰恢复稳定！",
  escort_complete: "护航任务完成！",
  relay_repaired: "深空中继站恢复运行！",
  echo_relay_complete: "星语信号完整同步！",
  core_rally_complete: "星核接力完成！",
  skyline_rescue_complete: "云塔热源全部稳定！",
  dual_thrusters_complete: "穿梭任务完成！",
  fog_sonar_complete: "雾海航线全部打通！",
  storm_grid_complete: "风暴电网恢复稳定！",
  star_trace_complete: "隐藏星图全部绘成！",
  magnet_haul_complete: "能量货箱全部送达！",
  lumen_bridge_complete: "整座光桥已经贯通！",
  prism_heist_complete: "光栅潜入任务完成！",
  drop_rescue_complete: "坠星救援航线完成！",
};

export function successResultCopy(result: SuccessResult): { title: string; detail: string } {
  return {
    title: successTitles[result.reason],
    detail: result.reason === "rounds_complete"
      ? `双方平均同步误差：${result.score}ms`
      : `你们的合作得分：${result.score}`,
  };
}

export function winResultCopy(result: WinResult, ownSeat: Seat): { title: string; detail: string } {
  const won = result.winnerSeat === ownSeat;
  const winner = won ? "你" : "对方";
  const details: Record<WinResult["reason"], string> = {
    five_in_a_row: `${winner}率先连成五子`,
    disc_majority: `${winner}在终局拥有更多棋子`,
    cover_hunt_score: `${winner}在攻防中取得更多分数`,
    quantum_duel_score: `${winner}的回合总分更高`,
    rhythm_gravity_score: `${winner}最终将能量核拉得更近`,
    shadow_shuttle_score: `${winner}在多轮追踪中取得更多分数`,
    meteor_dash_score: `${winner}的捕捉总分更高`,
    trajectory_intercept_score: `${winner}的截获总分更高`,
    neon_dash_score: `${winner}在积分或剩余护盾上领先`,
    signal_bluff_score: `${winner}的谍报总分更高`,
    nova_volley_score: `${winner}在对攻中取得更多分数`,
    pulse_pass_score: `${winner}在传核对决中取得更多分数`,
    timeout: won ? "对方回合超时" : "你的回合超时",
    resigned: won ? "对方选择认输" : "你选择了认输",
    opponent_left: won ? "对方未能及时重连" : "你未能及时重连",
  };
  return { title: won ? "你赢了！" : "对方获胜", detail: details[result.reason] };
}
