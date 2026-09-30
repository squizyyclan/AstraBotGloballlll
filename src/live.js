const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./db');
const { embed } = require('./utils');

const enabled = () => !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

// ---------- Twitch-API ----------
let token = null, tokenExp = 0;
async function getToken(force = false) {
  if (!force && token && Date.now() < tokenExp - 60000) return token;
  const r = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error(`Twitch-Token (${r.status}) – Client-ID/Secret prüfen`);
  const j = await r.json();
  token = j.access_token;
  tokenExp = Date.now() + j.expires_in * 1000;
  return token;
}

async function helix(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`https://api.twitch.tv/helix${path}`, {
      headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${await getToken(attempt > 0)}` },
    });
    if (r.status === 401 && attempt === 0) continue;
    if (!r.ok) throw new Error(`Twitch-API ${r.status}`);
    return (await r.json()).data;
  }
}

const profiles = new Map();
async function userExists(login) {
  const c = profiles.get(login);
  if (c && Date.now() - c.t < 3600000) return c.d;
  const d = (await helix(`/users?login=${encodeURIComponent(login)}`))[0] ?? null;
  profiles.set(login, { t: Date.now(), d });
  return d;
}

function parseLogin(input = '') {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?(?:twitch\.tv\/)?@?([A-Za-z0-9_]{3,25})\/?(?:[?#].*)?$/);
  return m ? m[1].toLowerCase() : null;
}

// ---------- Benachrichtigung ----------
async function notify(client, row, s) {
  const cfg = db.getConfig(row.guild_id);
  if (!cfg.live_channel) return false;
  const ch = client.channels.cache.get(cfg.live_channel) ?? (await client.channels.fetch(cfg.live_channel).catch(() => null));
  if (!ch?.isTextBased()) return false;

  const url = `https://twitch.tv/${s.user_login}`;
  const p = await userExists(row.login).catch(() => null);
  const e = embed(`🔴 ${s.user_name} ist LIVE!`, `**${s.title || 'Kein Titel'}**`)
    .setURL(url)
    .addFields({ name: 'Kategorie', value: s.game_name || '—', inline: true }, { name: 'Zuschauer', value: `${s.viewer_count}`, inline: true })
    .setImage(`${s.thumbnail_url.replace('{width}', '440').replace('{height}', '248')}?t=${Date.now()}`);
  if (p?.profile_image_url) e.setThumbnail(p.profile_image_url);

  const ping = cfg.live_everyone ? '@everyone ' : cfg.live_role ? `<@&${cfg.live_role}> ` : '';
  await ch.send({
    content: `${ping}**${s.user_name}** ist jetzt live! 💜`,
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Stream ansehen').setURL(url))],
    allowedMentions: { parse: cfg.live_everyone ? ['everyone'] : [], roles: cfg.live_role && !cfg.live_everyone ? [cfg.live_role] : [] },
  }).catch(err => console.error('live send:', err.message));
  return true;
}

// ---------- Abfrage-Schleife ----------
async function poll(client) {
  const rows = db.allStreamers().filter(r => client.guilds.cache.has(r.guild_id));
  if (!rows.length) return;
  const logins = [...new Set(rows.map(r => r.login))];
  const liveNow = new Map();
  for (let n = 0; n < logins.length; n += 100) {
    const qs = logins.slice(n, n + 100).map(l => `user_login=${encodeURIComponent(l)}`).join('&');
    for (const s of await helix(`/streams?first=100&${qs}`)) if (s.type === 'live') liveNow.set(s.user_login.toLowerCase(), s);
  }
  for (const row of rows) {
    const s = liveNow.get(row.login);
    if (s) {
      if (!row.live) { if (await notify(client, row, s)) db.setStreamerState(row.guild_id, row.login, 1, 0, s.id); }
      else if (row.misses) db.setStreamerState(row.guild_id, row.login, 1, 0, s.id);
    } else if (row.live) {
      // 3 Abfragen in Folge offline = Stream beendet (verhindert Doppel-Meldungen bei kurzen Aussetzern)
      const misses = row.misses + 1;
      db.setStreamerState(row.guild_id, row.login, misses >= 3 ? 0 : 1, misses >= 3 ? 0 : misses, row.stream_id);
    }
  }
}

let running = false;
function startLive(client) {
  if (!enabled()) return console.log('ℹ️ Live-Benachrichtigungen aus (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET fehlen)');
  const tick = async () => {
    if (running) return;
    running = true;
    try { await poll(client); } catch (e) { console.error('live poll:', e.message); } finally { running = false; }
  };
  setTimeout(tick, 10000);
  setInterval(tick, 60000);
  console.log('📡 Live-Benachrichtigungen aktiv (Abfrage alle 60 s)');
}

module.exports = { enabled, userExists, parseLogin, startLive };
