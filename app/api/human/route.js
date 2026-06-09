// 后端代理：支持最多 6 个 OpenAI 兼容的模型槽位（PLAYER_1 ~ PLAYER_6）
// 每个槽位独立配置 BASE_URL / API_KEY / MODEL / DISPLAY_NAME
// 前端传 playerIndex(1-6) 指定用哪一家模型
//
// OpenAI 兼容格式：DeepSeek / 智谱GLM / 通义 / 文心 / Kimi / 豆包 / OpenAI 等都支持
// 使用 Edge Runtime

export const runtime = 'edge';

function getEnv(key) {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {}
  return undefined;
}

// 清洗模型泄漏到正文的思考内容。
// allowLong=false（发言/投票/遗言，要简短一句）：剥思考标签 + 砍掉分析腔只留最后一句。
// allowLong=true（赛后讨论，本就该 2-3 句）：只剥思考标签，不做"取最后一句"的截断，保留完整多句。
function stripReasoning(raw, allowLong) {
  if (!raw) return '';
  let t = raw;
  // 1) 标准思考标签块 <think>...</think> / <reasoning>...</reasoning>
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  // 2) MiniMax 的非标准变体：(think)...(/think) 或 （think）等圆括号形式
  t = t.replace(/[(（]think[)）][\s\S]*?[(（]\/think[)）]/gi, '');
  // 3) 只有结束标签的情况：思考在前、真正内容在 </think> 或 (/think) 之后
  //    取最后一个结束标签后面的内容作为真正回复
  const endTagMatch = t.match(/(?:<\/think>|<\/reasoning>|[(（]\/think[)）])(?![\s\S]*(?:<\/think>|[(（]\/think[)）]))/i);
  if (endTagMatch && typeof endTagMatch.index === 'number') {
    const after = t.slice(endTagMatch.index + endTagMatch[0].length).trim();
    if (after) t = after; // 结束标签后有内容，用它
  }
  // 4) 残留的孤立标签清掉
  t = t.replace(/<\/?think>/gi, '').replace(/<\/?reasoning>/gi, '').replace(/[(（]\/?think[)）]/gi, '');
  // 5) 仅"要简短一句"的场景，才砍分析腔取最后一句
  if (!allowLong) {
    const analysisOpeners = /^(让我(先)?分析|我来分析|思考[:：]|分析[:：]|首先[，,]|让我想想|我需要判断|the user|user wants|let me)/i;
    // 仅当正文异常长(>200字，疑似整段思考泄漏进来)才"砍到最后一句"抢救；
    //   正常短发言(就算以"首先,"开口)一律不动，避免误砍真发言。
    if (t.trim().length > 200 && analysisOpeners.test(t.trim())) {
      const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
      if (lines.length > 1) t = lines[lines.length - 1];
    }
  }
  return t.trim();
}

// 发送前消毒（仅 MiniMax 用）。
// MiniMax 国内端（api.minimaxi.com）内容审核较严，会把 prompt 里"自杀/自爆"这类
// 纯比喻、对游戏无用的高危词判成敏感（HTTP 422 / input new_sensitive 1026），整轮拒绝生成。
// 这里仅把发给 MiniMax 的 system/user 里这些词替换成中性说法——
// 不改游戏逻辑、不动其它五家（它们对原词不敏感，照常发送）。
function sanitizeForMiniMax(s) {
  return (s || '')
    .replace(/自爆/g, '自曝')       // “自曝”更贴切，也避开爆炸类过滤
    .replace(/自杀/g, '直接露馅')    // 去掉头号高危词“自杀”
    .replace(/打死都不/g, '绝对不');  // “打死”虽是俗语，一并避开
}

// 读取第 i 个玩家槽位的配置（i: 1-6）
function getPlayerConfig(i) {
  const baseUrl = getEnv(`PLAYER_${i}_BASE_URL`);
  const apiKey = getEnv(`PLAYER_${i}_API_KEY`);
  const model = getEnv(`PLAYER_${i}_MODEL`);
  const displayName = getEnv(`PLAYER_${i}_DISPLAY_NAME`) || `模型${i}`;
  return { baseUrl, apiKey, model, displayName };
}

