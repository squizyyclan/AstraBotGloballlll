const db = require('./db');
const { progress, syncLevelRoles } = require('./utils');

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

async function handleMessageXp(msg) {
  if (!msg.guild || msg.author.bot || msg.system) return;
  const cfg = db.getConfig(msg.guild.id);
  if (!cfg.xp_enabled) return;
  const row = db.getUser(msg.guild.id, msg.author.id);
  const now = Date.now();
  if (now - row.last_msg < cfg.xp_cooldown * 1000) return;

  const total = row.xp + rnd(Math.min(cfg.xp_min, cfg.xp_max), Math.max(cfg.xp_min, cfg.xp_max));
  db.setXp(msg.guild.id, msg.author.id, total, now);

  const before = progress(row.xp).level, after = progress(total).level;
  if (after > before) {
    const member = msg.member ?? (await msg.guild.members.fetch(msg.author.id).catch(() => null));
    if (member) await syncLevelRoles(msg.guild, member, after);
    const ch = (cfg.level_channel && msg.guild.channels.cache.get(cfg.level_channel)) || msg.channel;
    ch.send({ content: `🎉 ${msg.author} ist jetzt **Level ${after}**!`, allowedMentions: { users: [msg.author.id] } }).catch(() => {});
  }
}

module.exports = { handleMessageXp };
