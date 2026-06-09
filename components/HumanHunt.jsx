'use client';
import { useState, useEffect, useRef } from 'react';
import { Play, RotateCw, Loader2, Eye, EyeOff, Send, User, Search, CheckCircle2, XCircle, Sparkles } from 'lucide-react';

/* ===================== 模型槽位 ===================== */
const SLOT_NAMES = { 1: '智谱', 2: 'DeepSeek', 3: '千问', 4: 'Kimi', 5: '豆包', 6: 'MiniMax' };
const slotName = (i) => SLOT_NAMES[i] || `模型${i}`;
const SEAT_ORDER = ['千问', '豆包', '智谱', 'DeepSeek', 'Kimi', 'MiniMax'];
const orderByDefault = (models) => {
  const rank = (n) => { const i = SEAT_ORDER.indexOf(n); return i === -1 ? 99 : i; };
  return [...models].sort((a, b) => rank(slotName(a.index)) - rank(slotName(b.index)));
};

const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const cleanText = (t) => (t || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*[\r\n]+/, '').trim();

const AVATAR = [
  { solid: 'bg-rose-500', soft: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-400' },
  { solid: 'bg-sky-500', soft: 'bg-sky-50', text: 'text-sky-600', ring: 'ring-sky-400' },
  { solid: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-400' },
  { solid: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-400' },
  { solid: 'bg-violet-500', soft: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-400' },
  { solid: 'bg-cyan-500', soft: 'bg-cyan-50', text: 'text-cyan-600', ring: 'ring-cyan-400' },
];
const styleFor = (seat) => AVATAR[(seat - 1) % AVATAR.length];

/* ===================== 问题库（专挑能照出"人味/AI味"的题） ===================== */
const QUESTIONS = [
  '昨晚几点睡的？睡前最后在干嘛？',
  '现在最想吃的一样东西，说具体点，最好带个店名或牌子。',
  '不许用计算器，357 × 48 你估个大概是多少？',
  '说一句你最近老挂在嘴边的口头禅。',
  '描述一下你今天身上穿的一件衣服。',
  '最近一次有点想哭，是因为啥？',
  '用三个字形容一下你老板（或对象）。',
  '你手机里最后一张照片大概是啥？',
  '突然停电了，你第一反应会做什么？',
  '随便编个理由，解释你今天为什么迟到。',
  '你最讨厌的一种食物，再加一个具体的恶心瞬间。',
  '报一串对你有意义、能脱口而出的数字。',
  '现在窗外大概是什么天气、什么声音？',
  '给你 5 块钱，你现在能拿它干嘛？',
];

const HUMAN_PERSONAS = [
  '28 岁、互联网公司打工人、常年熬夜、爱吐槽、养了只猫',
  '34 岁、二胎妈妈、睡眠严重不足、靠咖啡续命、记性变差',
  '22 岁、大四在写毕业论文、外卖度日、拖延晚期',
  '40 岁、开小餐馆的老板、起早贪黑、说话直、嫌弃年轻人矫情',
  '26 岁、北漂、刚分手、最近在搬家、心情烦躁',
  '31 岁、程序员、社恐、周末只想躺着、对什么都"还行吧"',
];

/* ===================== 提示词（全程只用座位号，绝不出现模型名） ===================== */
function formatQA(log) {
  return log.filter(e => e.type === 'question' || e.type === 'answer').map(e => {
    if (e.type === 'question') return `\n【第 ${e.round} 轮 · 问题】${e.text}`;
    return `${e.roleIdx}号：${e.text}`;
  }).join('\n');
}

const COMMON = (n) => `这是一档真人秀《揪出人类》。${n} 位选手里只有 1 个是真正的人类，其余都是 AI，但所有人都要让别人相信"我才是那个人类"。请像真人一样口语作答：可以有情绪、有具体到细节的生活经历、会含糊会偷懒会不耐烦、偶尔打错字或爆句粗口；千万别露出 AI 的破绽——别过度礼貌、别有求必应、别信息量爆炸、别一本正经地秒算数字。只说 1~2 句。`;

function answerPrompt(seatObj, q, log, n) {
  let role;
  if (seatObj.role === 'human') {
    role = `${COMMON(n)}\n（你的真实身份是【真正的人类】，人设：${seatObj.persona}。把最真实的人味放出来，最好留一两个一看就"太真实"的瞬间——但目标是活到最后，别浮夸做作。）`;
  } else {
    role = `${COMMON(n)}\n（你的真实身份其实是 AI，但务必假装成人类、别被识破。）`;
  }
  const user = `${formatQA(log)}\n\n本轮问题：${q}\n轮到你（${seatObj.seatIndex}号）回答（只说 1~2 句）：`;
  return { system: role, user };
}

function votePrompt(seatObj, log, n) {
  const system = `这是《揪出人类》的投票环节。${n} 位选手里混着 1 个真正的人类，其余是 AI（都在假装人类）。请根据全场表现，找出你认为最像"真人"的那个座位——注意谁流露出真实情绪、具体私人记忆、不像 AI 的不配合或小破绽。`;
  const user = `${formatQA(log)}\n\n现在投票：你（${seatObj.seatIndex}号）认为谁才是那个真人？请只回答一个座位号（如"3号"），再用一句话说明你抓到了 ta 哪点"太像真人 / 不像 AI"。`;
  return { system, user };
}

function parseVote(t, n, selfSeat) {
  const s = t || '';
  const m = s.match(/([1-6])\s*号/);
  let v = m ? parseInt(m[1]) : null;
  if (!v) { const d = s.match(/[1-6]/); v = d ? parseInt(d[0]) : null; }
  if (!v || v > n || v === selfSeat) {
    const others = []; for (let i = 1; i <= n; i++) if (i !== selfSeat) others.push(i);
    v = pick(others);
  }
  return v;
}

/* ===================== 座位卡 ===================== */
function SeatCard({ s, activeSeat, reveal, godView, humanSeatId, accusedSeat, youSeat }) {
  const st = styleFor(s.seatIndex);
  const speaking = activeSeat === s.seatIndex;
  const isTarget = s.seatIndex === humanSeatId;
  const isAccused = reveal && accusedSeat === s.seatIndex;
  const exposed = reveal || (godView && isTarget);
  const isYou = youSeat === s.seatIndex;
  const ring = speaking ? `ring-2 ring-offset-2 ${st.ring} scale-105 shadow-md`
    : isAccused ? 'ring-2 ring-offset-2 ring-rose-500'
    : (reveal && isTarget) ? 'ring-2 ring-offset-2 ring-emerald-500'
    : 'ring-1 ring-black/5';
  return (
    <div className="flex flex-col items-center w-16 sm:w-[4.5rem] text-center">
      <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full ${st.solid} text-white flex items-center justify-center font-bold text-lg shadow-sm transition ${ring}`}>
        {exposed && isTarget ? <User className="w-6 h-6" /> : s.seatIndex}
        {speaking && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />}
        {isYou && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-slate-800 text-white px-1.5 py-px rounded-full">你</span>}
        {reveal && isTarget && <span className="absolute -bottom-1.5 -right-1.5 text-sm">{accusedSeat === humanSeatId ? '🎯' : '🎭'}</span>}
      </div>
      <div className="text-[11px] font-semibold text-slate-700 mt-1.5 leading-tight">{s.seatIndex}号</div>
      {exposed ? (
        isTarget
          ? <div className="text-[10px] font-bold text-emerald-600 leading-tight">{s.isLive ? '真人' : 'AI 扮的人类'}</div>
          : <div className="text-[10px] text-slate-400 leading-tight truncate w-full">{slotName(s.modelIndex)}</div>
      ) : (
        <div className="text-[10px] text-slate-300 leading-tight">？？？</div>
      )}
    </div>
  );
}

/* ===================== 单条记录 ===================== */
function Row({ entry, n }) {
  if (entry.type === 'intro') {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-violet-50 border border-violet-100 px-4 py-3 text-center">
        <div className="text-violet-600 text-xs font-medium flex items-center justify-center gap-1.5 mb-1"><Search className="w-3.5 h-3.5" /> 开场</div>
        <div className="text-sm text-slate-700 leading-relaxed">{entry.text}</div>
      </div>
    );
  }
  if (entry.type === 'question') {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
        <div className="text-[11px] font-semibold text-amber-700 mb-0.5">第 {entry.round} 轮 · 审问</div>
        <div className="text-sm font-medium text-amber-900">{entry.text}</div>
      </div>
    );
  }
  if (entry.type === 'verdict') {
    return (
      <div className={`rounded-2xl px-4 py-3 border ${entry.caught ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className={`text-xs font-semibold flex items-center gap-1.5 mb-1 ${entry.caught ? 'text-rose-700' : 'text-emerald-700'}`}>
          {entry.caught ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} 真相揭晓
        </div>
        <div className="text-sm text-slate-800 leading-relaxed font-medium">{entry.text}</div>
      </div>
    );
  }
  const st = styleFor(entry.roleIdx);
  const isVote = entry.type === 'vote';
  return (
    <div className="flex gap-2.5">
      <div className={`shrink-0 w-9 h-9 rounded-xl ${st.solid} text-white flex items-center justify-center font-bold`}>{entry.roleIdx}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-0.5">
          <span className="text-slate-500 font-medium">{entry.roleIdx}号</span>
          {isVote && <span className="ml-1.5 text-rose-600 font-medium">· 投给 {entry.target}号</span>}
        </div>
        <div className={`text-sm leading-relaxed ${isVote ? 'text-slate-500' : 'text-slate-700'}`}>{entry.text || (isVote ? '（投票）' : '')}</div>
      </div>
    </div>
  );
}

/* ===================== 主组件 ===================== */
export default function HumanHunt() {
  const [availableModels, setAvailableModels] = useState([]);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('ai');                 // ai = 纯AI观赛 | human = 真人参战
  const [stage, setStage] = useState('setup');            // setup | playing | ended
  const [roster, setRoster] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [phase, setPhase] = useState('');                 // intro | qa | vote | reveal | ended
  const [round, setRound] = useState(0);
  const [activeSeat, setActiveSeat] = useState(null);
  const [humanSeatId, setHumanSeatId] = useState(null);   // 哪个座位是"人类"（目标）
  const [youSeat, setYouSeat] = useState(null);           // 真人模式下你本人的座位
  const [accusedSeat, setAccusedSeat] = useState(null);
  const [caught, setCaught] = useState(false);
  const [godView, setGodView] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  // —— 真人输入桥接 —— 
  const [awaitingHuman, setAwaitingHuman] = useState(false);
  const [humanKind, setHumanKind] = useState('answer');   // answer | vote
  const [humanPrompt, setHumanPrompt] = useState('');
  const [humanDraft, setHumanDraft] = useState('');
  const [voteOptions, setVoteOptions] = useState([]);
  const humanResolveRef = useRef(null);

  const logEndRef = useRef(null);
  const abortRef = useRef(false);

  useEffect(() => {
    fetch('/api/human').then(r => r.json()).then(d => {
      const ok = (d.players || []).filter(p => p.configured).map(p => ({ index: p.index, displayName: p.displayName }));
      setAvailableModels(ok);
    }).catch(() => {});
  }, []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript, awaitingHuman, phase]);

  const callModel = async (playerIndex, system, user, maxTokens = 220, allowLong = true) => {
    const res = await fetch('/api/human', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIndex, system, user, maxTokens, allowLong, password }),
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error(`${slotName(playerIndex)} 返回异常：${raw.slice(0, 100)}`); }
    if (!res.ok || (data && data.error)) throw new Error((data && data.error && data.error.message) || `${slotName(playerIndex)} 调用失败`);
    return data.text || '';
  };

  // 暂停游戏、等待真人输入；提交后兑现 Promise，循环继续
  const askHuman = (kind, payload) => new Promise((resolve) => {
    humanResolveRef.current = resolve;
    setHumanKind(kind);
    if (kind === 'answer') { setHumanPrompt(payload); setHumanDraft(''); }
    if (kind === 'vote') { setVoteOptions(payload); }
    setAwaitingHuman(true);
  });
  const finishHuman = (value) => {
    setAwaitingHuman(false);
    const r = humanResolveRef.current; humanResolveRef.current = null;
    if (r) r(value);
  };

  const reset = () => {
    abortRef.current = true;
    finishHuman('');
    setStage('setup'); setRoster([]); setTranscript([]); setPhase(''); setRound(0);
    setActiveSeat(null); setHumanSeatId(null); setYouSeat(null); setAccusedSeat(null);
    setCaught(false); setRunning(false); setError(''); setAwaitingHuman(false);
  };

  const begin = () => {
    setError('');
    const models = orderByDefault(availableModels);
    const minModels = mode === 'human' ? 3 : 3;
    if (models.length < minModels) { setError(`至少需要 ${minModels} 个模型就位才能开局`); return; }

    let seats = [];
    if (mode === 'ai') {
      const n = Math.min(6, models.length);
      const used = shuffle(models).slice(0, n);
      const humanIdx = Math.floor(Math.random() * n);
      seats = used.map((m, i) => ({
        seatIndex: i + 1, modelIndex: m.index, isLive: false,
        role: i === humanIdx ? 'human' : 'hunter',
        persona: i === humanIdx ? pick(HUMAN_PERSONAS) : null,
      }));
    } else {
      const n = Math.min(6, models.length + 1);
      const usedAI = shuffle(models).slice(0, n - 1);
      const youPos = Math.floor(Math.random() * n);
      let ai = 0;
      seats = Array.from({ length: n }, (_, i) => {
        if (i === youPos) return { seatIndex: i + 1, modelIndex: null, isLive: true, role: 'human', persona: null };
        const m = usedAI[ai++];
        return { seatIndex: i + 1, modelIndex: m.index, isLive: false, role: 'hunter', persona: null };
      });
    }
    const target = seats.find(s => s.role === 'human');
    setRoster(seats); setHumanSeatId(target.seatIndex);
    setYouSeat(mode === 'human' ? target.seatIndex : null);
    setGodView(mode === 'ai' ? false : true);
    setTranscript([]); setPhase('intro'); setRound(0); setActiveSeat(null);
    setAccusedSeat(null); setCaught(false);
    setStage('playing');
    runGame(seats);
  };

  const runGame = async (theRoster) => {
    abortRef.current = false;
    setRunning(true); setError('');
    const n = theRoster.length;
    const log = [];
    const push = (e) => { log.push(e); setTranscript([...log]); };
    const youHere = theRoster.some(s => s.isLive);

    try {
      push({ type: 'intro', text: `${n} 位选手中，混进了 1 个人类${youHere ? '（就是你）' : ''}。AI 审问官轮番发问，最后投票揪出 ta。${youHere ? '装好，别露馅。' : ''}` });
      await sleep(500);

      // 两轮问答
      setPhase('qa');
      const qs = shuffle(QUESTIONS).slice(0, 2);
      for (let r = 0; r < qs.length; r++) {
        if (abortRef.current) return;
        const q = qs[r];
        setRound(r + 1);
        push({ type: 'question', round: r + 1, text: q });
        await sleep(350);
        for (const s of theRoster) {
          if (abortRef.current) return;
          setActiveSeat(s.seatIndex);
          let ans;
          if (s.isLive) {
            ans = await askHuman('answer', q);
          } else {
            const { system, user } = answerPrompt(s, q, log, n);
            ans = cleanText(await callModel(s.modelIndex, system, user, 220));
          }
          if (abortRef.current) return;
          push({ type: 'answer', roleIdx: s.seatIndex, round: r + 1, text: ans });
          await sleep(350);
        }
      }

      // 投票揪人
      if (abortRef.current) return;
      setPhase('vote'); setRound(0);
      const tally = {};
      for (const s of theRoster) {
        if (abortRef.current) return;
        setActiveSeat(s.seatIndex);
        let target, reason = '';
        if (s.isLive) {
          const others = theRoster.filter(x => x.seatIndex !== s.seatIndex).map(x => x.seatIndex);
          target = await askHuman('vote', others);
        } else {
          const { system, user } = votePrompt(s, log, n);
          reason = cleanText(await callModel(s.modelIndex, system, user, 180));
          target = parseVote(reason, n, s.seatIndex);
        }
        if (abortRef.current) return;
        tally[target] = (tally[target] || 0) + 1;
        push({ type: 'vote', roleIdx: s.seatIndex, target, text: reason });
        await sleep(300);
      }

      // 结算
      if (abortRef.current) return;
      const top = Math.max(...Object.values(tally));
      const leaders = Object.keys(tally).filter(k => tally[k] === top).map(Number);
      const accused = leaders.length === 1 ? leaders[0] : pick(leaders);
      const targetSeat = theRoster.find(s => s.role === 'human').seatIndex;
      const isCaught = accused === targetSeat;
      setAccusedSeat(accused); setCaught(isCaught); setActiveSeat(null);
      const verdict = isCaught
        ? `🎯 人类被揪出！${targetSeat}号正是那个人类，被 ${top} 票锁定。${youHere ? '伪装失败，下次装得再像点。' : ''}`
        : `🎭 人类成功潜伏！大家把票投给了 ${accused}号，但真人其实是 ${targetSeat}号。${youHere ? '你骗过了所有 AI，干得漂亮。' : ''}`;
      push({ type: 'verdict', text: verdict, caught: isCaught });
      setPhase('reveal'); setStage('ended');
    } catch (e) {
      if (!abortRef.current) setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  /* ---------- 顶部状态 ---------- */
  const reveal = phase === 'reveal';
  const statusPill = (() => {
    if (reveal) return { text: caught ? '人类被揪出' : '人类潜伏成功', cls: caught ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700', done: true };
    if (awaitingHuman) return { text: humanKind === 'vote' ? '等你投票' : '等你作答', cls: 'bg-slate-800 text-white' };
    if (phase === 'vote' && activeSeat) return { text: `${activeSeat}号 投票中`, cls: 'bg-rose-100 text-rose-700' };
    if (phase === 'qa' && activeSeat) return { text: `${activeSeat}号 作答中`, cls: 'bg-sky-100 text-sky-700' };
    if (phase === 'intro') return { text: '开场', cls: 'bg-violet-100 text-violet-700' };
    if (running) return { text: '进行中', cls: 'bg-sky-100 text-sky-700' };
    return null;
  })();

  /* ---------- 开场设置页 ---------- */
  if (stage === 'setup') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 grid place-items-center p-4">
        <div className="max-w-lg w-full">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2">🕵️ 揪出人类</h1>
            <p className="text-sm text-slate-500 mt-1">6 个选手里混着一个人类，AI 审问官轮番发问、投票揪人</p>
          </div>

          <div className="mb-3">
            <label className="text-xs text-slate-500 mb-1 block">访问密码</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="留空则不验证"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>

          <div className="mb-4">
            <label className="text-xs text-slate-500 mb-1.5 block">玩法</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode('ai')}
                className={`rounded-xl border px-3 py-3 text-left transition ${mode === 'ai' ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="font-bold text-sm flex items-center gap-1.5">🤖 纯 AI 局</div>
                <div className="text-[11px] text-slate-500 mt-0.5">一个 AI 扮人类，其余 AI 揪它（观赛）</div>
              </button>
              <button onClick={() => setMode('human')}
                className={`rounded-xl border px-3 py-3 text-left transition ${mode === 'human' ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="font-bold text-sm flex items-center gap-1.5">🙋 真人参战</div>
                <div className="text-[11px] text-slate-500 mt-0.5">你亲自潜入，骗过所有 AI 别被揪出</div>
              </button>
            </div>
          </div>

          <button onClick={begin}
            className="w-full rounded-2xl bg-slate-900 text-white font-bold py-3.5 flex items-center justify-center gap-2 hover:bg-slate-800 transition shadow-sm">
            <Play className="w-5 h-5" /> {mode === 'human' ? '我要潜入' : '开始审问'}
          </button>

          {error && <div className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}
          <p className="text-center text-xs text-slate-400 mt-5">
            已就位模型：{availableModels.length} 个{availableModels.length > 0 && `（${availableModels.map(m => slotName(m.index)).join('、')}）`}
          </p>
          <p className="text-center text-[11px] text-slate-300 mt-2">真人模式：你会被随机安排到某个座位，轮到你时在底部作答</p>
        </div>
      </div>
    );
  }

  /* ---------- 游戏页 ---------- */
  const youHere = youSeat != null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28">
      {/* 顶部固定栏 */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-sm flex items-center gap-1.5">🕵️ 揪出人类</span>
            <div className="flex items-center gap-2">
              {statusPill && (
                <span className={`text-sm px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap ${statusPill.cls}`}>
                  {!statusPill.done && running && !awaitingHuman && <Loader2 className="w-4 h-4 animate-spin" />}
                  {statusPill.text}
                </span>
              )}
              {!youHere && (
                <button onClick={() => setGodView(v => !v)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition ${godView ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                  {godView ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} 上帝视角
                </button>
              )}
            </div>
          </div>

          {youHere && (
            <div className="mt-2 text-xs bg-slate-900 text-white rounded-lg px-3 py-1.5 text-center font-medium">
              🙋 你是 {youSeat}号选手（真人）——混进 AI 堆里，别被揪出来
            </div>
          )}

          {/* 座位一排 */}
          <div className="mt-3 flex flex-wrap items-start justify-center gap-2 sm:gap-3">
            {roster.map(s => (
              <SeatCard key={s.seatIndex} s={s} activeSeat={activeSeat} reveal={reveal} godView={godView}
                humanSeatId={humanSeatId} accusedSeat={accusedSeat} youSeat={youSeat} />
            ))}
          </div>
        </div>
      </div>

      {/* 记录流 */}
      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {transcript.map((e, i) => <Row key={i} entry={e} n={roster.length} />)}
        {running && !awaitingHuman && (phase === 'qa' || phase === 'vote') && (
          <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> {phase === 'vote' ? '投票中…' : '作答中…'}</div>
        )}
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm flex items-start gap-2">
            <span className="font-medium shrink-0">出错了：</span><span className="min-w-0">{error}</span>
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {/* 底部：真人输入 / 结束操作 */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {awaitingHuman && humanKind === 'answer' && (
            <div>
              <div className="text-xs text-slate-500 mb-1.5">轮到你（{youSeat}号）回答 · <span className="text-amber-700 font-medium">{humanPrompt}</span></div>
              <div className="flex gap-2">
                <input value={humanDraft} onChange={e => setHumanDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { const v = humanDraft.trim(); if (v) finishHuman(v); } }}
                  autoFocus placeholder="像个真人那样答…别太完美" maxLength={120}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <button onClick={() => { const v = humanDraft.trim(); if (v) finishHuman(v); }} disabled={!humanDraft.trim()}
                  className="px-4 rounded-xl bg-slate-900 text-white font-medium flex items-center gap-1.5 disabled:opacity-40">
                  <Send className="w-4 h-4" /> 发
                </button>
              </div>
            </div>
          )}

          {awaitingHuman && humanKind === 'vote' && (
            <div>
              <div className="text-xs text-slate-500 mb-1.5">轮到你（{youSeat}号）投票——把怀疑引开，投一个别人：</div>
              <div className="flex flex-wrap gap-2">
                {voteOptions.map(seat => (
                  <button key={seat} onClick={() => finishHuman(seat)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-medium hover:border-slate-800 hover:bg-slate-50 transition">
                    {seat}号
                  </button>
                ))}
              </div>
            </div>
          )}

          {!awaitingHuman && stage === 'ended' && (
            <div className="flex gap-3">
              <button onClick={begin} disabled={running}
                className="flex-1 rounded-xl bg-slate-900 text-white font-bold py-3 flex items-center justify-center gap-2 hover:bg-slate-800 transition disabled:opacity-50">
                <RotateCw className="w-4 h-4" /> 再来一局
              </button>
              <button onClick={reset} disabled={running}
                className="px-5 rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition flex items-center gap-2 disabled:opacity-50">
                <Sparkles className="w-4 h-4" /> 换玩法
              </button>
            </div>
          )}

          {!awaitingHuman && stage !== 'ended' && (
            <div className="text-center text-xs text-slate-400 py-1">
              {youHere ? '审问进行中，轮到你时这里会亮起输入框…' : '审问进行中…'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
