const { PermissionFlagsBits: P, ChannelType: T, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const { cmd, embed, EPH, sendLog, voicePanel } = require('../utils');
const live = require('../live');
 
const btn = (id, label, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
const show = id => (id ? `<#${id}>` : '—');
 
// ---------- Server-Vorlage für /setup ----------
const LAYOUT = [
  { name: '📌・INFO', access: 'public', channels: [
    { name: '👋・willkommen', ro: true, ref: 'welcome' },
    { name: '📜・regeln', ro: true, ref: 'rules' },
    { name: '📢・ankündigungen', ro: true },
    { name: '📅・zeitplan', ro: true, ref: 'schedule' },
  ] },
  { name: '🔴・TWITCH', access: 'public', channels: [
    { name: '🔴・live-benachrichtigung', ro: true, key: 'live_channel' },
    { name: '🎬・clips-und-highlights' },
    { name: '💡・stream-vorschläge' },
  ] },
  { name: '💬・COMMUNITY', access: 'public', channels: [
    { name: '💬・allgemein', ref: 'chat' },
    { name: '😂・memes' },
    { name: '🎮・gaming' },
    { name: '🎨・kunst-und-bilder' },
    { name: '🤖・bot-befehle' },
    { name: '📈・level-ups', ro: true, key: 'level_channel' },
  ] },
  { name: '🔊・TALK', access: 'public', key: 'join_category', channels: [
    { name: '➕・Raum erstellen', voice: true, key: 'join_channel' },
    { name: '🔊・Lounge', voice: true },
    { name: '🎮・Gaming 1', voice: true },
    { name: '🎮・Gaming 2', voice: true },
    { name: '🎵・Musik', voice: true },
    { name: '💤・AFK', voice: true },
  ] },
  { name: '💜・SUBSCRIBER', access: 'sub', channels: [
    { name: '💜・sub-chat' },
    { name: '💜・Sub-Lounge', voice: true },
  ] },
  { name: '🎫・SUPPORT', access: 'public', channels: [
    { name: '🎫・ticket-erstellen', ro: true, ref: 'ticket' },
  ] },
  { name: '🎫・Tickets', access: 'tickets', key: 'ticket_category', channels: [] },
  { name: '👮・TEAM', access: 'team', channels: [
    { name: '👮・mod-chat' },
    { name: '📝・astra-logs', key: 'log_channel' },
    { name: '👮・Team-Voice', voice: true },
  ] },
];
 
const RULES = [
  '**1. Respekt zuerst** – keine Beleidigungen, kein Hass, keine Diskriminierung.',
  '**2. Kein Spam** – keine Flut-Nachrichten, keine unerlaubte Werbung oder Fremd-Links.',
  '**3. Keine unangemessenen Inhalte** – kein NSFW, nichts Illegales, keine Gewaltdarstellungen.',
  '**4. Bleib beim Thema** – nutze die Kanäle für ihren Zweck.',
  '**5. Team-Anweisungen befolgen** – Moderatoren haben das letzte Wort.',
  '**6. Die Regeln von Discord und Twitch gelten auch hier.**',
].join('\n\n');
 
function mergeOw(list) {
  const m = new Map();
  for (const o of list) {
    const e = m.get(o.id) ?? { id: o.id, allow: [], deny: [] };
    e.allow.push(...(o.allow ?? []));
    e.deny.push(...(o.deny ?? []));
    m.set(o.id, e);
  }
  return [...m.values()];
}
 
module.exports = [
  {
    data: cmd('setup', 'Baut den kompletten Twitch-Community-Server auf', P.Administrator),
    async execute(i) {
      await i.deferReply(EPH);
      const g = i.guild, me = g.members.me, reason = 'AstraBot Setup';
 
      const need = [['ManageChannels', 'Kanäle verwalten'], ['ManageRoles', 'Rollen verwalten'], ['ViewChannel', 'Kanäle ansehen'], ['SendMessages', 'Nachrichten senden'], ['EmbedLinks', 'Links einbetten']];
      const missing = need.filter(([k]) => !me.permissions.has(P[k])).map(([, n]) => n);
      if (missing.length) return i.editReply(`❌ Mir fehlen Berechtigungen: **${missing.join(', ')}**.\nGib der Rolle „AstraBot“ diese Rechte (oder Administrator) und führe \`/setup\` erneut aus.`);
 
      let cfg = db.getConfig(g.id);
      const failed = [];
      let newCh = 0, newRoles = 0;
 
      // --- Rollen ---
      const mkRole = async (name, color, perms, hoist) => {
        const ex = g.roles.cache.find(r => r.name === name);
        if (ex) return ex;
        try { const r = await g.roles.create({ name, color, permissions: perms, hoist, reason }); newRoles++; return r; }
        catch (e) { failed.push(`Rolle ${name}: ${e.message}`); return null; }
      };
      const mod = await mkRole('👮 Moderator', 0x2ecc71, [P.ManageMessages, P.ModerateMembers, P.KickMembers, P.MuteMembers, P.DeafenMembers, P.MoveMembers, P.ManageNicknames, P.ViewAuditLog], true);
      const vip = await mkRole('⭐ VIP', 0xf1c40f, [], true);
      const sub = await mkRole('💜 Subscriber', 0x9146ff, [], true);
      if (mod && !cfg.ticket_role) { db.setConfig(g.id, 'ticket_role', mod.id); cfg = db.getConfig(g.id); }
 
      // --- Rechte-Bausteine ---
      const EV = g.id;
      const R = (role, allow = [], deny = []) => (role ? [{ id: role.id, allow, deny }] : []);
      const bot = { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory] };
      const hidden = [{ id: EV, deny: [P.ViewChannel] }];
      const access = {
        public: [],
        sub: [...hidden, ...R(sub, [P.ViewChannel]), ...R(vip, [P.ViewChannel]), ...R(mod, [P.ViewChannel]), bot],
        team: [...hidden, ...R(mod, [P.ViewChannel]), bot],
        tickets: [...hidden, ...R(mod, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory]), bot],
      };
      const readonly = [{ id: EV, deny: [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads] }, ...R(mod, [P.SendMessages]), bot];
 
      // --- Kanäle anlegen (vorhandene werden wiederverwendet) ---
      const make = async (spec, type, parentId, options) => {
        let c = spec.key && cfg[spec.key] ? g.channels.cache.get(cfg[spec.key]) : null;
        c ??= g.channels.cache.find(x => x.name === spec.name && x.type === type && (parentId === undefined || x.parentId === parentId));
        if (c) return { c, isNew: false };
        c = await g.channels.create({ ...options, name: spec.name, type, parent: parentId, reason });
        newCh++;
        return { c, isNew: true };
      };
 
      const total = LAYOUT.reduce((n, cat) => n + 1 + cat.channels.length, 0);
      let done = 0;
      const refs = {}, fresh = new Set();
 
      for (const cat of LAYOUT) {
        let category = null;
        try {
          const r = await make(cat, T.GuildCategory, undefined, { permissionOverwrites: mergeOw(access[cat.access]) });
          category = r.c;
          if (cat.key) { db.setConfig(g.id, cat.key, category.id); cfg = db.getConfig(g.id); }
        } catch (e) { failed.push(`${cat.name}: ${e.message}`); }
        done++;
        for (const ch of cat.channels) {
          try {
            const type = ch.voice ? T.GuildVoice : T.GuildText;
            const ow = mergeOw([...access[cat.access], ...(ch.ro ? readonly : [])]);
            const r = await make(ch, type, category?.id, { permissionOverwrites: ow });
            if (ch.key) { db.setConfig(g.id, ch.key, r.c.id); cfg = db.getConfig(g.id); }
            if (ch.ref) { refs[ch.ref] = r.c; if (r.isNew) fresh.add(ch.ref); }
          } catch (e) { failed.push(`${ch.name}: ${e.message}`); }
          done++;
        }
        await i.editReply(`⏳ Baue den Server … ${done}/${total}`).catch(() => {});
      }
 
      // --- Start-Nachrichten (nur in neu erstellten Kanälen) ---
      const post = async (k, payload) => { if (fresh.has(k)) await refs[k].send(payload).catch(() => {}); };
      await post('welcome', { embeds: [embed(`👋 Willkommen auf ${g.name}!`, `Schön, dass du da bist! 💜\n\n• Regeln: ${refs.rules ?? '#regeln'}\n• Quatschen: ${refs.chat ?? '#allgemein'}\n• Stream-Zeiten: ${refs.schedule ?? '#zeitplan'}\n• Mit \`/rank\` siehst du dein Level, mit \`/help\` alle Befehle.`)] });
      await post('rules', { embeds: [embed('📜 Regeln', RULES)] });
      await post('schedule', { embeds: [embed('📅 Stream-Zeitplan', 'Die Stream-Zeiten findest du mit `/zeitplan anzeigen`.\nDas Team trägt sie mit `/zeitplan setzen` ein.')] });
      await post('ticket', {
        embeds: [embed('🎫 Support & Hilfe', 'Du brauchst Hilfe oder hast ein Anliegen?\nKlicke auf den Button – es wird ein privates Ticket für dich und das Team erstellt.')],
        components: [new ActionRowBuilder().addComponents(btn('ticket:open', 'Ticket öffnen', '🎫', ButtonStyle.Primary))],
      });
 
      // --- Ergebnis ---
      let text = newCh || newRoles
        ? `**${newCh}** Kanäle/Kategorien und **${newRoles}** Rollen erstellt.`
        : (failed.length ? '' : 'Es war schon alles eingerichtet.');
      text += '\n\n**Rollen:** 👮 Moderator (Team & Support) · 💜 Subscriber · ⭐ VIP\nVergib sie an deine Leute – Subscriber/VIP sehen den Sub-Bereich, Moderatoren den Team-Bereich.';
      text += '\n\n**Als Nächstes:** `/config streamer` (Live-Meldungen) · `/zeitplan setzen` · `/levelrole add` · `/config anzeigen`';
      if (failed.length) text += `\n\n❌ **Fehlgeschlagen:**\n${failed.map(f => `• ${f}`).join('\n').slice(0, 1400)}\n\nTypische Ursache: „Missing Permissions“ – AstraBot-Rolle nach oben schieben und \`/setup\` nochmal ausführen (Vorhandenes wird nicht doppelt angelegt).`;
      await i.editReply({ content: '', embeds: [embed(failed.length ? '⚠️ Setup teilweise abgeschlossen' : '✅ Server aufgebaut', text)] });
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
        .addRoleOption(o => o.setName('rolle').setDescription('Support-Rolle (leer = entfernen)')))
      .addSubcommand(s => s.setName('live').setDescription('Kanal und Ping für Live-Benachrichtigungen')
        .addChannelOption(o => o.setName('kanal').setDescription('Kanal für Live-Meldungen').addChannelTypes(T.GuildText, T.GuildAnnouncement))
        .addRoleOption(o => o.setName('pingrolle').setDescription('Rolle, die bei Live-Start gepingt wird'))
        .addBooleanOption(o => o.setName('everyone').setDescription('Zusätzlich @everyone pingen'))
        .addBooleanOption(o => o.setName('kein_ping').setDescription('Keinen Ping verwenden'))
        .addBooleanOption(o => o.setName('aus').setDescription('Live-Benachrichtigungen ausschalten')))
      .addSubcommand(s => s.setName('streamer').setDescription('Twitch-Kanäle für Live-Meldungen verwalten')
        .addStringOption(o => o.setName('aktion').setDescription('Was tun?').setRequired(true).addChoices(
          { name: 'Hinzufügen', value: 'add' }, { name: 'Entfernen', value: 'remove' }, { name: 'Liste anzeigen', value: 'list' }))
        .addStringOption(o => o.setName('name').setDescription('Twitch-Name oder Link, z.B. twitch.tv/name'))),
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
 
      if (sub === 'live') {
        if (i.options.getBoolean('aus')) { db.setConfig(g, 'live_channel', null); return i.reply({ content: '✅ Live-Benachrichtigungen sind ausgeschaltet.', ...EPH }); }
        const ch = i.options.getChannel('kanal'), role = i.options.getRole('pingrolle'), everyone = i.options.getBoolean('everyone');
        if (ch) db.setConfig(g, 'live_channel', ch.id);
        if (role) db.setConfig(g, 'live_role', role.id);
        if (everyone !== null) db.setConfig(g, 'live_everyone', everyone ? 1 : 0);
        if (i.options.getBoolean('kein_ping')) { db.setConfig(g, 'live_role', null); db.setConfig(g, 'live_everyone', 0); }
        const c = db.getConfig(g);
        return i.reply({ content: `✅ Live-Meldungen: ${c.live_channel ? `<#${c.live_channel}>` : 'noch kein Kanal – gib „kanal“ an'}\nPing: ${c.live_everyone ? '@everyone' : c.live_role ? `<@&${c.live_role}>` : 'keiner'}`, allowedMentions: { parse: [] }, ...EPH });
      }
 
      if (sub === 'streamer') {
        const action = i.options.getString('aktion');
        if (action === 'list') {
          const list = db.listStreamers(g);
          return i.reply({ content: list.length ? `📺 Überwachte Kanäle:\n${list.map(l => `• twitch.tv/${l}`).join('\n')}` : 'Noch keine Twitch-Kanäle. Mit `/config streamer` → Hinzufügen eintragen.', ...EPH });
        }
        const login = live.parseLogin(i.options.getString('name') ?? '');
        if (!login) return i.reply({ content: '❌ Bitte gib einen gültigen Twitch-Namen oder Link an (Feld „name“).', ...EPH });
        if (action === 'remove') return i.reply({ content: db.removeStreamer(g, login) ? `✅ **${login}** entfernt.` : 'Dieser Kanal steht nicht in der Liste.', ...EPH });
        if (!live.enabled()) return i.reply({ content: '❌ Die Twitch-API ist noch nicht eingerichtet. Trage `TWITCH_CLIENT_ID` und `TWITCH_CLIENT_SECRET` in Railway ein (Anleitung in der README).', ...EPH });
        if (db.listStreamers(g).length >= 10) return i.reply({ content: '❌ Maximal 10 Twitch-Kanäle pro Server.', ...EPH });
        await i.deferReply(EPH);
        let user;
        try { user = await live.userExists(login); } catch (e) { return i.editReply(`❌ Twitch-API-Fehler: ${e.message}`); }
        if (!user) return i.editReply(`❌ Auf Twitch gibt es keinen Kanal „${login}“.`);
        const added = db.addStreamer(g, user.login);
        const hint = db.getConfig(g).live_channel ? '' : '\n⚠️ Es ist noch kein Kanal für Live-Meldungen gesetzt – nutze `/config live`.';
        return i.editReply(added ? `✅ **${user.display_name}** wird jetzt überwacht.${hint}` : 'Dieser Kanal ist schon in der Liste.');
      }
      const c = db.getConfig(g);
      const e = embed(`⚙️ Einstellungen – ${i.guild.name}`).addFields(
        { name: 'Logs', value: show(c.log_channel), inline: true },
        { name: 'Level-Kanal', value: c.level_channel ? show(c.level_channel) : 'im jeweiligen Chat', inline: true },
        { name: 'Support-Rolle', value: c.ticket_role ? `<@&${c.ticket_role}>` : '—', inline: true },
        { name: 'Ticket-Kategorie', value: show(c.ticket_category), inline: true },
        { name: 'Join-to-create', value: show(c.join_channel), inline: true },
        { name: 'Twitch', value: c.twitch_url ?? '—', inline: true },
        { name: 'Live-Meldungen', value: `${show(c.live_channel)} · Ping: ${c.live_everyone ? '@everyone' : c.live_role ? `<@&${c.live_role}>` : 'keiner'}\nKanäle: ${db.listStreamers(g).join(', ') || '—'}`.slice(0, 1000) },
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
    data: cmd('voicepanel', 'Postet das Steuer-Panel in deinem Sprachraum erneut')
      .addChannelOption(o => o.setName('kanal').setDescription('Sprachraum (Standard: dein aktueller Raum)').addChannelTypes(T.GuildVoice)),
    async execute(i) {
      const ch = i.options.getChannel('kanal') ?? i.member.voice.channel;
      if (!ch) return i.reply({ content: '❌ Betritt zuerst deinen Sprachraum.', ...EPH });
      const row = db.getTemp(ch.id);
      if (!row) return i.reply({ content: '❌ Das ist kein AstraBot-Raum (Join-to-create).', ...EPH });
      if (row.owner_id !== i.user.id && !i.memberPermissions.has(P.ManageChannels)) return i.reply({ content: '❌ Nur der Besitzer des Raums darf das.', ...EPH });
      await ch.send(voicePanel());
      await i.reply({ content: `✅ Panel im Voice-Chat von ${ch} gepostet.`, ...EPH });
    },
  },
  {
    data: cmd('serverreset', 'Setzt den Server zurück (AstraBot-Daten oder ALLES)', P.Administrator)
      .addStringOption(o => o.setName('umfang').setDescription('Was soll zurückgesetzt werden?').setRequired(true).addChoices(
        { name: 'Nur AstraBot-Daten (XP, Verwarnungen, Einstellungen)', value: 'data' },
        { name: 'AstraBot-Daten + von AstraBot erstellte Kanäle', value: 'bot' },
        { name: 'ALLES: alle Kanäle, Rollen und AstraBot-Daten', value: 'all' })),
    async execute(i) {
      if (i.user.id !== i.guild.ownerId) return i.reply({ content: '❌ Nur der Serverinhaber darf das.', ...EPH });
      const mode = i.options.getString('umfang');
      const text = {
        data: 'Das löscht **alle AstraBot-Daten** dieses Servers: Einstellungen, XP/Level, Level-Rollen, Verwarnungen. Kanäle und Rollen bleiben.',
        bot: 'Das löscht **alle AstraBot-Daten** und zusätzlich die von AstraBot erstellten Kanäle und Kategorien (Logs, Level-Ups, Join-to-create, Tickets).',
        all: '**ALLE Kanäle und ALLE Rollen** (die der Bot löschen darf) werden gelöscht, dazu alle AstraBot-Daten. Es bleibt nur ein neuer Kanal „allgemein“.',
      }[mode];
      await i.reply({
        embeds: [embed('⚠️ Server-Reset', `${text}\n\n**Das kann nicht rückgängig gemacht werden.**${mode === 'all' ? '\nNach dem Klick musst du zusätzlich `RESET` eintippen.' : ''}`)],
        components: [new ActionRowBuilder().addComponents(btn(`reset:confirm:${i.user.id}:${mode}`, 'Ja, zurücksetzen', '🗑️', ButtonStyle.Danger), btn(`reset:cancel:${i.user.id}:${mode}`, 'Abbrechen', '✖️'))],
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
 
