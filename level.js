const { PermissionFlagsBits: P, ChannelType: T } = require('discord.js');
const db = require('../db');
const { cmd, embed, EPH, progress, syncLevelRoles } = require('../utils');

module.exports = [
  {
    data: cmd('rank', 'Zeigt Level und XP eines Users')
      .addUserOption(o => o.setName('user').setDescription('Welcher User? (Standard: du)')),
    async execute(i) {
      const u = i.options.getUser('user') ?? i.user;
      if (u.bot) return i.reply({ content: 'Bots sammeln keine XP 🤖', ...EPH });
      const row = db.getUser(i.guild.id, u.id);
      const p = progress(row.xp);
      const filled = Math.round((p.cur / p.need) * 12);
      const e = embed(`📊 Rang von ${u.username}`)
        .setThumbnail(u.displayAvatarURL())
        .addFields(
          { name: 'Level', value: `${p.level}`, inline: true },
          { name: 'Rang', value: `#${db.rankOf(i.guild.id, row.xp)}`, inline: true },
          { name: 'XP gesamt', value: `${row.xp}`, inline: true },
          { name: `Fortschritt ${p.cur}/${p.need}`, value: '▰'.repeat(filled) + '▱'.repeat(12 - filled) },
        );
      await i.reply({ embeds: [e] });
    },
  },
  {
    data: cmd('leaderboard', 'Zeigt die Top 10 des Servers'),
    async execute(i) {
      const rows = db.top(i.guild.id, 10);
      if (!rows.length) return i.reply({ content: 'Noch niemand hat XP gesammelt – schreib los! 💬', ...EPH });
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((r, n) => `${medals[n] ?? `**${n + 1}.**`} <@${r.user_id}> – Level **${progress(r.xp).level}** · ${r.xp} XP`);
      await i.reply({ embeds: [embed(`🏆 Leaderboard – ${i.guild.name}`, lines.join('\n'))], allowedMentions: { parse: [] } });
    },
  },
  {
    data: cmd('levelrole', 'Verknüpft Rollen mit Leveln', P.ManageRoles)
      .addSubcommand(s => s.setName('add').setDescription('Rolle für ein Level festlegen')
        .addIntegerOption(o => o.setName('level').setDescription('Ab welchem Level?').setMinValue(1).setMaxValue(500).setRequired(true))
        .addRoleOption(o => o.setName('rolle').setDescription('Welche Rolle?').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Level-Rolle entfernen')
        .addIntegerOption(o => o.setName('level').setDescription('Für welches Level?').setMinValue(1).setMaxValue(500).setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('Alle Level-Rollen anzeigen')),
    async execute(i) {
      const g = i.guild;
      const sub = i.options.getSubcommand();
      if (sub === 'add') {
        const role = i.options.getRole('rolle');
        if (role.managed || role.id === g.id) return i.reply({ content: '❌ Diese Rolle kann nicht vergeben werden.', ...EPH });
        if (role.position >= g.members.me.roles.highest.position) return i.reply({ content: '❌ Die Rolle liegt über meiner höchsten Rolle.', ...EPH });
        db.addLevelRole(g.id, i.options.getInteger('level'), role.id);
        return i.reply({ content: `✅ ${role} ab Level **${i.options.getInteger('level')}**.`, allowedMentions: { parse: [] }, ...EPH });
      }
      if (sub === 'remove') {
        const ok = db.removeLevelRole(g.id, i.options.getInteger('level'));
        return i.reply({ content: ok ? '✅ Level-Rolle entfernt.' : 'Für dieses Level gibt es keine Rolle.', ...EPH });
      }
      const rows = db.getLevelRoles(g.id);
      return i.reply({ embeds: [embed('🎖️ Level-Rollen', rows.length ? rows.map(r => `Level **${r.level}** → <@&${r.role_id}>`).join('\n') : 'Noch keine Level-Rollen. Mit `/levelrole add` anlegen.')], allowedMentions: { parse: [] }, ...EPH });
    },
  },
  {
    data: cmd('levelchannel', 'Kanal für Level-Up-Nachrichten festlegen', P.ManageGuild)
      .addChannelOption(o => o.setName('kanal').setDescription('Ohne Angabe: Level-Ups erscheinen im jeweiligen Chat').addChannelTypes(T.GuildText, T.GuildAnnouncement)),
    async execute(i) {
      const ch = i.options.getChannel('kanal');
      db.setConfig(i.guild.id, 'level_channel', ch?.id ?? null);
      await i.reply({ content: ch ? `✅ Level-Ups erscheinen jetzt in ${ch}.` : '✅ Level-Ups erscheinen wieder im jeweiligen Chat.', ...EPH });
    },
  },
  {
    data: cmd('xp', 'XP eines Users verwalten', P.ManageGuild)
      .addSubcommand(s => s.setName('add').setDescription('XP hinzufügen')
        .addUserOption(o => o.setName('user').setDescription('Welcher User?').setRequired(true))
        .addIntegerOption(o => o.setName('menge').setDescription('Wie viele XP?').setMinValue(1).setMaxValue(1000000).setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('XP abziehen')
        .addUserOption(o => o.setName('user').setDescription('Welcher User?').setRequired(true))
        .addIntegerOption(o => o.setName('menge').setDescription('Wie viele XP?').setMinValue(1).setMaxValue(1000000).setRequired(true)))
      .addSubcommand(s => s.setName('set').setDescription('XP auf einen Wert setzen')
        .addUserOption(o => o.setName('user').setDescription('Welcher User?').setRequired(true))
        .addIntegerOption(o => o.setName('menge').setDescription('Neue XP-Gesamtzahl').setMinValue(0).setMaxValue(10000000).setRequired(true)))
      .addSubcommand(s => s.setName('reset').setDescription('XP auf 0 zurücksetzen')
        .addUserOption(o => o.setName('user').setDescription('Welcher User?').setRequired(true))),
    async execute(i) {
      const m = i.options.getMember('user');
      if (!m || m.user.bot) return i.reply({ content: '❌ Gültiger User auf dem Server nötig.', ...EPH });
      const sub = i.options.getSubcommand();
      const amount = i.options.getInteger('menge') ?? 0;
      const row = db.getUser(i.guild.id, m.id);
      let xp = row.xp;
      if (sub === 'add') xp += amount;
      else if (sub === 'remove') xp -= amount;
      else if (sub === 'set') xp = amount;
      else xp = 0;
      xp = Math.max(0, xp);
      db.setXp(i.guild.id, m.id, xp, row.last_msg);
      const level = progress(xp).level;
      await i.deferReply(EPH);
      await syncLevelRoles(i.guild, m, level);
      await i.editReply(`✅ ${m} hat jetzt **${xp} XP** (Level **${level}**).`);
    },
  },
];
