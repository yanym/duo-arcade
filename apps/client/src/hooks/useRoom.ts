import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import type { DefuseSymbol, DuelMove, EchoTone, EscortLane, GameAction, MazeDirection, NeonDashMove, OrbitDirection, OrbitRing, PulsePower, RescuePressure, RescueZone, SignalRune, SignalVerdict, ThrusterPower } from "@duo/game-core";
import { PROTOCOL_VERSION, type ClientMessage, type ReactionId, type RoomSessionResponse, type RoomView, type ServerMessage } from "@duo/protocol";

import { ApiError, getRoom, getServiceHealth, joinRoom, roomSocketUrl } from "@/lib/api";
import { createAsyncScope } from "@/lib/asyncScope";
import { roomControlConfirmed, type PendingRoomControl } from "@/lib/roomControl";
import {
  getIdentity,
  createClientId,
  getRoomSession,
  removeRoomSession,
  saveIdentity,
  saveRoomSession,
  type Identity,
  type StoredSession
} from "@/lib/session";

export type ConnectionStatus = "loading" | "preview" | "connecting" | "connected" | "reconnecting" | "error";
export type ActionSyncStatus = "idle" | "sending" | "slow" | "confirmed";

const rejectionMessages: Record<string, string> = {
  game_finished: "本局已经结束，请查看结果或再来一局",
  not_your_turn: "还没轮到你",
  invalid_position: "这个位置不在棋盘范围内",
  cell_occupied: "这里已经有棋子了",
  stale_version: "游戏刚刚更新，正在同步最新进度",
  game_not_playing: "对局尚未开始",
  turn_expired: "本回合已经超时",
  illegal_move: "这个位置不能翻转棋子",
  wrong_control: "这个方向由你的搭档控制",
  already_tapped: "这一轮你已经按过了",
  already_chosen: "本轮招式已经锁定",
  too_early: "还没到出发时刻，再等等",
  wrong_game_action: "这个操作不属于当前游戏",
  wrong_phase: "当前阶段不能进行这个操作",
  wrong_role: "这一步由另一位玩家完成",
  no_scans_left: "本轮扫描次数已经用完",
  cover_out_of_range: "这个掩体不存在",
  invalid_move: "这个招式不存在",
  invalid_lane: "这个航道不存在",
  invalid_ring: "这个轨道环不存在",
  invalid_pod: "这个逃逸舱不存在",
  paddle_edge: "挡板已经到达最外侧轨道",
  tracker_edge: "追踪器已经到达最外侧轨道",
  tension_limit: "两侧磁臂距离过大，先让搭档跟上",
  invalid_pressure: "这个水压档位不存在",
  invalid_symbol: "这个符号不在本轮选项中",
  invalid_cell: "这个信标不存在",
  invalid_power: "这个推进器档位不存在",
  no_pulses_left: "本片雾区的声呐脉冲已经用完",
  no_vents_left: "你的整局紧急冷却次数已经用完",
  pod_edge: "救援舱已经到达最外侧航道",
  brake_limit: "反推档位已经到达调节上限",
  no_propellant: "侧推燃料已经耗尽",
  insufficient_water: "剩余水量不足以使用这个档位",
  room_not_ready: "房间状态刚刚改变，请按最新画面继续",
  game_not_completed: "本局还没有结束，暂时不能发起再战",
};

const socketErrorMessages: Record<string, string> = {
  invalid_message: "收到了一条无法识别的房间消息，请重试。",
  invalid_json: "房间消息格式异常，正在等待下一次同步。",
  seat_mismatch: "这台设备的房间凭证已经失效，请重新加入。",
};

const SOCKET_HANDSHAKE_TIMEOUT_MS = 8_000;
const ACTION_ACK_TIMEOUT_MS = 8_000;

