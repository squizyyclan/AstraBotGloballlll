const { PermissionFlagsBits: P } = require('discord.js');
const db = require('../db');
const { cmd, embed, EPH, sendLog, hierarchyError } = require('../utils');

const dm = (user, text) => user.send(text).catch(() => {});
const reasonOpt = o => o.setName('grund').setDescription('Grund').setMaxLength(400);
const NO_REASON = 'Kein Grund angegeben';

module.exports = [
  {
    data: cmd('clear', 'Löscht Nachrichten im Kanal', P.ManageMessages)
      .addIntegerOption(o => o.setName('anzahl').setDescription('Wie viele Nachrichten (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
      .addUserOption(o => o.setName('user').setDescription('Nur Nachrichten dieses Users löschen')),
    async execute(i) {
      await i.deferReply(EPH);
      const n = i.options.getInteger('anzahl');
      const u = i.options.getUser('user');
      let deleted;
      if (u) {
        const msgs = (await i.channel.messages.fetch({ limit: 100 })).filter(m => m.author.id === u.id).first(n);
        deleted = msgs.length ? await i.channel.bulkDelete(msgs, true) : new Map();
      } else deleted = await i.channel.bulkDelete(n, true);
      await i.editReply(`🧹 ${deleted.size} Nachricht(en) gelöscht. (Nachrichten älter als 14 Tage kann Discord nicht löschen.)`);
      sendLog(i.guild, embed('🧹 Clear', `${i.user} löschte **${deleted.size}** Nachrichten in ${i.channel}${u ? ` von ${u}` : ''}.`));
    },
  },
  {
    data: cmd('kick', 'Wirft einen User vom Server', P.KickMembers)
      .addUserOption(o => o.setName('user').setDescription('Wer soll gekickt werden?').setRequired(true))
      .addStringOption(reasonOpt),
    async execute(i) {
      const m = i.options.getMember('user');
      const reason = i.options.getString('grund') ?? NO_REASON;
      if (!m) return i.reply({ content: '❌ User ist nicht auf dem Server.', ...EPH });
      const err = hierarchyError(i, m);
      if (err) return i.reply({ content: `❌ ${err}`, ...EPH });
      await dm(m.user, `👢 Du wurdest von **${i.guild.name}** gekickt.\nGrund: ${reason}`);
      await m.kick(`${reason} | ${i.user.tag}`);
      await i.reply({ embeds: [embed('👢 Kick', `**${m.user.tag}** wurde gekickt.\n**Grund:** ${reason}`)] });
      sendLog(i.guild, embed('👢 Kick', `${m.user} von ${i.user}\n**Grund:** ${reason}`));
    },
  },
  {
    data: cmd('ban', 'Bannt einen User vom Server', P.BanMembers)
      .addUserOption(o => o.setName('user').setDescription('Wer soll gebannt werden?').setRequired(true))
      .addStringOption(reasonOpt)
      .addIntegerOption(o => o.setName('nachrichten_loeschen').setDescription('Nachrichten der letzten X Tage löschen (0-7)').setMinValue(0).setMaxValue(7)),
    async execute(i) {
      const u = i.options.getUser('user');
      const m = i.options.getMember('user');
      const reason = i.options.getString('grund') ?? NO_REASON;
      const days = i.options.getInteger('nachrichten_loeschen') ?? 0;
      if (m) {
        const err = hierarchyError(i, m);
        if (err) return i.reply({ content: `❌ ${err}`, ...EPH });
        await dm(u, `🔨 Du wurdest von **${i.guild.name}** gebannt.\nGrund: ${reason}`);
      } else if (u.id === i.user.id) return i.reply({ content: '❌ Das kannst du nicht bei dir selbst machen.', ...EPH });
      await i.guild.members.ban(u, { reason: `${reason} | ${i.user.tag}`, deleteMessageSeconds: days * 86400 });
      await i.reply({ embeds: [embed('🔨 Ban', `**${u.tag}** wurde gebannt.\n**Grund:** ${reason}`)] });
      sendLog(i.guild, embed('🔨 Ban', `${u} von ${i.user}\n**Grund:** ${reason}`));
    },
  },
  {
    data: cmd('timeout', 'Setzt einen User in den Timeout (0 = aufheben)', P.ModerateMembers)
      .addUserOption(o => o.setName('user').setDescription('Wer bekommt den Timeout?').setRequired(true))
      .addIntegerOption(o => o.setName('minuten').setDescription('Dauer in Minuten (0 = aufheben, max. 40320)').setMinValue(0).setMaxValue(40320).setRequired(true))
      .addStringOption(reasonOpt),
    async execute(i) {
      const m = i.options.getMember('user');
      const min = i.options.getInteger('minuten');
      const reason = i.options.getString('grund') ?? NO_REASON;
      if (!m) return i.reply({ content: '❌ User ist nicht auf dem Server.', ...EPH });
      const err = hierarchyError(i, m);
      if (err) return i.reply({ content: `❌ ${err}`, ...EPH });
      await m.timeout(min ? min * 60000 : null, `${reason} | ${i.user.tag}`);
      const txt = min ? `**${m.user.tag}** ist für **${min} Min.** im Timeout.\n**Grund:** ${reason}` : `Timeout von **${m.user.tag}** aufgehoben.`;
      await i.reply({ embeds: [embed('⏳ Timeout', txt)] });
      sendLog(i.guild, embed('⏳ Timeout', `${m.user} von ${i.user}: ${min ? `${min} Min.` : 'aufgehoben'}\n**Grund:** ${reason}`));
    },
  },
  {
    data: cmd('warn', 'Verwarnt einen User', P.ModerateMembers)
      .addUserOption(o => o.setName('user').setDescription('Wer wird verwarnt?').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund der Verwarnung').setRequired(true).setMaxLength(400)),
    async execute(i) {
      const u = i.options.getUser('user');
      const reason = i.options.getString('grund');
      if (u.bot) return i.reply({ content: '❌ Bots kann man nicht verwarnen.', ...EPH });
      if (u.id === i.user.id) return i.reply({ content: '❌ Du kannst dich nicht selbst verwarnen.', ...EPH });
      const count = db.addWarn(i.guild.id, u.id, i.user.id, reason);
      await dm(u, `⚠️ Verwarnung auf **${i.guild.name}**\nGrund: ${reason}\n(Das ist deine ${count}. Verwarnung.)`);
      await i.reply({ embeds: [embed('⚠️ Verwarnung', `${u} wurde verwarnt (**${count}.** Verwarnung).\n**Grund:** ${reason}`)] });
      sendLog(i.guild, embed('⚠️ Warn', `${u} von ${i.user} (${count}.)\n**Grund:** ${reason}`));
    },
  },
  {
    data: cmd('warnings', 'Zeigt die Verwarnungen eines Users', P.ModerateMembers)
      .addUserOption(o => o.setName('user').setDescription('Welcher User?').setRequired(true)),
    async execute(i) {
      const u = i.options.getUser('user');
      const total = db.countWarns(i.guild.id, u.id);
      const rows = db.listWarns(i.guild.id, u.id);
      if (!rows.length) return i.reply({ content: `✅ ${u} hat keine Verwarnungen.`, ...EPH });
      const lines = rows.map(w => `**#${w.id}** · <t:${Math.floor(w.created_at / 1000)}:d> · von <@${w.mod_id}>\n${w.reason}`).join('\n\n');
      await i.reply({ embeds: [embed(`⚠️ Verwarnungen von ${u.username} (${total})`, lines)], ...EPH });
    },
  },
];
