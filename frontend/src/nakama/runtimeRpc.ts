import type { Session, Socket } from "@heroiclabs/nakama-js";
import { getClient } from "./client";

export type RpcJsonResult = { payload?: object };

/**
 * Call a registered runtime RPC. When a realtime socket is connected, use WebSocket RPC so the
 * RPC id is always set in the envelope (avoids rare HTTP/proxy cases where `/v2/rpc/{id}` loses `id`).
 */
export async function callRuntimeRpc(
  sock: Socket | null,
  session: Session,
  id: string,
  input: object,
): Promise<RpcJsonResult> {
  const body = JSON.stringify(input);
  if (sock) {
    const apiRpc = await sock.rpc(id, body);
    const raw = apiRpc?.payload;
    if (!raw) return {};
    try {
      return { payload: JSON.parse(raw) as object };
    } catch {
      return {};
    }
  }
  const res = await getClient().rpc(session, id, input);
  return { payload: res.payload };
}
