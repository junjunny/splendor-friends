// 마스코트마다 말투가 달라요. 같은 감정표현도 고른 캐릭터에 따라 다른 대사로 나와요.
// 글자는 직접 못 치고, 여기 정해진 표현만 보낼 수 있어요.
export const EMOTES = [
  { key: "hello", emoji: "👋", label: "인사", contexts: ["playing"] },
  { key: "nice", emoji: "👏", label: "잘했어", contexts: ["playing"] },
  { key: "happy", emoji: "🥰", label: "신나", contexts: ["playing"] },
  { key: "ouch", emoji: "😭", label: "으악", contexts: ["playing"] },
  { key: "think", emoji: "🤔", label: "고민 중", contexts: ["playing"] },
  { key: "hurry", emoji: "⏰", label: "빨리", contexts: ["playing"] },
  { key: "sorry", emoji: "🙏", label: "미안", contexts: ["playing"] },
  { key: "gg", emoji: "🤝", label: "수고했어", text: "수고했어요!", contexts: ["playing", "rematch"] },
  { key: "one_more", emoji: "🔥", label: "한 판 더", text: "한 판 더!", contexts: ["rematch"] },
  { key: "last_question", emoji: "❓", label: "막판?", text: "막판?", contexts: ["playing", "rematch"] },
  { key: "last_current", emoji: "☝️", label: "이번 판이 막판", text: "이번 판이 막판!", contexts: ["playing"] },
  { key: "last_next", emoji: "☝️", label: "다음 판이 막판", text: "다음 판이 막판!", contexts: ["rematch"] },
  { key: "wait", emoji: "✋", label: "잠시만", text: "잠시만!", contexts: ["rematch"] },
  { key: "agree", emoji: "👍", label: "좋아요", text: "좋아요!", contexts: ["rematch"] },
  { key: "leave_intent", emoji: "👋", label: "여기까지", text: "여기까지 할게요!", contexts: ["rematch"] },
];

export const QUICK_CHATS = EMOTES.filter((item) => item.contexts.includes("rematch"));

const LINES = {
  chiikawa: {
    hello: "아, 안녕…!", nice: "와아…! 대단해…!", happy: "에헤헤…", ouch: "으, 으앙…!", think: "으음… 으음…", hurry: "저, 저기… 차례야…!", sorry: "미, 미안…!", gg: "고마웠어…!",
    buy: "해, 해냈다…!", points: "와아…! 점수다…!", noble: "귀, 귀족님이…!", reserve: "이건… 찜…!", discard: "아까워…", win: "이, 이겼어…! 에헤헤…",
  },
  hachiware: {
    hello: "안녕! 잘 부탁해!", nice: "우와, 멋지다!", happy: "신난다~!", ouch: "어라라…?!", think: "음~ 어떻게 할까?", hurry: "네 차례야! 어떻게든 될 거야!", sorry: "미안 미안!", gg: "즐거웠어! 또 하자!",
    buy: "좋았어! 샀다!", points: "점수 얻었다~!", noble: "귀족님 어서 오세요!", reserve: "이건 내가 찜할게!", discard: "어쩔 수 없지~", win: "해냈다! 어떻게든 됐어!",
  },
  usagi: {
    hello: "야하~!", nice: "우라! 우라!", happy: "푸루루루~!", ouch: "하아~?!", think: "흐음~~", hurry: "우라라라라!", sorry: "…헤헷", gg: "야하~! 우라!",
    buy: "우라!", points: "야하하~!", noble: "우라라~!!", reserve: "훗!", discard: "쳇!", win: "우라아아아~!!",
  },
  kurimanju: {
    hello: "여어~", nice: "크으, 좋은데?", happy: "캬~ 좋다~", ouch: "어이쿠…", think: "흠, 한잔하며 생각 좀…", hurry: "천천히 해도 되지만… 차례야~", sorry: "미안하구먼~", gg: "수고했어~ 한잔할까?",
    buy: "캬~ 샀다!", points: "크으~ 점수 맛 좋다!", noble: "귀족님도 한잔?", reserve: "이건 아껴둬야지~", discard: "아깝구먼…", win: "캬~! 이 맛이지!",
  },
  ode: {
    hello: "안녕, 반가워!", nice: "오~ 멋져!", happy: "빙글빙글~", ouch: "앗, 눈이 핑 돌아…", think: "한쪽 눈으로 잘 볼게…", hurry: "지켜보고 있어~ 차례야!", sorry: "미안해~", gg: "즐거웠어~!",
    buy: "오데! 샀다~", points: "점수 반짝!", noble: "귀족님 어서 와~", reserve: "이건 찜콩~", discard: "아쉽다~", win: "오데~! 이겼다!",
  },
  momonga: {
    hello: "나 왔어! 봐줘!", nice: "흥, 제법이네!", happy: "칭찬해줘~!", ouch: "싫어 싫어~!", think: "잠깐, 생각 중이야!", hurry: "빨리 빨리~!", sorry: "…미안하다구!", gg: "재밌었어! 또 놀아줘!",
    buy: "봤지? 봤지?", points: "나 대단하지!", noble: "귀족님도 나를 좋아해!", reserve: "이건 내 거야!", discard: "아까워~!", win: "내가 최고야! 칭찬해줘~!",
  },
};
const LEGACY = { ruby: "chiikawa", sapphire: "hachiware", emerald: "usagi", diamond: "momonga" };

export function mascotLine(avatar, key) {
  const fixed = EMOTES.find((item) => item.key === key)?.text;
  if (fixed) return fixed;
  const lines = LINES[LEGACY[avatar] || avatar] || LINES.chiikawa;
  return lines[key] || "";
}

// 게임 기록 한 줄을 그 플레이어의 한마디로 바꿔요. 보석 가져가기처럼 자주 있는 행동엔 말하지 않아요.
export function reactionFor(activity) {
  if (!activity) return null;
  if (activity.type === "buy") return activity.card?.points ? "points" : "buy";
  if (activity.type === "noble" || activity.type === "reserve" || activity.type === "discard") return activity.type;
  return null;
}
