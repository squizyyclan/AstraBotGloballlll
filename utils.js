const { EmbedBuilder, SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const db = require('./db');

const COLOR = 0x9146ff; // Twitch-Lila
const EPH = { flags: MessageFlags.Ephemeral };

function embed(title, desc) {
  const e = new EmbedBuilder().setColor(COLOR).setFooter({ text: 'AstraBot' }).setTimestamp();
  if (title) e.setTitle(title);
  if (desc) e.setDescription(desc);
  return e;
}

const cmd = (name, description, perms = null) =>
  new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(perms);

const nl = s => s.replace(/\\n/g, '\n');

async function sendLog(guild, e) {
  const id = db.getConfig(guild.id).log_channel;
  const ch = id && guild.channels.cache.get(id);
  if (ch?.isTextBased()) ch.send({ embeds: [e] }).catch(() => {});
}

function hierarchyError(i, m) {
  const g = i.guild;
  if (m.id === i.user.id) return 'Das kannst du nicht bei dir selbst machen.';
  if (m.id === g.ownerId) return 'Der Serverinhaber kann nicht bestraft werden.';
  if (m.id === i.client.user.id) return 'Nette Idee 😉';
  if (i.user.id !== g.ownerId && i.member.roles.highest.position <= m.roles.highest.position) return 'Die höchste Rolle des Users ist nicht niedriger als deine.';
  if (g.members.me.roles.highest.position <= m.roles.highest.position) return 'Meine Rolle ist nicht hoch genug – schiebe die AstraBot-Rolle in den Servereinstellungen weiter nach oben.';
  return null;
}

// Level-Kurve (wie MEE6): XP für Level l -> l+1
const need = l => 5 * l * l + 50 * l + 100;
function progress(total) {
  let level = 0, cur = total;
  while (cur >= need(level)) { cur -= need(level); level++; }
  return { level, cur, need: need(level) };
}

async function syncLevelRoles(guild, member, level) {
  const me = guild.members.me;
  for (const r of db.getLevelRoles(guild.id)) {
    const role = guild.roles.cache.get(r.role_id);
    if (!role || role.managed || role.position >= me.roles.highest.position) continue;
    try {
      if (level >= r.level) { if (!member.roles.cache.has(role.id)) await member.roles.add(role, 'AstraBot Level'); }
      else if (member.roles.cache.has(role.id)) await member.roles.remove(role, 'AstraBot Level');
    } catch {}
  }
}

module.exports = { COLOR, EPH, embed, cmd, nl, sendLog, hierarchyError, progress, syncLevelRoles };
