const { PermissionFlagsBits: P, ChannelType: T, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const { cmd, embed, EPH, sendLog } = require('../utils');

const btn = (id, label, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
const show = id => (id ? `<#${id}>` : '—');

module.exports = [
  {
    data: cmd('setup', 'Richtet AstraBot automatisch auf diesem Server ein', P.Administrator),
    async execute(i) {
      await i.deferReply(EPH);
      const g = i.guild, me = g.members.me;
      let cfg = db.getConfig(g.id);
      const has = id => id && g.channels.cache.has(id);
      const made = [];
      const priv = [
        { id: g.id, deny: [P.ViewChannel] },
        { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ManageChannels] },
      ];
      const make = async (key, options, label) => {
        if (has(cfg[key])) return;
        const c = await g.channels.create({ ...options, reason: 'AstraBot Setup' });
        db.setConfig(g.id, key, c.id);
        cfg = db.getConfig(g.id);
        made.push(`${label}: ${c}`);
      };
      await make('log_channel', { name: 'astra-logs', type: T.GuildText, permissionOverwrites: priv, topic: 'AstraBot Logs' }, 'Logs (privat)');
      await make('level_channel', { name: 'level-ups', type: T.GuildText, topic: 'Level-Up-Nachrichten' }, 'Level-Ups');
      await make('ticket_category', { name: '🎫・Tickets', type: T.GuildCategory, permissionOverwrites: priv }, 'Ticket-Kategorie');
      await make('join_category', { name: '🔊・Talk', type: T.GuildCategory }, 'Talk-Kategorie');
      await make('join_channel', { name: '➕・Raum erstellen', type: T.GuildVoice, parent: cfg.join_category }, 'Join-to-create');
      const e = embed('✅ AstraBot eingerichtet', (made.length ? made.map(m => `• ${m}`).join('\n') : 'Alles war schon eingerichtet.') +
        '\n\n**Nächste Schritte**\n• `/ticket` – Ticket-Panel posten\n• `/voicepanel` – Panel für Sprachräume posten\n• `/levelrole add` – Belohnungen für Level\n• `/zeitplan setzen` – Stream-Zeitplan\n• `/config anzeigen` – alle Einstellungen\n\nDer Log-Kanal ist privat – gib deinem Mod-Team dort Zugriff.');
      await i.editReply({ embeds: [e] });
    },
  },
  {
    data: cmd('config', 'Zeigt oder ändert die Einstellungen', P.ManageGuild)
      .addSubcommand(s => s.setName('anzeigen').setDescription('Alle Einstellungen anzeigen'))
      .addSubcommand(s => s.setName('xp').setDescription('XP-System einstellen')
        .addBooleanOption(o => o.setName('aktiv').setDescription('XP-System an/aus'))
        .addIntegerOption(o => o.setName('min').setDescription('Minimale XP pro Nachricht').setMinValue(1).setMaxValue(100))
        .addIntegerOption(o => o.setName('max').setDescription('Maximale XP pro Nachricht').setMinValue(1).setMaxValue(100))
        .addIntegerOption(o => o.setName('cooldown').setDescription('Sekunden zwischen XP-Gewinnen').setMinValue(0).setMaxValue(3600)))
      .addSubcommand(s => s.setName('supportrolle').setDescription('Rolle, die Tickets sehen darf')
        .addRoleOption(o => o.setName('rolle').setDescription('Support-Rolle (leer = entfernen)'))),
    async execute(i) {
      const g = i.guild.id;
      const sub = i.options.getSubcommand();
      if (sub === 'xp') {
        const cfg = db.getConfig(g);
        const aktiv = i.options.getBoolean('aktiv'), min = i.options.getInteger('min') ?? cfg.xp_min, max = i.options.getInteger('max') ?? cfg.xp_max, cd = i.options.getInteger('cooldown');
        if (min > max) return i.reply({ content: '❌ „min“ darf nicht größer als „max“ sein.', ...EPH });
        if (aktiv !== null) db.setConfig(g, 'xp_enabled', aktiv ? 1 : 0);
        db.setConfig(g, 'xp_min', min); db.setConfig(g, 'xp_max', max);
        if (cd !== null) db.setConfig(g, 'xp_cooldown', cd);
      }
      if (sub === 'supportrolle') db.setConfig(g, 'ticket_role', i.options.getRole('rolle')?.id ?? null);
      const c = db.getConfig(g);
      const e = embed(`⚙️ Einstellungen – ${i.guild.name}`).addFields(
        { name: 'Logs', value: show(c.log_channel), inline: true },
        { name: 'Level-Kanal', value: c.level_channel ? show(c.level_channel) : 'im jeweiligen Chat', inline: true },
        { name: 'Support-Rolle', value: c.ticket_role ? `<@&${c.ticket_role}>` : '—', inline: true },
        { name: 'Ticket-Kategorie', value: show(c.ticket_category), inline: true },
        { name: 'Join-to-create', value: show(c.join_channel), inline: true },
        { name: 'Twitch', value: c.twitch_url ?? '—', inline: true },
        { name: 'XP-System', value: `${c.xp_enabled ? 'an' : 'aus'} · ${c.xp_min}–${c.xp_max} XP · ${c.xp_cooldown}s Cooldown` },
      );
      await i.reply({ embeds: [e], allowedMentions: { parse: [] }, ...EPH });
    },
  },
  {
    data: cmd('setlogs', 'Legt den Log-Kanal fest (leer = Logs aus)', P.ManageGuild)
      .addChannelOption(o => o.setName('kanal').setDescription('Kanal für Logs').addChannelTypes(T.GuildText)),
    async execute(i) {
      const ch = i.options.getChannel('kanal');
      db.setConfig(i.guild.id, 'log_channel', ch?.id ?? null);
      if (!ch) return i.reply({ content: '✅ Logs sind ausgeschaltet.', ...EPH });
      await i.reply({ content: `✅ Logs gehen jetzt nach ${ch}.`, ...EPH });
      sendLog(i.guild, embed('📝 Logs aktiviert', `Eingerichtet von ${i.user}.`));
    },
  },
  {
    data: cmd('ticket', 'Postet das Ticket-Panel', P.ManageGuild)
      .addChannelOption(o => o.setName('kanal').setDescription('Wo soll das Panel erscheinen? (Standard: hier)').addChannelTypes(T.GuildText))
      .addChannelOption(o => o.setName('kategorie').setDescription('Kategorie für neue Tickets').addChannelTypes(T.GuildCategory))
      .addRoleOption(o => o.setName('supportrolle').setDescription('Rolle, die Tickets sehen darf')),
    async execute(i) {
      const ch = i.options.getChannel('kanal') ?? i.channel;
      const cat = i.options.getChannel('kategorie'), role = i.options.getRole('supportrolle');
      if (cat) db.setConfig(i.guild.id, 'ticket_category', cat.id);
      if (role) db.setConfig(i.guild.id, 'ticket_role', role.id);
      await ch.send({
        embeds: [embed('🎫 Support & Hilfe', 'Du brauchst Hilfe oder hast ein Anliegen?\nKlicke auf den Button – es wird ein privates Ticket für dich und das Team erstellt.')],
        components: [new ActionRowBuilder().addComponents(btn('ticket:open', 'Ticket öffnen', '🎫', ButtonStyle.Primary))],
      });
      await i.reply({ content: `✅ Ticket-Panel in ${ch} gepostet.`, ...EPH });
    },
  },
  {
    data: cmd('joincreate', 'Join-to-create: Sprachkanal festlegen (leer = aus)', P.ManageChannels)
      .addChannelOption(o => o.setName('kanal').setDescription('Sprachkanal, der Räume erzeugt').addChannelTypes(T.GuildVoice))
      .addChannelOption(o => o.setName('kategorie').setDescription('Kategorie für die neuen Räume').addChannelTypes(T.GuildCategory)),
    async execute(i) {
      const g = i.guild.id;
      const ch = i.options.getChannel('kanal');
      if (!ch) { db.setConfig(g, 'join_channel', null); return i.reply({ content: '✅ Join-to-create ist ausgeschaltet.', ...EPH }); }
      const cat = i.options.getChannel('kategorie');
      db.setConfig(g, 'join_channel', ch.id);
      db.setConfig(g, 'join_category', cat?.id ?? ch.parentId ?? null);
      await i.reply({ content: `✅ Wer ${ch} betritt, bekommt einen eigenen Raum. Steuerung per \`/voicepanel\`.`, ...EPH });
    },
  },
  {
    data: cmd('voicepanel', 'Postet das Steuer-Panel für eigene Sprachräume', P.ManageGuild)
      .addChannelOption(o => o.setName('kanal').setDescription('Wo soll das Panel erscheinen? (Standard: hier)').addChannelTypes(T.GuildText)),
    async execute(i) {
      const ch = i.options.getChannel('kanal') ?? i.channel;
      await ch.send({
        embeds: [embed('🎙️ Sprachraum-Steuerung', 'Sei in **deinem** Sprachraum (Join-to-create) und nutze die Buttons:\n🔒 sperren · 🔓 öffnen · ✏️ umbenennen · 👥 Nutzerlimit')],
        components: [new ActionRowBuilder().addComponents(btn('voice:lock', 'Sperren', '🔒'), btn('voice:unlock', 'Öffnen', '🔓'), btn('voice:rename', 'Umbenennen', '✏️'), btn('voice:limit', 'Limit', '👥'))],
      });
      await i.reply({ content: `✅ Panel in ${ch} gepostet.`, ...EPH });
    },
  },
  {
    data: cmd('serverreset', 'Setzt ALLE AstraBot-Daten dieses Servers zurück', P.Administrator)
      .addBooleanOption(o => o.setName('kanaele_loeschen').setDescription('Auch die von AstraBot erstellten Kanäle löschen')),
    async execute(i) {
      if (i.user.id !== i.guild.ownerId) return i.reply({ content: '❌ Nur der Serverinhaber darf das.', ...EPH });
      const del = i.options.getBoolean('kanaele_loeschen') ? 1 : 0;
      await i.reply({
        embeds: [embed('⚠️ Server-Reset', `Das löscht **alle** AstraBot-Daten dieses Servers: Einstellungen, XP/Level, Level-Rollen, Verwarnungen.${del ? '\nZusätzlich werden Log-, Level-, Join- und Ticket-Kanäle/Kategorien gelöscht.' : ''}\n\n**Das kann nicht rückgängig gemacht werden.**`)],
        components: [new ActionRowBuilder().addComponents(btn(`reset:confirm:${i.user.id}:${del}`, 'Ja, zurücksetzen', '🗑️', ButtonStyle.Danger), btn(`reset:cancel:${i.user.id}:${del}`, 'Abbrechen', '✖️'))],
        ...EPH,
      });
    },
  },
  {
    data: cmd('help', 'Zeigt alle AstraBot-Befehle'),
    async execute(i) {
      const e = embed('💜 AstraBot – Befehle').addFields(
        { name: '🛡️ Moderation', value: '`/clear` `/kick` `/ban` `/timeout` `/warn` `/warnings`' },
        { name: '📣 Community', value: '`/announce` `/poll` `/say` `/zeitplan`' },
        { name: '📁 Kanäle', value: '`/lock` `/unlock` `/slowmode` `/format` `/glowup`' },
        { name: '📈 Level', value: '`/rank` `/leaderboard` `/levelrole` `/levelchannel` `/xp`' },
        { name: '⚙️ System', value: '`/setup` `/config` `/setlogs` `/ticket` `/joincreate` `/voicepanel` `/serverreset` `/help`' },
      );
      await i.reply({ embeds: [e], ...EPH });
    },
  },
];
