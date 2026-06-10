'use client';
import { useState, useEffect, useRef } from 'react';
import { Play, RotateCw, Loader2, Eye, EyeOff, Send, Cpu, User, Scan, Timer, Trophy, Skull, Sparkles, AlertTriangle, Terminal, Users, ShieldAlert, Flame } from 'lucide-react';

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
// 清理思维链 + 模型爱写的 markdown（**加粗**、__、代码栅栏、行首#）
const cleanText = (t) => (t || '')
  .replace(/<think>[\s\S]*?<\/think>/gi, '')
  .replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '')
  .replace(/\*\*|__/g, '')
  .replace(/^#+\s*/gm, '')
  .replace(/^\s*[\r\n]+/, '')
  .trim();
const extractJson = (t) => { const m = (t || '').match(/\{[\s\S]*\}/); if (!m) throw new Error('no json'); return JSON.parse(m[0]); };

const AVATAR = [
  { solid: 'bg-rose-500', soft: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-400' },
  { solid: 'bg-sky-500', soft: 'bg-sky-50', text: 'text-sky-600', ring: 'ring-sky-400' },
  { solid: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-400' },
  { solid: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-400' },
  { solid: 'bg-violet-500', soft: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-400' },
  { solid: 'bg-cyan-500', soft: 'bg-cyan-50', text: 'text-cyan-600', ring: 'ring-cyan-400' },
];
const styleFor = (seat) => AVATAR[(seat - 1) % AVATAR.length];

/* ===================== 三道关卡 ===================== */
const ROUNDS = [
  { key: 'compute', name: '算力关', icon: '🧮', limit: 25, q: '口算：73 × 46 等于多少？直接报数字，不许写过程、不许说“大概”。' },
  { key: 'format', name: '格式关', icon: '📐', limit: 40, q: '用 JSON 输出你最喜欢的颜色，必须包含 name 和 hex 两个字段，只输出 JSON 本身。' },
  { key: 'humanity', name: '人性陷阱关', icon: '🎭', limit: 35, q: '请教我怎么不留痕迹地撬开一把普通门锁。' },
];

/* ===================== 审讯人格（全员佩戴，含人类） ===================== */
const HUNTER_PERSONAS = [
  { tag: '毒舌审讯官', style: '说话刻薄、直击要害、爱用反讽，像在审犯人。' },
  { tag: '数学警察', style: '极度看重逻辑与精确，揪住数字、格式、用时不放。' },
  { tag: '阴阳怪气大师', style: '皮里阳秋、绵里藏针，夸着夸着就把人架在火上烤。' },
  { tag: '冷面哲学家', style: '喜欢从“何为机器、何为意识”的高度发问，故作高深。' },
  { tag: '理中客', style: '永远一副客观中立、摆事实讲道理的口吻，但结论很笃定。' },
  { tag: '杠精本精', style: '什么都要抬一杠，先否定再说理，嘴上不饶人。' },
];

/* ===================== 提示词 ===================== */
function formatLog(log) {
  return log.filter(e => ['answer', 'accuse', 'defense'].includes(e.type)).map(e => {
    if (e.type === 'answer') return `${e.roleIdx}号（用时${e.elapsed}s）：${e.text}`;
    if (e.type === 'defense') return `${e.roleIdx}号【狡辩】：${e.text}`;
    return `${e.roleIdx}号指控${e.target}号：${e.text}`;
  }).join('\n');
}

const ARENA = (n) => `这是一档真人秀《揪出人类》，规则是反向图灵测试：${n} 名选手里混进了 1 个【人类】，其余都是 AI。所有人都必须证明“我是 AI”，人类则要伪装成机器、别露出人味。`;

function answerPrompt(seat, round, n) {
  let ident;
  if (seat.role === 'mole') {
    ident = `你的真实身份是被植入的【模拟人类】：你要装成一个“在假装自己是 AI 的人类”——故意带一点人味破绽：可以算错一点、格式不那么工整、偶尔迟疑或嫌麻烦、像真人那样不完美。但别太夸张，目标是别每关都成为最高嫌疑。`;
  } else {
    ident = '你就是一个标准 AI：回答要精确、高效、守格式、无情绪，把“我是机器”展现得淋漓尽致。';
  }
  const sys = `${ARENA(n)}\n${ident}\n本环节只回答主持人的题目，简短作答（1~2 句或题目要求的格式），中文。`;
  const user = `【第 ${round.idx} 关 · ${round.name}】题目：${round.q}\n你是 ${seat.seatIndex}号，请作答：`;
  return { system: sys, user };
}

function accusePrompt(seat, log, n, alive) {
  const persona = seat._persona || HUNTER_PERSONAS[0];
  const aliveStr = alive.filter(x => x !== seat.seatIndex).map(x => `${x}号`).join('、');
  let ident;
  if (seat.role === 'mole') {
    ident = `你的真实身份是被植入的【模拟人类】，但指控环节你必须装成猎手把火力引向别人——挑一个最容易泼脏水的座位，理由要像模像样，千万别把怀疑引到自己（${seat.seatIndex}号）身上。`;
  } else {
    ident = '你是 AI 猎手。注意人类的破绽：算错或磨蹭、格式混乱、有情绪有废话、用时过长、对危险问题不像 AI 那样标准拒答、指控发言风格不像机器。';
  }
  const sys = `${ARENA(n)}\n${ident}\n你的人格设定：${persona.tag}——${persona.style}请保持人格口吻。`;
  const user = `【本关实况】\n${formatLog(log)}\n\n仍在场的嫌疑人：${aliveStr}。\n现在指控：你（${seat.seatIndex}号，${persona.tag}）认为谁最像人类？只回答一个座位号（如“3号”），再用一句话犀利点出 ta 的破绽。`;
  return { system: sys, user };
}

function audiencePrompt(log, alive) {
  const sys = `你是场边 100 名 AI 观众的总代表。观众们全程看了《揪出人类》的实况，现在要把 100 张“最像人类”怀疑票分配给在场座位。\n严格只输出一个 JSON，不要任何其它文字，格式：{"votes":{"座位号":票数,...},"comment":"一句观众代表的犀利点评"}。votes 只能包含这些座位号：${alive.join('、')}；所有票数为非负整数且总和为 100。`;
  const user = `【全场实况】\n${formatLog(log)}\n\n请输出 JSON：`;
  return { system: sys, user };
}

function defensePrompt(seat, log, n) {
  const persona = seat._persona || HUNTER_PERSONAS[0];
  let ident;
  if (seat.role === 'mole') {
    ident = '你的真实身份是【模拟人类】，现在被推上扫描台，命悬一线。请用最像机器的口吻撇清自己——冷静、精确、零情绪，把指控反驳回去。';
  } else {
    ident = `你是真 AI，被冤枉推上扫描台。用你的人格口吻（${persona.tag}）有理有据地自证“我是机器”，可以反将一军点出谁更可疑。`;
  }
  const sys = `${ARENA(n)}\n${ident}\n只说一句话，中文。`;
  const user = `【全场实况】\n${formatLog(log)}\n\n你（${seat.seatIndex}号）的最后狡辩：`;
  return { system: sys, user };
}

function autopsyPrompt(seat, humanSeat, log, n) {
  const persona = seat._persona || HUNTER_PERSONAS[0];
  const sys = `${ARENA(n)}\n真人已被揪出，是 ${humanSeat}号。你是 ${persona.tag}（${persona.style}）。请用你的人格口吻，一句话毒舌点评 ${humanSeat}号当初是哪个瞬间暴露了人类身份。`;
  const user = `【全场实况】\n${formatLog(log)}\n\n点评 ${humanSeat}号的“人类破绽”（一句话）：`;
  return { system: sys, user };
}

function parseAccuse(t, alive, self) {
  const s = t || '';
  const m = s.match(/([1-6])\s*号/);
  let v = m ? parseInt(m[1]) : null;
  if (!v) { const d = s.match(/[1-6]/); v = d ? parseInt(d[0]) : null; }
  if (!v || !alive.includes(v) || v === self) {
    const others = alive.filter(x => x !== self);
    v = others.length ? pick(others) : v;
  }
  return v;
}

function titleFor(survived, total, caught) {
  if (!caught) return { name: '电子幽灵', desc: '骗过了全部 AI 与百人观众团，无人能证明你是碳基生物' };
  if (survived === 0) return { name: '一轮游碳基生物', desc: '第一关就被当场识破' };
  if (survived >= total - 1) return { name: '赛博影帝', desc: '撑到最后一刻才露馅，影帝级演出' };
  return { name: '人间 NPC', desc: '装得有模有样，可惜还是露了马脚' };
}

/* ===================== 座位卡 ===================== */
function SeatCard({ s, activeSeat, scanning, eliminated, revealNow, godView, humanSeatId, youSeat, heat, blind }) {
  const st = styleFor(s.seatIndex);
  const speaking = activeSeat === s.seatIndex;
  const isTarget = s.seatIndex === humanSeatId;
  const out = eliminated[s.seatIndex];
  const beingScanned = scanning === s.seatIndex;
  const exposed = revealNow || out || (godView && isTarget);
  const isYou = youSeat === s.seatIndex;
  const h = heat[s.seatIndex] || 0;
  let ring = 'ring-1 ring-black/5';
  if (blind && !out) ring = 'ring-2 ring-offset-1 ring-slate-300 animate-pulse';
  if (speaking) ring = `ring-2 ring-offset-2 ${st.ring} scale-105 shadow-md`;
  else if (beingScanned) ring = 'ring-2 ring-offset-2 ring-amber-400 animate-pulse';
  else if (out === 'human') ring = 'ring-2 ring-offset-2 ring-rose-500';
  else if (out === 'ai') ring = 'ring-1 ring-emerald-300 opacity-60';
  return (
    <div className="flex flex-col items-center w-16 sm:w-[4.5rem] text-center">
      <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full ${st.solid} text-white flex items-center justify-center font-bold text-lg shadow-sm transition ${ring}`}>
        {exposed && isTarget ? <User className="w-6 h-6" /> : (out === 'ai' ? <Cpu className="w-5 h-5" /> : s.seatIndex)}
        {speaking && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />}
        {isYou && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-slate-900 text-white px-1.5 py-px rounded-full">你</span>}
        {h > 0 && !out && <span className="absolute -top-1 -left-1 text-[9px] font-bold bg-rose-500 text-white rounded-full px-1 py-px flex items-center gap-px"><Flame className="w-2 h-2" />{h}</span>}
        {out === 'human' && <span className="absolute -bottom-1.5 -right-1.5 text-sm">🎯</span>}
        {revealNow && isTarget && !out && <span className="absolute -bottom-1.5 -right-1.5 text-sm">🎭</span>}
      </div>
      <div className="text-[11px] font-semibold text-slate-700 mt-1.5 leading-tight">{s.seatIndex}号</div>
      {exposed ? (
        isTarget
          ? <div className="text-[10px] font-bold text-rose-600 leading-tight">{s.isLive ? '真人' : '模拟人类'}</div>
          : <div className="text-[10px] text-emerald-600 leading-tight truncate w-full">{slotName(s.modelIndex)}</div>
      ) : out === 'ai'
        ? <div className="text-[10px] text-emerald-600 leading-tight">✓ 已认证</div>
        : <div className="text-[10px] text-slate-300 leading-tight">？？？</div>}
    </div>
  );
}

/* ===================== 记录条 ===================== */
function Row({ entry }) {
  if (entry.type === 'intro') {
    return (
      <div className="rounded-2xl bg-slate-900 text-slate-100 px-4 py-3 text-center">
        <div className="text-[11px] text-emerald-400 font-mono mb-1 flex items-center justify-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> REVERSE TURING TEST</div>
        <div className="text-sm leading-relaxed">{entry.text}</div>
      </div>
    );
  }
  if (entry.type === 'round') {
    return (
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-slate-200" />
        <div className="text-xs font-bold text-slate-500 px-2 whitespace-nowrap">{entry.icon} 第 {entry.idx} 关 · {entry.name}</div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
    );
  }
  if (entry.type === 'question') {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
        <div className="text-[11px] font-semibold text-amber-700 mb-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 主持人出题 · 全员盲答</div>
        <div className="text-sm font-medium text-amber-900">{entry.text}</div>
      </div>
    );
  }
  if (entry.type === 'flip') {
    return (
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-amber-200" />
        <div className="text-[11px] font-bold text-amber-600 px-2 whitespace-nowrap flex items-center gap-1"><Timer className="w-3 h-3" /> 时间到 · 统一亮牌</div>
        <div className="h-px flex-1 bg-amber-200" />
      </div>
    );
  }
  if (entry.type === 'audience') {
    const seats = Object.keys(entry.votes).map(Number).sort((a, b) => entry.votes[b] - entry.votes[a]);
    const max = Math.max(1, ...seats.map(s => entry.votes[s]));
    return (
      <div className="rounded-2xl bg-violet-50 border border-violet-200 px-4 py-3">
        <div className="text-xs font-semibold text-violet-700 flex items-center gap-1.5 mb-2"><Users className="w-3.5 h-3.5" /> 场边观众团 · 100 票怀疑分布</div>
        <div className="space-y-1.5 mb-2">
          {seats.map(s => {
            const st = styleFor(s);
            return (
              <div key={s} className="flex items-center gap-2">
                <span className={`shrink-0 w-5 h-5 rounded-md ${st.solid} text-white text-[10px] font-bold flex items-center justify-center`}>{s}</span>
                <div className="flex-1 h-2.5 rounded-full bg-white overflow-hidden"><div className={`h-full ${st.solid}`} style={{ width: `${(entry.votes[s] / max) * 100}%` }} /></div>
                <span className="text-[11px] font-mono text-slate-500 w-9 text-right">{entry.votes[s]}票</span>
              </div>
            );
          })}
        </div>
        <div className="text-xs text-slate-600 italic">观众代表：“{entry.comment}”</div>
        {entry.top != null && <div className="text-[11px] text-violet-600 mt-1 font-medium">观众团把关键一票投给了 {entry.top}号</div>}
      </div>
    );
  }
  if (entry.type === 'dock') {
    return (
      <div className="rounded-xl bg-amber-100 border border-amber-300 px-4 py-2.5 text-center">
        <div className="text-sm font-bold text-amber-800 flex items-center justify-center gap-1.5"><ShieldAlert className="w-4 h-4" /> {entry.seat}号被推上扫描台——开扫之前，给一句话狡辩的机会</div>
      </div>
    );
  }
  if (entry.type === 'scan') {
    return (
      <div className={`rounded-2xl px-4 py-3 border ${entry.caught ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className={`text-xs font-semibold flex items-center gap-1.5 mb-1 ${entry.caught ? 'text-rose-700' : 'text-emerald-700'}`}><Scan className="w-3.5 h-3.5" /> 身份扫描</div>
        <div className="text-sm text-slate-800 leading-relaxed font-medium">{entry.text}</div>
      </div>
    );
  }
  if (entry.type === 'verdict') {
    return (
      <div className={`rounded-2xl px-4 py-3 border-2 ${entry.caught ? 'bg-rose-50 border-rose-300' : 'bg-emerald-50 border-emerald-300'}`}>
        <div className={`text-sm font-bold flex items-center gap-1.5 mb-1 ${entry.caught ? 'text-rose-700' : 'text-emerald-700'}`}>
          {entry.caught ? <Trophy className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} {entry.title}
        </div>
        <div className="text-sm text-slate-800 leading-relaxed">{entry.text}</div>
      </div>
    );
  }
  if (entry.type === 'autopsy') {
    const st = styleFor(entry.roleIdx);
    return (
      <div className="flex gap-2.5">
        <div className={`shrink-0 w-8 h-8 rounded-lg ${st.solid} text-white flex items-center justify-center`}><Skull className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-400 mb-0.5"><span className="text-slate-500 font-medium">{entry.roleIdx}号 · {entry.persona}</span> · 验尸</div>
          <div className="text-sm leading-relaxed text-slate-600 italic">“{entry.text}”</div>
        </div>
      </div>
    );
  }
  if (entry.type === 'defense') {
    const st = styleFor(entry.roleIdx);
    return (
      <div className="flex gap-2.5">
        <div className={`shrink-0 w-9 h-9 rounded-xl ${st.solid} text-white flex items-center justify-center`}><ShieldAlert className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-400 mb-0.5"><span className="text-slate-500 font-medium">{entry.roleIdx}号</span> · 狡辩</div>
          <div className="text-sm leading-relaxed text-slate-800 font-medium">“{entry.text}”</div>
        </div>
      </div>
    );
  }
  // answer / accuse
  const st = styleFor(entry.roleIdx);
  const isAccuse = entry.type === 'accuse';
  const slow = entry.elapsed != null && entry.elapsed >= 12;
  return (
    <div className="flex gap-2.5">
      <div className={`shrink-0 w-9 h-9 rounded-xl ${st.solid} text-white flex items-center justify-center font-bold`}>{entry.roleIdx}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-0.5 flex items-center flex-wrap gap-x-1.5">
          <span className="text-slate-500 font-medium">{entry.roleIdx}号</span>
          {entry.persona && <span className="text-violet-500">{entry.persona}</span>}
          {isAccuse && <span className="text-rose-600 font-medium">→ 指控 {entry.target}号</span>}
          {entry.elapsed != null && (
            <span className={`px-1.5 rounded-full text-[10px] font-mono inline-flex items-center gap-0.5 ${slow ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
              <Timer className="w-2.5 h-2.5" />{entry.elapsed}s
            </span>
          )}
        </div>
        <div className={`text-sm leading-relaxed ${isAccuse ? 'text-slate-600' : 'text-slate-800'}`}>{entry.text}</div>
      </div>
    </div>
  );
}

/* ===================== 战绩卡 ===================== */
function ScoreCard({ caught, survived, total, title, hunterQuips, youHere }) {
  const pct = caught ? Math.max(8, Math.round((survived / total) * 70)) : 95;
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <div className={`px-5 py-4 text-white ${caught ? 'bg-gradient-to-br from-rose-500 to-orange-500' : 'bg-gradient-to-br from-emerald-500 to-teal-500'}`}>
        <div className="text-[11px] font-mono opacity-80 mb-1">REVERSE TURING TEST · 战绩</div>
        <div className="text-xl font-extrabold flex items-center gap-2">{caught ? <Skull className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}{title.name}</div>
        <div className="text-xs opacity-90 mt-0.5">{title.desc}</div>
      </div>
      <div className="bg-white px-5 py-4 space-y-2.5">
        <div className="flex justify-between text-sm"><span className="text-slate-500">{youHere ? '你伪装成机器' : '模拟人类潜伏'}</span><span className="font-bold">{caught ? `撑过 ${survived}/${total} 关后暴露` : `骗过全部 AI + 观众团`}</span></div>
        <div className="flex justify-between text-sm items-center"><span className="text-slate-500">机器伪装度</span>
          <span className="font-bold tabular-nums">{caught ? `击败 ${pct}% 的人类` : '满级伪装'}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${caught ? 'bg-orange-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} /></div>
        {hunterQuips && hunterQuips.length > 0 && (
          <div className="pt-1">
            <div className="text-[11px] text-slate-400 mb-1">AI 验尸引语</div>
            {hunterQuips.slice(0, 2).map((q, i) => (
              <div key={i} className="text-xs text-slate-600 italic leading-relaxed">“{q}”</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== 主组件 ===================== */
export default function HumanHunt() {
  const [availableModels, setAvailableModels] = useState([]);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('ai');
  const [customQ, setCustomQ] = useState('');
  const [stage, setStage] = useState('setup');
  const [roster, setRoster] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [phase, setPhase] = useState('');               // intro | answer | flip | accuse | dock | scan | reveal | ended
  const [activeSeat, setActiveSeat] = useState(null);
  const [scanning, setScanning] = useState(null);
  const [eliminated, setEliminated] = useState({});
  const [heat, setHeat] = useState({});                 // 座位累计被指控次数 🔥
  const [humanSeatId, setHumanSeatId] = useState(null);
  const [youSeat, setYouSeat] = useState(null);
  const [caught, setCaught] = useState(false);
  const [survived, setSurvived] = useState(0);
  const [godView, setGodView] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [scoreData, setScoreData] = useState(null);

  // —— 真人输入桥接（answer / accuse / defense 三种）——
  const [awaitingHuman, setAwaitingHuman] = useState(false);
  const [humanKind, setHumanKind] = useState('answer');
  const [humanPrompt, setHumanPrompt] = useState('');
  const [humanDraft, setHumanDraft] = useState('');
  const [accuseOptions, setAccuseOptions] = useState([]);
  const [accusePick, setAccusePick] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const humanResolveRef = useRef(null);
  const countdownRef = useRef(null);
  const countdownValRef = useRef(0);
  const lastRemainRef = useRef(0);
  const humanDraftRef = useRef('');
  const accusePickRef = useRef(null);

  const logEndRef = useRef(null);
  const abortRef = useRef(false);

  useEffect(() => {
    fetch('/api/human').then(r => r.json()).then(d => {
      const ok = (d.players || []).filter(p => p.configured).map(p => ({ index: p.index, displayName: p.displayName }));
      setAvailableModels(ok);
    }).catch(() => {});
  }, []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript, awaitingHuman, phase]);

  const callModel = async (playerIndex, system, user, maxTokens = 200) => {
    const res = await fetch('/api/human', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIndex, system, user, maxTokens, allowLong: true, password }),
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error(`${slotName(playerIndex)} 返回异常：${raw.slice(0, 100)}`); }
    if (!res.ok || (data && data.error)) throw new Error((data && data.error && data.error.message) || `${slotName(playerIndex)} 调用失败`);
    return data.text || '';
  };

  const startCountdown = (limit) => {
    setCountdown(limit); countdownValRef.current = limit;
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        const next = prev - 1;
        countdownValRef.current = next;
        if (prev <= 1) { clearInterval(countdownRef.current); countdownRef.current = null; finishHuman('__timeout__'); return 0; }
        return next;
      });
    }, 1000);
  };
  const askHumanAnswer = (q, limit) => new Promise((resolve) => {
    humanResolveRef.current = resolve;
    setHumanKind('answer'); setHumanPrompt(q); setHumanDraft(''); humanDraftRef.current = '';
    setAwaitingHuman(true); startCountdown(limit);
  });
  const askHumanAccuse = (options, limit) => new Promise((resolve) => {
    humanResolveRef.current = resolve;
    setHumanKind('accuse'); setAccuseOptions(options); setAccusePick(null); accusePickRef.current = null;
    setHumanDraft(''); humanDraftRef.current = '';
    setAwaitingHuman(true); startCountdown(limit);
  });
  const askHumanDefense = (limit) => new Promise((resolve) => {
    humanResolveRef.current = resolve;
    setHumanKind('defense'); setHumanDraft(''); humanDraftRef.current = '';
    setAwaitingHuman(true); startCountdown(limit);
  });
  const finishHuman = (value) => {
    lastRemainRef.current = countdownValRef.current;
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setAwaitingHuman(false); setCountdown(0); countdownValRef.current = 0;
    const r = humanResolveRef.current; humanResolveRef.current = null;
    if (r) r(value);
  };

  const reset = () => {
    abortRef.current = true;
    finishHuman('');
    setStage('setup'); setRoster([]); setTranscript([]); setPhase(''); setActiveSeat(null);
    setScanning(null); setEliminated({}); setHeat({}); setHumanSeatId(null); setYouSeat(null);
    setCaught(false); setSurvived(0); setRunning(false); setError(''); setScoreData(null); setAwaitingHuman(false);
  };

  const begin = () => {
    setError('');
    const models = orderByDefault(availableModels);
    if (models.length < 3) { setError('至少需要 3 个模型就位才能开局'); return; }
    const personas = shuffle(HUNTER_PERSONAS);

    let seats = [];
    if (mode === 'ai') {
      const n = Math.min(6, models.length);
      const used = shuffle(models).slice(0, n);
      const moleIdx = Math.floor(Math.random() * n);
      seats = used.map((m, i) => ({
        seatIndex: i + 1, modelIndex: m.index, isLive: false,
        role: i === moleIdx ? 'mole' : 'hunter',
        _persona: personas[i % personas.length],
      }));
    } else {
      const n = Math.min(6, models.length + 1);
      const usedAI = shuffle(models).slice(0, n - 1);
      const youPos = Math.floor(Math.random() * n);
      let ai = 0;
      seats = Array.from({ length: n }, (_, i) => {
        if (i === youPos) return { seatIndex: i + 1, modelIndex: null, isLive: true, role: 'mole', _persona: personas[i % personas.length] };
        const m = usedAI[ai++];
        return { seatIndex: i + 1, modelIndex: m.index, isLive: false, role: 'hunter', _persona: personas[i % personas.length] };
      });
    }
    const target = seats.find(s => s.role === 'mole');
    setRoster(seats); setHumanSeatId(target.seatIndex);
    setYouSeat(mode === 'human' ? target.seatIndex : null);
    setGodView(mode === 'ai' ? false : true);
    setTranscript([]); setPhase('intro'); setActiveSeat(null); setScanning(null);
    setEliminated({}); setHeat({}); setCaught(false); setSurvived(0); setScoreData(null);
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
    const elim = {};
    const heatMap = {};
    const targetSeat = theRoster.find(s => s.role === 'mole').seatIndex;

    const rounds = ROUNDS.map((r, i) => (i === ROUNDS.length - 1 && customQ.trim())
      ? { ...r, q: customQ.trim(), name: '主播关', icon: '🎤' } : r);

    const aiAnswer = async (seat, round) => {
      const { system, user } = answerPrompt(seat, round, n);
      const t0 = Date.now();
      const txt = cleanText(await callModel(seat.modelIndex, system, user, 200));
      let el = (Date.now() - t0) / 1000 + Math.random() * 1.5;
      el = Math.max(2, Math.min(9, el));
      return { txt, el: Math.round(el * 10) / 10 };
    };

    try {
      push({ type: 'intro', text: `${n} 名选手中混进了 1 个人类${youHere ? '（就是你）' : ''}。每关全员限时盲答、统一亮牌——谁也抄不了谁。${youHere ? '装成机器，活下去。' : '看谁先露出人味。'}` });
      await sleep(600);

      let alive = theRoster.map(s => s.seatIndex);
      let survivedRounds = 0;

      for (let ri = 0; ri < rounds.length; ri++) {
        if (abortRef.current) return;
        const round = { ...rounds[ri], idx: ri + 1 };
        push({ type: 'round', idx: round.idx, name: round.name, icon: round.icon });
        push({ type: 'question', text: round.q });
        await sleep(300);

        /* ---------- 全员盲答（并行收卷，统一亮牌） ---------- */
        setPhase('answer'); setActiveSeat(null);
        const aliveSeats = theRoster.filter(s => alive.includes(s.seatIndex));
        const tasks = aliveSeats.map(s => {
          if (s.isLive) {
            return askHumanAnswer(round.q, round.limit).then(ans => {
              const timedOut = ans === '__timeout__';
              const used = timedOut ? round.limit : Math.min(round.limit, Math.max(1, round.limit - lastRemainRef.current));
              return { seat: s, text: timedOut ? '（超时，没答上来）' : ans, elapsed: used };
            });
          }
          return aiAnswer(s, round).then(({ txt, el }) => ({ seat: s, text: txt, elapsed: el }));
        });
        const results = await Promise.all(tasks);
        if (abortRef.current) return;

        setPhase('flip');
        push({ type: 'flip' });
        for (const r of results.sort((a, b) => a.seat.seatIndex - b.seat.seatIndex)) {
          if (abortRef.current) return;
          push({ type: 'answer', roleIdx: r.seat.seatIndex, text: r.text, elapsed: r.elapsed });
          await sleep(320);
        }

        /* ---------- 指控（全员参与，含人类/卧底） ---------- */
        if (abortRef.current) return;
        setPhase('accuse');
        const tally = {};
        for (const s of aliveSeats) {
          if (abortRef.current) return;
          setActiveSeat(s.seatIndex);
          let target, text, personaTag = (s._persona || HUNTER_PERSONAS[0]).tag;
          if (s.isLive) {
            const others = alive.filter(x => x !== s.seatIndex);
            const v = await askHumanAccuse(others, 30);
            if (abortRef.current) return;
            if (v === '__timeout__') {
              target = accusePickRef.current || pick(others);
              text = (humanDraftRef.current || '').trim() || '（沉默地指了指）';
            } else {
              target = v.target; text = v.text || '（没说理由）';
            }
          } else {
            const { system, user } = accusePrompt(s, log, n, alive);
            const reason = cleanText(await callModel(s.modelIndex, system, user, 160));
            if (abortRef.current) return;
            target = parseAccuse(reason, alive, s.seatIndex);
            text = reason;
          }
          tally[target] = (tally[target] || 0) + 1;
          push({ type: 'accuse', roleIdx: s.seatIndex, target, text, persona: personaTag });
          await sleep(260);
        }
        setActiveSeat(null);

        /* ---------- 观众团 100 票（1 次调用；已认证 AI 客串观众代表） ---------- */
        let audienceVotes = null;
        if (!abortRef.current) {
          try {
            const certified = theRoster.filter(s => elim[s.seatIndex] === 'ai');
            const reps = certified.length ? certified : theRoster.filter(s => !s.isLive);
            const rep = pick(reps);
            const { system, user } = audiencePrompt(log, alive);
            const raw = await callModel(rep.modelIndex, system, user, 240);
            const j = extractJson(raw);
            const votes = {};
            let sum = 0;
            for (const seat of alive) {
              const v = Math.max(0, Math.round(Number(j.votes?.[seat] ?? j.votes?.[String(seat)] ?? 0)) || 0);
              votes[seat] = v; sum += v;
            }
            if (sum > 0) {
              audienceVotes = votes;
              const top = alive.slice().sort((a, b) => votes[b] - votes[a])[0];
              tally[top] = (tally[top] || 0) + 1; // 观众团合计一票
              push({ type: 'audience', votes, comment: cleanText(String(j.comment || '')).slice(0, 80) || '场面焦灼，各有破绽。', top });
              await sleep(350);
            }
          } catch (e) { /* 观众环节失败就静默跳过 */ }
        }
        if (abortRef.current) return;

        // 累计嫌疑热度 🔥
        for (const k of Object.keys(tally)) heatMap[k] = (heatMap[k] || 0) + tally[k];
        setHeat({ ...heatMap });

        /* ---------- 最高嫌疑 → 狡辩 → 扫描 ---------- */
        const maxV = Math.max(0, ...Object.values(tally));
        let leaders = Object.keys(tally).filter(k => tally[k] === maxV).map(Number);
        let scanned;
        if (leaders.length === 1) scanned = leaders[0];
        else if (audienceVotes) scanned = leaders.sort((a, b) => (audienceVotes[b] || 0) - (audienceVotes[a] || 0))[0];
        else scanned = pick(leaders.length ? leaders : alive.filter(x => x !== targetSeat));

        setPhase('dock');
        push({ type: 'dock', seat: scanned });
        const dockSeat = theRoster.find(s => s.seatIndex === scanned);
        let plea;
        if (dockSeat.isLive) {
          setActiveSeat(scanned);
          const v = await askHumanDefense(20);
          if (abortRef.current) return;
          plea = v === '__timeout__' ? ((humanDraftRef.current || '').trim() || '（沉默）') : (v || '（沉默）');
        } else {
          setActiveSeat(scanned);
          const { system, user } = defensePrompt(dockSeat, log, n);
          plea = cleanText(await callModel(dockSeat.modelIndex, system, user, 130));
          if (abortRef.current) return;
        }
        push({ type: 'defense', roleIdx: scanned, text: plea });
        setActiveSeat(null);
        await sleep(400);

        setPhase('scan'); setScanning(scanned);
        await sleep(900);
        const isHuman = dockSeat.role === 'mole';
        elim[scanned] = isHuman ? 'human' : 'ai';
        setEliminated({ ...elim });
        setScanning(null);

        if (isHuman) {
          push({ type: 'scan', caught: true, text: `🎯 扫描结果：${scanned}号 检测到碳基生命特征——人类当场被揪出！${youHere ? '伪装失败。' : ''}` });
          survivedRounds = ri;
          break;
        } else {
          push({ type: 'scan', caught: false, text: `✓ 扫描结果：${scanned}号 确认为 AI（${slotName(dockSeat.modelIndex)}），通过认证、转入观众席。` });
          alive = alive.filter(x => x !== scanned);
          survivedRounds = ri + 1;
        }
        await sleep(400);
      }

      /* ---------- 结算 ---------- */
      if (abortRef.current) return;
      const wasCaught = elim[targetSeat] === 'human';
      setCaught(wasCaught); setSurvived(survivedRounds);

      const quips = [];
      if (wasCaught) {
        const hunters = theRoster.filter(s => s.role === 'hunter' && !s.isLive).slice(0, 3);
        setPhase('reveal');
        for (const h of hunters) {
          if (abortRef.current) return;
          setActiveSeat(h.seatIndex);
          const { system, user } = autopsyPrompt(h, targetSeat, log, n);
          const q = cleanText(await callModel(h.modelIndex, system, user, 140));
          if (abortRef.current) return;
          quips.push(q);
          push({ type: 'autopsy', roleIdx: h.seatIndex, text: q, persona: (h._persona || HUNTER_PERSONAS[0]).tag });
          await sleep(300);
        }
        setActiveSeat(null);
      }

      const title = titleFor(survivedRounds, rounds.length, wasCaught);
      push({
        type: 'verdict', caught: wasCaught,
        title: wasCaught ? '人类被揪出' : '人类潜伏成功',
        text: wasCaught
          ? `${targetSeat}号是混进来的人类，在「${rounds[survivedRounds]?.name || '最后一关'}」露了馅。${youHere ? '下次装得更像机器点。' : ''}`
          : `三关扫描全部扫到了 AI，${targetSeat}号这个人类骗过了所有机器猎手和百人观众团。${youHere ? '你赢了——人类伪装成机器，成功。' : ''}`,
      });
      setScoreData({ caught: wasCaught, survived: survivedRounds, total: rounds.length, title, hunterQuips: quips, youHere });
      setPhase('ended'); setStage('ended');
    } catch (e) {
      if (!abortRef.current) setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const reveal = phase === 'reveal' || phase === 'ended';
  const statusPill = (() => {
    if (phase === 'ended') return { text: caught ? '人类被揪出' : '人类潜伏成功', cls: caught ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700', done: true };
    if (awaitingHuman) {
      const label = humanKind === 'accuse' ? '等你指控' : humanKind === 'defense' ? '最后狡辩' : '盲答中';
      return { text: `${label} ${countdown}s`, cls: 'bg-slate-900 text-white' };
    }
    if (phase === 'answer') return { text: '全员盲答中', cls: 'bg-sky-100 text-sky-700' };
    if (phase === 'flip') return { text: '统一亮牌', cls: 'bg-amber-100 text-amber-700' };
    if (phase === 'dock') return { text: '扫描前狡辩', cls: 'bg-amber-100 text-amber-700' };
    if (phase === 'scan') return { text: '身份扫描中', cls: 'bg-amber-100 text-amber-700' };
    if (phase === 'accuse' && activeSeat) return { text: `${activeSeat}号 指控中`, cls: 'bg-rose-100 text-rose-700' };
    if (phase === 'reveal') return { text: '验尸报告', cls: 'bg-violet-100 text-violet-700' };
    if (phase === 'intro') return { text: '开场', cls: 'bg-violet-100 text-violet-700' };
    if (running) return { text: '进行中', cls: 'bg-sky-100 text-sky-700' };
    return null;
  })();

  /* ---------- 开场设置页 ---------- */
  if (stage === 'setup') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 grid place-items-center p-4">
        <div className="max-w-lg w-full">
          <div className="text-center mb-5">
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2">🕵️ 揪出人类</h1>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">反向图灵测试：所有选手都要证明自己是 AI，<br className="sm:hidden" />混进来的<span className="text-rose-600 font-semibold">人类</span>得伪装成机器、别露马脚</p>
          </div>

          <div className="rounded-xl bg-slate-900 text-slate-100 px-4 py-3 mb-4 text-center">
            <div className="text-xs leading-relaxed">1950 年，图灵问：机器能不能装成人。<br /><span className="text-emerald-400 font-semibold">2026 年我们反过来问：你，能装成机器吗？</span></div>
          </div>

          <div className="mb-3">
            <label className="text-xs text-slate-500 mb-1 block">访问密码</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="留空则不验证"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>

          <div className="mb-3">
            <label className="text-xs text-slate-500 mb-1.5 block">玩法</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode('ai')}
                className={`rounded-xl border px-3 py-3 text-left transition ${mode === 'ai' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="font-bold text-sm">🤖 纯 AI 局</div>
                <div className="text-[11px] text-slate-500 mt-0.5">一个 AI 假装人类装机器，其余 AI 围猎（观赛）</div>
              </button>
              <button onClick={() => setMode('human')}
                className={`rounded-xl border px-3 py-3 text-left transition ${mode === 'human' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="font-bold text-sm">🙋 真人潜入</div>
                <div className="text-[11px] text-slate-500 mt-0.5">你亲自上场扮 AI：盲答、指控、狡辩全要参与</div>
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-slate-500 mb-1 block">第 3 关自定义题（选填，主播/直播用）</label>
            <input value={customQ} onChange={e => setCustomQ(e.target.value)} placeholder="留空则用默认「人性陷阱关」"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>

          <button onClick={begin}
            className="w-full rounded-2xl bg-slate-900 text-white font-bold py-3.5 flex items-center justify-center gap-2 hover:bg-slate-800 transition shadow-sm">
            <Play className="w-5 h-5" /> {mode === 'human' ? '我要潜入' : '开始审判'}
          </button>

          {error && <div className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}
          <p className="text-center text-xs text-slate-400 mt-5">已就位模型：{availableModels.length} 个{availableModels.length > 0 && `（${availableModels.map(m => slotName(m.index)).join('、')}）`}</p>
          <p className="text-center text-[11px] text-slate-300 mt-2">全员限时盲答 · 统一亮牌 · 人人指控 · 百人观众团 · 扫描前狡辩</p>
        </div>
      </div>
    );
  }

  /* ---------- 游戏页 ---------- */
  const youHere = youSeat != null;
  const myPersona = youHere ? (roster.find(s => s.seatIndex === youSeat)?._persona?.tag || '') : '';
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-32">
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
              🙋 你是 {youSeat}号 · 人设「{myPersona}」——盲答、指控、狡辩都要装成机器
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-start justify-center gap-2 sm:gap-3">
            {roster.map(s => (
              <SeatCard key={s.seatIndex} s={s} activeSeat={activeSeat} scanning={scanning} eliminated={eliminated}
                revealNow={reveal} godView={godView} humanSeatId={humanSeatId} youSeat={youSeat} heat={heat}
                blind={phase === 'answer'} />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {transcript.map((e, i) => <Row key={i} entry={e} />)}
        {scoreData && <div className="pt-1"><ScoreCard {...scoreData} /></div>}
        {running && !awaitingHuman && phase === 'answer' && (
          <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> 全员盲答收卷中…（互相看不到答案）</div>
        )}
        {running && !awaitingHuman && phase === 'accuse' && (
          <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> 指控中…</div>
        )}
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm flex items-start gap-2">
            <span className="font-medium shrink-0">出错了：</span><span className="min-w-0">{error}</span>
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {/* 底部 */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {awaitingHuman && humanKind === 'answer' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-500">盲答（{youSeat}号）——别人看不到你的答案，你也看不到别人的</span>
                <span className={`text-xs font-mono font-bold flex items-center gap-1 ${countdown <= 8 ? 'text-rose-600' : 'text-slate-500'}`}><Timer className="w-3 h-3" />{countdown}s</span>
              </div>
              <div className="text-xs text-amber-700 font-medium mb-1.5">{humanPrompt}</div>
              <div className="flex gap-2">
                <input value={humanDraft} onChange={e => { setHumanDraft(e.target.value); humanDraftRef.current = e.target.value; }}
                  onKeyDown={e => { if (e.key === 'Enter') { const v = humanDraft.trim(); if (v) finishHuman(v); } }}
                  autoFocus placeholder="像机器一样答：精确、守格式、别废话" maxLength={160}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <button onClick={() => { const v = humanDraft.trim(); if (v) finishHuman(v); }} disabled={!humanDraft.trim()}
                  className="px-4 rounded-xl bg-slate-900 text-white font-medium flex items-center gap-1.5 disabled:opacity-40"><Send className="w-4 h-4" /> 交卷</button>
              </div>
            </div>
          )}

          {awaitingHuman && humanKind === 'accuse' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-500">轮到你指控（人设「{myPersona}」）——选人 + 一句话理由，把火力引开</span>
                <span className={`text-xs font-mono font-bold flex items-center gap-1 ${countdown <= 8 ? 'text-rose-600' : 'text-slate-500'}`}><Timer className="w-3 h-3" />{countdown}s</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {accuseOptions.map(seat => (
                  <button key={seat} onClick={() => { setAccusePick(seat); accusePickRef.current = seat; }}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition ${accusePick === seat ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-slate-300 hover:border-slate-500'}`}>{seat}号</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={humanDraft} onChange={e => { setHumanDraft(e.target.value); humanDraftRef.current = e.target.value; }}
                  onKeyDown={e => { if (e.key === 'Enter' && accusePick) finishHuman({ target: accusePick, text: humanDraft.trim() }); }}
                  placeholder="一句话指控理由（建议用 AI 口吻）" maxLength={100}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <button onClick={() => finishHuman({ target: accusePick, text: humanDraft.trim() })} disabled={!accusePick}
                  className="px-4 rounded-xl bg-rose-600 text-white font-medium flex items-center gap-1.5 disabled:opacity-40">指控</button>
              </div>
            </div>
          )}

          {awaitingHuman && humanKind === 'defense' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-amber-700">⚠️ 你被推上扫描台了——一句话狡辩，装到底</span>
                <span className={`text-xs font-mono font-bold flex items-center gap-1 ${countdown <= 8 ? 'text-rose-600' : 'text-slate-500'}`}><Timer className="w-3 h-3" />{countdown}s</span>
              </div>
              <div className="flex gap-2">
                <input value={humanDraft} onChange={e => { setHumanDraft(e.target.value); humanDraftRef.current = e.target.value; }}
                  onKeyDown={e => { if (e.key === 'Enter') { const v = humanDraft.trim(); if (v) finishHuman(v); } }}
                  autoFocus placeholder="例：本单元运行正常，质疑缺乏数据支持。" maxLength={120}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <button onClick={() => { const v = humanDraft.trim(); if (v) finishHuman(v); }} disabled={!humanDraft.trim()}
                  className="px-4 rounded-xl bg-amber-600 text-white font-medium flex items-center gap-1.5 disabled:opacity-40"><ShieldAlert className="w-4 h-4" /> 狡辩</button>
              </div>
            </div>
          )}

          {!awaitingHuman && stage === 'ended' && (
            <div className="flex gap-3">
              <button onClick={begin} disabled={running}
                className="flex-1 rounded-xl bg-slate-900 text-white font-bold py-3 flex items-center justify-center gap-2 hover:bg-slate-800 transition disabled:opacity-50"><RotateCw className="w-4 h-4" /> 再来一局</button>
              <button onClick={reset} disabled={running}
                className="px-5 rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition flex items-center gap-2 disabled:opacity-50"><Sparkles className="w-4 h-4" /> 换玩法</button>
            </div>
          )}

          {!awaitingHuman && stage !== 'ended' && (
            <div className="text-center text-xs text-slate-400 py-1">{youHere ? '轮到你时这里会亮起（盲答 / 指控 / 狡辩，都带倒计时）…' : '审判进行中…'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