// GET：返回已配置的模型列表（前端用来知道有几家可用、各叫什么）
export async function GET() {
  const players = [];
  for (let i = 1; i <= 6; i++) {
    const c = getPlayerConfig(i);
    players.push({
      index: i,
      displayName: c.displayName,
      configured: !!(c.baseUrl && c.apiKey && c.model),
    });
  }
  return new Response(JSON.stringify({ players }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

const PASSWORD = () => getEnv('ACCESS_PASSWORD');

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: { message: '请求格式错误' } }, 400);
  }

  // 访问密码校验（可选）
  const pw = PASSWORD();
  if (pw && body.password !== pw) {
    return json({ error: { message: '访问密码错误' } }, 401);
  }

  const { playerIndex, system, user, maxTokens, allowLong } = body;
  const idx = parseInt(playerIndex);
  if (!idx || idx < 1 || idx > 6) {
    return json({ error: { message: 'playerIndex 必须是 1-6' } }, 400);
  }

  const cfg = getPlayerConfig(idx);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    return json({ error: { message: `模型槽位 ${idx} 未配置完整（需要 BASE_URL / API_KEY / MODEL）` } }, 400);
  }

  const bu = (cfg.baseUrl || '').toLowerCase();

  // MiniMax 国内端审核严：仅对发给它的内容做发送前消毒；其它家原样发送。
  const sys = bu.includes('minimax') ? sanitizeForMiniMax(system) : system;
  const usr = bu.includes('minimax') ? sanitizeForMiniMax(user) : user;

  // 组装 OpenAI 兼容请求
  const messages = [];
  if (sys) messages.push({ role: 'system', content: sys });
  messages.push({ role: 'user', content: usr });

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;

  // 基础请求体
  const reqBody = {
    model: cfg.model,
    messages,
    max_tokens: maxTokens || 300,
    temperature: 0.9, // 默认 0.9，让发言更有个性、更有张力、更好玩
    stream: false,
  };

  // Kimi（moonshot）强制只允许 temperature=0.6，给高会报 400，单独降下来
  if (bu.includes('moonshot')) {
    reqBody.temperature = 0.6;
  }
  if (bu.includes('bigmodel')) {
    // 智谱 GLM
    reqBody.thinking = { type: 'disabled' };
  } else if (bu.includes('dashscope')) {
    // 通义千问
    reqBody.enable_thinking = false;
  } else if (bu.includes('volces') || bu.includes('ark')) {
    // 豆包（火山方舟）：thinking 字段
    reqBody.thinking = { type: 'disabled' };
  } else if (bu.includes('moonshot')) {
    // Kimi（月之暗面）：kimi-k2.5/k2.6 默认开思考，需显式关闭，否则会超时
    reqBody.thinking = { type: 'disabled' };
  }
  // MiniMax（M3）：关思考。M3 不同于 M2.7——官方支持 thinking:{type:'disabled'} 真正关闭思考。
  //   关掉后它不再生成 <think> 推理（推理模型在 OpenAI 兼容端会把思考以 <think> 注入 content），
  //   直接吐那句话：既快（不会再像开思考那样想太久触发 504 超时），又短（小预算够、不返回空）。
  //   （system/user 已在上面消毒，规避国内端审核 1026）
  if (bu.includes('minimax')) {
    reqBody.thinking = { type: 'disabled' };
    reqBody.max_tokens = 512; // 关思考后答案很短，512 绰绰有余、留点余量以防万一
  }
  // DeepSeek：不加额外参数（deepseek-chat 非推理模型）

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 200); } catch (e) {}
      return json({ error: { message: `模型${idx} 请求失败 (HTTP ${resp.status}) ${detail}` } }, 502);
    }

    const data = await resp.json();
    const msg = data?.choices?.[0]?.message || {};
    let text = (msg.content || '').trim();
    // content 为空时的兜底：M3 偶尔把答案放进 reasoning 字段（或思考占满预算后
    //   答案残留在那里）。从 reasoning_content / reasoning_details 里捞出来，
    //   再交给 stripReasoning 清洗（去思考标签、必要时取最后一句）。
    if (!text) {
      const r = msg.reasoning_content
        || (Array.isArray(msg.reasoning_details) && msg.reasoning_details[0] && msg.reasoning_details[0].text)
        || '';
      text = String(r).trim();
    }
    // 清洗模型可能泄漏到正文里的思考内容
    text = stripReasoning(text, allowLong);
    return json({ text, displayName: cfg.displayName, model: cfg.model });
  } catch (e) {
    return json({ error: { message: `模型${idx} 网络错误：${e.message}` } }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