export function useRoom(code: string) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [actionSyncStatus, setActionSyncStatus] = useState<ActionSyncStatus>("idle");
  const [controlPending, setControlPending] = useState<PendingRoomControl["kind"] | null>(null);
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [reaction, setReaction] = useState<{ fromSeat: 0 | 1; id: ReactionId } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const synchronizedRef = useRef(false);
  const lifecycleRef = useRef(createAsyncScope());
  const connectionScopeRef = useRef(createAsyncScope());
  const resumeRequestsRef = useRef(new Map<string, Promise<RoomSessionResponse>>());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const joiningRef = useRef(false);
  const shouldReconnectRef = useRef(true);
  const connectRef = useRef<(session: StoredSession, identity: Identity) => void>(() => undefined);
  const pendingActionRef = useRef<{ id: string } | null>(null);
  const awaitingSnapshotRef = useRef(false);
  const pendingControlRef = useRef<PendingRoomControl | null>(null);
  const reactionCooldownRef = useRef(false);
  const controlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionSlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionConfirmedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionDisplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearActionTimers = useCallback(() => {
    if (actionSlowTimerRef.current) clearTimeout(actionSlowTimerRef.current);
    if (actionRecoveryTimerRef.current) clearTimeout(actionRecoveryTimerRef.current);
    if (actionConfirmedTimerRef.current) clearTimeout(actionConfirmedTimerRef.current);
    actionSlowTimerRef.current = null;
    actionRecoveryTimerRef.current = null;
    actionConfirmedTimerRef.current = null;
  }, []);

  const finishAction = useCallback((confirmed: boolean) => {
    clearActionTimers();
    pendingActionRef.current = null;
    awaitingSnapshotRef.current = false;
    setActionSyncStatus(confirmed ? "confirmed" : "idle");
    if (confirmed) {
      actionConfirmedTimerRef.current = setTimeout(() => setActionSyncStatus("idle"), 700);
    }
  }, [clearActionTimers]);

  const finishControl = useCallback(() => {
    if (controlTimerRef.current) clearTimeout(controlTimerRef.current);
    controlTimerRef.current = null;
    pendingControlRef.current = null;
    setControlPending(null);
  }, []);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && (synchronizedRef.current || message.type === "request_snapshot")) {
      socket.send(JSON.stringify(message));
      return true;
    }
    setNotice("连接尚未恢复，请稍等");
    return false;
  }, []);

  const connect = useCallback(
    (activeSession: StoredSession, activeIdentity: Identity) => {
      if (!shouldReconnectRef.current) return;
      finishAction(false);
      finishControl();
      const isCurrentLifecycle = lifecycleRef.current.capture();
      connectionScopeRef.current.invalidate();
      const isCurrentAttempt = connectionScopeRef.current.capture();
      const previousSocket = socketRef.current;
      socketRef.current = null;
      synchronizedRef.current = false;
      previousSocket?.close(1000, "replaced");
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      setStatus(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");
      const socket = new WebSocket(roomSocketUrl(code), [`duo-v${PROTOCOL_VERSION}`, `seat.${activeSession.seatToken}`]);
      socketRef.current = socket;
      const isCurrentSocket = () => isCurrentLifecycle() && isCurrentAttempt() && socketRef.current === socket;
      let opened = false;
      let receivedSnapshot = false;
      const handshakeTimer = setTimeout(() => {
        if (!isCurrentSocket()) return;
        if (!receivedSnapshot && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
          setNotice("同步用时较长，正在重新连接");
          socket.close(4000, "handshake_timeout");
        }
      }, SOCKET_HANDSHAKE_TIMEOUT_MS);

      socket.onopen = () => {
        if (!isCurrentSocket()) return;
        opened = true;
      };
      socket.onmessage = (event) => {
        if (!isCurrentSocket()) return;
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage;
          if (message.type === "state_snapshot") {
            const completesRequestedResync = awaitingSnapshotRef.current;
            if (!receivedSnapshot) {
              receivedSnapshot = true;
              synchronizedRef.current = true;
              clearTimeout(handshakeTimer);
              reconnectAttemptRef.current = 0;
              setStatus("connected");
              setErrorCode(null);
              setNotice(null);
            }
            setRoom(message.room);
            if (pendingControlRef.current && roomControlConfirmed(pendingControlRef.current, message.room)) finishControl();
            if (completesRequestedResync) {
              setNotice(null);
              finishAction(true);
            }
          } else if (message.type === "action_acknowledged") {
            if (pendingActionRef.current?.id === message.actionId) finishAction(true);
          } else if (message.type === "action_rejected") {
            if (!message.actionId) finishControl();
            if (!message.actionId || pendingActionRef.current?.id === message.actionId) finishAction(false);
            setNotice(rejectionMessages[message.reason] ?? "这个操作现在无法完成");
            if (message.reason === "stale_version") {
              awaitingSnapshotRef.current = true;
              setActionSyncStatus("sending");
              actionSlowTimerRef.current = setTimeout(() => setActionSyncStatus("slow"), 650);
              actionRecoveryTimerRef.current = setTimeout(() => {
                if (!awaitingSnapshotRef.current) return;
                setNotice("最新进度同步较慢，正在重新连接房间");
                socketRef.current?.close(4001, "snapshot_refresh_timeout");
              }, ACTION_ACK_TIMEOUT_MS);
              if (!send({ type: "request_snapshot" })) finishAction(false);
            }
          } else if (message.type === "reaction") {
            if (reactionDisplayTimerRef.current) clearTimeout(reactionDisplayTimerRef.current);
            setReaction({ fromSeat: message.fromSeat, id: message.reactionId });
            reactionDisplayTimerRef.current = setTimeout(() => {
              setReaction(null);
              reactionDisplayTimerRef.current = null;
            }, 1600);
          } else if (message.type === "error") {
            finishAction(false);
            finishControl();
            setNotice(socketErrorMessages[message.code] ?? "房间服务暂时无法处理这个请求，请重试。");
          }
        } catch {
          setNotice("收到了一条无法识别的房间消息");
        }
      };
      socket.onerror = () => {
        if (!isCurrentSocket()) return;
        setNotice("实时连接出现问题，正在重试");
      };
      socket.onclose = () => {
        clearTimeout(handshakeTimer);
        if (!isCurrentSocket()) return;
        socketRef.current = null;
        synchronizedRef.current = false;
        finishControl();
        const canRecover = () => isCurrentLifecycle() && isCurrentAttempt() && shouldReconnectRef.current && socketRef.current === null;
        if (!shouldReconnectRef.current) {
          return;
        }
        if (AppState.currentState !== "active") {
          finishAction(false);
          setStatus("reconnecting");
          setNotice("连接已暂停；回到应用后会自动恢复");
          return;
        }
        const scheduleReconnect = () => {
          if (!canRecover()) return;
          reconnectAttemptRef.current += 1;
          finishAction(false);
          if (reconnectAttemptRef.current >= 9) {
            shouldReconnectRef.current = false;
            setErrorCode("connection_lost");
            setNotice("一直没能恢复实时连接。当前进度仍保留在房间里，你可以重新连接。");
            setStatus("error");
            return;
          }
          setStatus("reconnecting");
          const delay = Math.min(8_000, 500 * 2 ** reconnectAttemptRef.current) + Math.floor(Math.random() * 250);
          reconnectTimerRef.current = setTimeout(() => {
            if (canRecover()) connectRef.current(activeSession, activeIdentity);
          }, delay);
        };

        if (!opened && reconnectAttemptRef.current === 0) {
          setStatus("reconnecting");
          void (async () => {
            const resumeKey = `${code}:${activeSession.seatToken}`;
            let request = resumeRequestsRef.current.get(resumeKey);
            try {
              await getServiceHealth();
              if (!canRecover()) return;
              if (!request) {
                request = joinRoom(code, activeIdentity, activeSession).then(async (response) => {
                  // Rotation consumes the old token. Persist the replacement
                  // even if navigation overtakes this request.
                  await saveRoomSession(code, {
                    playerId: response.playerId,
                    seat: response.seat,
                    seatToken: response.seatToken,
                  });
                  return response;
                });
                resumeRequestsRef.current.set(resumeKey, request);
              }
              const response = await request;
              const refreshedSession = {
                playerId: response.playerId,
                seat: response.seat,
                seatToken: response.seatToken,
              } satisfies StoredSession;
              if (!canRecover()) return;
              reconnectAttemptRef.current = 1;
              setSession(refreshedSession);
              setRoom(response.room);
              connectRef.current(refreshedSession, activeIdentity);
            } catch (error) {
              if (!canRecover()) return;
              if (error instanceof ApiError && error.code === "protocol_mismatch") {
                shouldReconnectRef.current = false;
                setErrorCode(error.code);
                setNotice(error.message);
                setStatus("error");
                return;
              }
              if (error instanceof ApiError && (error.code === "invalid_resume_token" || error.code === "room_not_found")) {
                await removeRoomSession(code);
                if (!canRecover()) return;
                shouldReconnectRef.current = false;
                setSession(null);
                setRoom(null);
                setErrorCode(error.code);
                setNotice(error.message);
                setStatus("error");
                return;
              }
              scheduleReconnect();
            } finally {
              if (resumeRequestsRef.current.get(resumeKey) === request) resumeRequestsRef.current.delete(resumeKey);
            }
          })();
          return;
        }
        scheduleReconnect();
      };
    },
    [code, finishAction, finishControl, send]
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!session) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        // iOS can suspend a live transport without delivering a timely close
        // event. Close it explicitly so the room immediately reflects that this
        // player stepped away, then reconnect from the authoritative snapshot
        // when the app becomes active again. Web tabs keep their socket because
        // background tabs remain usable and browsers throttle visibility events.
        if (Platform.OS !== "web") {
          const socket = socketRef.current;
          if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
            socket.close(4001, "app_inactive");
          }
        }
        return;
      }
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        send({ type: "request_snapshot" });
        return;
      }
      if (socket?.readyState === WebSocket.CONNECTING || !shouldReconnectRef.current) return;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (identity) connectRef.current(session, identity);
    });
    return () => subscription.remove();
  }, [identity, send, session]);

  useEffect(() => {
    if (!code) {
      shouldReconnectRef.current = false;
      return;
    }
    shouldReconnectRef.current = true;
    const lifecycle = lifecycleRef.current;
    const isCurrent = lifecycle.capture();
    void (async () => {
      try {
        const [storedIdentity, storedSession] = await Promise.all([getIdentity(), getRoomSession(code)]);
        if (!isCurrent()) return;
        setReactionCooldown(false);
        setIdentity(storedIdentity);
        if (storedSession) {
          setSession(storedSession);
          connect(storedSession, storedIdentity);
        } else {
          const preview = await getRoom(code);
          if (!isCurrent()) return;
          setRoom(preview);
          setStatus("preview");
        }
      } catch (error) {
        if (!isCurrent()) return;
        setNotice(error instanceof ApiError ? error.message : "暂时无法打开房间，请返回后重试。");
        setErrorCode(error instanceof ApiError ? error.code : "unknown_error");
        setStatus("error");
      }
    })();

    return () => {
      lifecycle.invalidate();
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      clearActionTimers();
      if (controlTimerRef.current) clearTimeout(controlTimerRef.current);
      pendingControlRef.current = null;
      if (reactionCooldownTimerRef.current) clearTimeout(reactionCooldownTimerRef.current);
      reactionCooldownTimerRef.current = null;
      reactionCooldownRef.current = false;
      if (reactionDisplayTimerRef.current) clearTimeout(reactionDisplayTimerRef.current);
      reactionDisplayTimerRef.current = null;
      const socket = socketRef.current;
      socketRef.current = null;
      synchronizedRef.current = false;
      socket?.close(1000, "screen_closed");
    };
  }, [clearActionTimers, code, connect, retryNonce]);

  const join = useCallback(
    async (nickname: string) => {
      if (!identity || joiningRef.current) return;
      const isCurrent = lifecycleRef.current.capture();
      joiningRef.current = true;
      setStatus("loading");
      setErrorCode(null);
      setNotice(null);
      try {
        const nextIdentity = { ...identity, nickname: nickname.trim() };
        const previous = await getRoomSession(code);
        if (!isCurrent()) return;
        const response = await joinRoom(code, nextIdentity, previous);
        // Preserve the granted seat even when navigation overtakes the request.
        const nextSession = {
          playerId: response.playerId,
          seat: response.seat,
          seatToken: response.seatToken
        } satisfies StoredSession;
        await Promise.all([saveIdentity(nextIdentity), saveRoomSession(code, nextSession)]);
        if (!isCurrent()) return;
        setIdentity(nextIdentity);
        setSession(nextSession);
        setRoom(response.room);
        connect(nextSession, nextIdentity);
      } catch (error) {
        if (!isCurrent()) return;
        setNotice(error instanceof ApiError ? error.message : "暂时无法加入房间，请重试。");
        setErrorCode(error instanceof ApiError ? error.code : "unknown_error");
        setStatus("preview");
      } finally {
        joiningRef.current = false;
      }
    },
    [code, connect, identity]
  );

  const performAction = useCallback(
    (payload: GameAction) => {
      if (!room) return;
      if (pendingActionRef.current || awaitingSnapshotRef.current) {
        setNotice("上一步正在同步，请稍等一下");
        return;
      }
      const actionId = createClientId();
      const sent = send({
        type: "game_action",
        actionId,
        expectedVersion: room.version,
        payload
      });
      if (!sent) return;
      setNotice(null);
      pendingActionRef.current = { id: actionId };
      clearActionTimers();
      setActionSyncStatus("sending");
      actionSlowTimerRef.current = setTimeout(() => setActionSyncStatus("slow"), 650);
      actionRecoveryTimerRef.current = setTimeout(() => {
        if (pendingActionRef.current?.id !== actionId) return;
        setNotice("这一步确认用时较长，正在重新同步房间进度");
        socketRef.current?.close(4001, "action_ack_timeout");
      }, ACTION_ACK_TIMEOUT_MS);
    },
    [clearActionTimers, room, send]
  );

  const sendReaction = useCallback((reactionId: ReactionId) => {
    if (reactionCooldownRef.current || !send({ type: "reaction", reactionId })) return;
    reactionCooldownRef.current = true;
    setReactionCooldown(true);
    if (reactionCooldownTimerRef.current) clearTimeout(reactionCooldownTimerRef.current);
    reactionCooldownTimerRef.current = setTimeout(() => {
      reactionCooldownRef.current = false;
      reactionCooldownTimerRef.current = null;
      setReactionCooldown(false);
    }, 800);
  }, [send]);

  const sendControl = useCallback((kind: "ready" | "rematch", value: boolean) => {
    if (!room || !session || pendingControlRef.current) return;
    if (!send(kind === "ready" ? { type: "set_ready", ready: value } : { type: "rematch_vote", accept: value })) return;
    pendingControlRef.current = { kind, value, seat: session.seat, round: room.round };
    setControlPending(kind);
    setNotice(null);
    controlTimerRef.current = setTimeout(() => {
      setNotice("确认用时较长，正在重新同步；请稍等");
      socketRef.current?.close(4001, "control_ack_timeout");
    }, ACTION_ACK_TIMEOUT_MS);
  }, [room, send, session]);

  const sendResign = useCallback(() => {
    if (!room || !session || pendingControlRef.current) return;
    if (!send({ type: "resign" })) return;
    pendingControlRef.current = { kind: "resign", seat: session.seat, round: room.round };
    setControlPending("resign");
    setNotice(null);
    controlTimerRef.current = setTimeout(() => {
      setNotice("结束请求确认较慢，正在重新同步；请稍等");
      socketRef.current?.close(4001, "control_ack_timeout");
    }, ACTION_ACK_TIMEOUT_MS);
  }, [room, send, session]);

  return {
    identity,
    session,
    room,
    status,
    notice,
    errorCode,
    actionSyncStatus,
    controlPending,
    actionPending: actionSyncStatus === "sending" || actionSyncStatus === "slow",
    reactionCooldown,
    reaction,
    join,
    retry: () => {
      shouldReconnectRef.current = true;
      reconnectAttemptRef.current = 0;
      finishAction(false);
      finishControl();
      if (reactionCooldownTimerRef.current) clearTimeout(reactionCooldownTimerRef.current);
      reactionCooldownTimerRef.current = null;
      reactionCooldownRef.current = false;
      setReactionCooldown(false);
      setNotice(null);
      setErrorCode(null);
      setStatus(room ? "reconnecting" : "loading");
      setRetryNonce((value) => value + 1);
    },
    setReady: (ready: boolean) => sendControl("ready", ready),
    placeStone: (row: number, col: number) => performAction({ kind: "place_stone", row, col }),
    placeDisc: (row: number, col: number) => performAction({ kind: "place_disc", row, col }),
    moveMaze: (direction: MazeDirection) => performAction({ kind: "maze_move", direction }),
    tapInSync: () => performAction({ kind: "sync_tap" }),
    hideInCover: (cover: number) => performAction({ kind: "cover_hide", cover }),
    scanCover: (cover: number) => performAction({ kind: "cover_scan", cover }),
    shootCover: (cover: number) => performAction({ kind: "cover_shoot", cover }),
    pressDefuseSymbol: (symbol: DefuseSymbol) => performAction({ kind: "defuse_press", symbol }),
    chooseDuelMove: (move: DuelMove) => performAction({ kind: "duel_choose", move }),
    chooseEscortRoute: (lane: EscortLane) => performAction({ kind: "escort_route", lane }),
    chooseEscortShield: (lane: EscortLane) => performAction({ kind: "escort_shield", lane }),
    rotateOrbitRing: (ring: OrbitRing, direction: OrbitDirection) => performAction({ kind: "orbit_rotate", ring, direction }),
    launchRepairPulse: () => performAction({ kind: "orbit_launch" }),
    tapRhythmGravity: () => performAction({ kind: "rhythm_gravity_tap" }),
    markShadowPod: (pod: number) => performAction({ kind: "shadow_mark", pod }),
    guessShadowPod: (slot: number) => performAction({ kind: "shadow_guess", slot }),
    pressEchoTone: (tone: EchoTone) => performAction({ kind: "echo_press", tone }),
    moveCorePaddle: (direction: -1 | 1) => performAction({ kind: "core_move", direction }),
    returnCore: () => performAction({ kind: "core_return" }),
    chooseRescueAim: (zone: RescueZone) => performAction({ kind: "rescue_aim", zone }),
    chooseRescuePressure: (pressure: RescuePressure) => performAction({ kind: "rescue_pressure", pressure }),
    catchMeteor: (cell: number) => performAction({ kind: "meteor_catch", cell }),
    chooseThrusterPower: (power: ThrusterPower) => performAction({ kind: "thruster_burn", power }),
    sendSonarPing: (direction: MazeDirection) => performAction({ kind: "sonar_ping", direction }),
    steerFogVessel: (direction: MazeDirection) => performAction({ kind: "fog_steer", direction }),
    shiftGridSelector: (direction: -1 | 1) => performAction({ kind: "grid_shift", direction }),
    toggleGridPolarity: () => performAction({ kind: "grid_toggle" }),
    dischargeStormGrid: () => performAction({ kind: "grid_discharge" }),
    moveInterceptCursor: (direction: -1 | 1) => performAction({ kind: "intercept_move", direction }),
    captureTrajectory: () => performAction({ kind: "intercept_capture" }),
    moveStarTrace: (direction: MazeDirection) => performAction({ kind: "star_trace_move", direction }),
    moveMagnetArm: (direction: -1 | 1) => performAction({ kind: "magnet_move", direction }),
    adjustLumenBridge: (direction: -1 | 1) => performAction({ kind: "bridge_adjust", direction }),
    lockLumenBridge: () => performAction({ kind: "bridge_lock" }),
    dodgeNeonObstacle: (move: NeonDashMove) => performAction({ kind: "neon_dodge", move }),
    claimSignal: (signal: SignalRune) => performAction({ kind: "signal_claim", signal }),
    scanSignal: () => performAction({ kind: "signal_scan" }),
    judgeSignal: (verdict: SignalVerdict) => performAction({ kind: "signal_judge", verdict }),
    moveHeistRunner: (direction: -1 | 1) => performAction({ kind: "heist_move", direction }),
    bypassHeistGrid: () => performAction({ kind: "heist_bypass" }),
    dashThroughHeist: () => performAction({ kind: "heist_dash" }),
    moveNovaPaddle: (direction: -1 | 1) => performAction({ kind: "volley_move", direction }),
    strikeNovaBall: (lane: number) => performAction({ kind: "volley_strike", lane }),
    chargePulseCore: (power: PulsePower) => performAction({ kind: "pulse_charge", power }),
    ventPulseCore: () => performAction({ kind: "pulse_vent" }),
    moveDropPod: (direction: -1 | 1) => performAction({ kind: "drop_move", direction }),
    adjustDropBrake: (direction: -1 | 1) => performAction({ kind: "drop_brake", direction }),
    lockDropControl: () => performAction({ kind: "drop_lock" }),
    resign: sendResign,
    voteRematch: (accept: boolean) => sendControl("rematch", accept),
    sendReaction
  };
}
