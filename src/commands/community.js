const { PermissionFlagsBits: P, ChannelType: T, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const { cmd, embed, nl, EPH, sendLog } = require('../utils');

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
const textChannel = o => o.addChannelTypes(T.GuildText, T.GuildAnnouncement);

module.exports = [
  {
    data: cmd('announce', 'Sendet eine Ankündigung als Embed', P.ManageMessages)
      .addChannelOption(o => textChannel(o.setName('kanal').setDescription('Ziel-Kanal').setRequired(true)))
      .addStringOption(o => o.setName('nachricht').setDescription('Text (\\n = Zeilenumbruch)').setRequired(true).setMaxLength(2000))
      .addStringOption(o => o.setName('titel').setDescription('Titel der Ankündigung').setMaxLength(200))
      .addStringOption(o => o.setName('ping').setDescription('Wen pingen?').addChoices({ name: '@everyone', value: 'everyone' }, { name: '@here', value: 'here' }, { name: 'Niemanden', value: 'none' })),
    async execute(i) {
      const ch = i.options.getChannel('kanal');
      const ping = i.options.getString('ping') ?? 'none';
      if (ping !== 'none' && !i.memberPermissions.has(P.MentionEveryone)) return i.reply({ content: '❌ Dir fehlt die Berechtigung, @everyone/@here zu pingen.', ...EPH });
      const e = embed(i.options.getString('titel') ?? '📢 Ankündigung', nl(i.options.getString('nachricht'))).setFooter({ text: `Von ${i.user.username}` });
      await ch.send({ content: ping === 'none' ? undefined : `@${ping}`, embeds: [e], allowedMentions: { parse: ping === 'none' ? [] : ['everyone'] } });
      await i.reply({ content: `✅ Ankündigung in ${ch} gesendet.`, ...EPH });
      sendLog(i.guild, embed('📢 Ankündigung', `${i.user} in ${ch}`));
    },
  },
  {
    data: (() => {
      const b = cmd('poll', 'Startet eine Umfrage mit Reaktionen', P.ManageMessages)
        .addStringOption(o => o.setName('frage').setDescription('Die Frage').setRequired(true).setMaxLength(250));
      for (let n = 1; n <= 5; n++) b.addStringOption(o => o.setName(`option${n}`).setDescription(`Antwort ${n}`).setMaxLength(100).setRequired(n <= 2));
      return b;
    })(),
    async execute(i) {
      const opts = [1, 2, 3, 4, 5].map(n => i.options.getString(`option${n}`)).filter(Boolean);
      const e = embed(`📊 ${i.options.getString('frage')}`, opts.map((o, n) => `${NUM[n]} ${o}`).join('\n\n')).setFooter({ text: `Umfrage von ${i.user.username}` });
      await i.reply({ embeds: [e] });
      const msg = await i.fetchReply();
      for (let n = 0; n < opts.length; n++) await msg.react(NUM[n]).catch(() => {});
    },
  },
  {
    data: cmd('say', 'Lässt den Bot eine Nachricht senden', P.ManageMessages)
      .addStringOption(o => o.setName('nachricht').setDescription('Text (\\n = Zeilenumbruch)').setRequired(true).setMaxLength(2000))
      .addChannelOption(o => textChannel(o.setName('kanal').setDescription('Ziel-Kanal (Standard: aktueller Kanal)'))),
    async execute(i) {
      const ch = i.options.getChannel('kanal') ?? i.channel;
      await ch.send({ content: nl(i.options.getString('nachricht')), allowedMentions: { parse: [] } });
      await i.reply({ content: `✅ Gesendet in ${ch}.`, ...EPH });
      sendLog(i.guild, embed('💬 Say', `${i.user} in ${ch}:\n${i.options.getString('nachricht').slice(0, 500)}`));
    },
  },
  {
    data: cmd('zeitplan', 'Zeigt den Stream-Zeitplan oder ändert ihn')
      .addSubcommand(s => s.setName('anzeigen').setDescription('Zeigt den Stream-Zeitplan'))
      .addSubcommand(s => s.setName('setzen').setDescription('Setzt den Zeitplan (nur Mods)')
        .addStringOption(o => o.setName('plan').setDescription('Einträge mit | trennen, z.B. Mo 19:00 Chatting | Fr 20:00 Ranked').setRequired(true).setMaxLength(1500))
        .addStringOption(o => o.setName('twitch_link').setDescription('Link zu deinem Twitch-Kanal (https://twitch.tv/...)'))),
    async execute(i) {
      const g = i.guild.id;
      if (i.options.getSubcommand() === 'setzen') {
        if (!i.memberPermissions.has(P.ManageGuild)) return i.reply({ content: '❌ Dafür brauchst du die Berechtigung „Server verwalten“.', ...EPH });
        const link = i.options.getString('twitch_link');
        if (link && !/^https:\/\/(www\.)?twitch\.tv\/\S+$/i.test(link)) return i.reply({ content: '❌ Bitte einen gültigen Twitch-Link angeben.', ...EPH });
        db.setConfig(g, 'schedule', i.options.getString('plan').split('|').map(s => s.trim()).filter(Boolean).join('\n'));
        if (link) db.setConfig(g, 'twitch_url', link);
        return i.reply({ content: '✅ Zeitplan gespeichert. Anzeigen mit `/zeitplan anzeigen`.', ...EPH });
      }
      const cfg = db.getConfig(g);
      if (!cfg.schedule) return i.reply({ content: 'Noch kein Zeitplan gesetzt. Mods: `/zeitplan setzen`', ...EPH });
      const payload = { embeds: [embed('📅 Stream-Zeitplan', cfg.schedule.split('\n').map(l => `▸ ${l}`).join('\n'))] };
      if (cfg.twitch_url) payload.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Zu Twitch').setURL(cfg.twitch_url))];
      return i.reply(payload);
    },
  },
];
