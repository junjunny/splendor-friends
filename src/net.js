import mqtt from "mqtt";

// 폰끼리 직접(P2P) 연결하면 공유기 격리, 통신사 NAT, 사내망 같은 환경에서 막히는 경우가 많아요.
// 그래서 모든 메시지를 공개 MQTT 중계 서버(WebSocket + TLS)로 주고받아요.
// 바깥으로 나가는 보통의 HTTPS급 연결이라 같은 와이파이, 다른 와이파이, 데이터 어디서든 똑같이 동작해요.
// 방장 쪽은 첫 번째로 연결되는 서버 하나만 쓰고, 친구 쪽은 세 서버에 모두 붙어서 방장이 서버를 바꿔도 따라가요.
export const BROKERS = [
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
  "wss://test.mosquitto.org:8081",
];
const HOST_CONNECT_TIMEOUT_MS = 7000;

const root = (code) => `gemfriends/v2/${code}`;
export const topics = (code) => ({
  up: `${root(code)}/up`, // 친구 → 방장
  beat: `${root(code)}/beat`, // 방장 → 모두 (생존 신호)
  to: (id) => `${root(code)}/p/${id}`, // 방장 → 특정 플레이어
});

function connectBroker(url, subscriptions, onMessage, onChange) {
  const client = mqtt.connect(url, {
    clientId: `gf-${Math.random().toString(36).slice(2, 12)}`,
    clean: true,
    keepalive: 20,
    connectTimeout: 8000,
    reconnectPeriod: 2000,
    resubscribe: true,
    protocolVersion: 4,
  });
  const node = { url, client, ready: false };
  const set = (ready) => { if (node.ready !== ready) { node.ready = ready; onChange(ready); } };
  client.on("connect", () => client.subscribe(subscriptions, { qos: 1 }, (error) => set(!error)));
  client.on("close", () => set(false));
  client.on("offline", () => set(false));
  client.on("error", () => {});
  client.on("message", (_topic, payload) => {
    try { onMessage(JSON.parse(payload.toString())); } catch { /* 형식이 다른 메시지는 무시해요. */ }
  });
  return node;
}

const send = (node, topic, message) => node.client.publish(topic, JSON.stringify(message), { qos: 1 });

// 방장: 연결되는 서버를 차례로 시도해서 첫 번째로 열리는 서버에 방을 열어요.
export async function openHostLink({ code, startIndex = 0, onMessage, onChange }) {
  const t = topics(code);
  for (let step = 0; step < BROKERS.length; step += 1) {
    const index = (startIndex + step) % BROKERS.length;
    let chosen = false;
    let node;
    const ok = await new Promise((resolve) => {
      node = connectBroker(BROKERS[index], [t.up], onMessage, (ready) => { if (ready) resolve(true); if (chosen) onChange(ready); });
      setTimeout(() => resolve(false), HOST_CONNECT_TIMEOUT_MS);
    });
    if (!ok) { node.client.end(true); continue; }
    chosen = true;
    return {
      index,
      connected: () => node.ready,
      sendTo: (id, message) => node.ready && send(node, t.to(id), message),
      beat: (message) => node.ready && send(node, t.beat, message),
      close: () => node.client.end(true),
    };
  }
  throw new Error("no-broker");
}

// 친구: 모든 서버에 붙어서 어느 서버로 방장이 오든 받을 수 있게 해요.
export function openGuestLink({ code, id, onMessage, onChange }) {
  const t = topics(code);
  const nodes = [];
  const connected = () => nodes.some((node) => node.ready);
  for (const url of BROKERS) nodes.push(connectBroker(url, [t.beat, t.to(id)], onMessage, () => onChange(connected())));
  return {
    connected,
    publish: (message) => {
      let sent = false;
      for (const node of nodes) if (node.ready) { send(node, t.up, message); sent = true; }
      return sent;
    },
    close: () => nodes.forEach((node) => node.client.end(true)),
  };
}
