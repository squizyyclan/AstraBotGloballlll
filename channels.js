const { ChannelType: T, PermissionFlagsBits: P } = require('discord.js');
const db = require('../db');
const { cmd, embed, EPH, sendLog } = require('../utils');

const chanOpt = o => o.setName('kanal').setDescription('Kanal (Standard: aktueller Kanal)').addChannelTypes(T.GuildText, T.GuildAnnouncement);
const reasonOpt = o => o.setName('grund').setDescription('Grund').setMaxLength(300);

// --- Hilfen für /format und /glowup ---
const clean = s => s.replace(/^[^\p{L}\p{N}]+/u, '');
const isVoice = c => [T.GuildVoice, T.GuildStageVoice].includes(c.type);
const slug = s => s.toLowerCase().replace(/\s+/g, '-');

const EMOJI = [
  [/regel|rules/, '📜'], [/willkommen|welcome/, '👋'], [/ank(ü|ue)ndig|announce|news/, '📢'],
  [/live|stream|twitch/, '🔴'], [/clip|highlight/, '🎬'], [/meme|fun|lustig/, '😂'],
  [/musik|music|song/, '🎵'], [/game|gaming|spiel/, '🎮'], [/ticket|support|hilfe|help/, '🎫'],
  [/level|rank|xp/, '📈'], [/bot|command|befehl/, '🤖'], [/log/, '🗂️'], [/giveaway|verlos/, '🎁'],
  [/bild|foto|art|kunst|screenshot/, '🖼️'], [/video|youtube|yt/, '📺'], [/vorschlag|idee|suggest/, '💡'],
  [/voice|talk|lounge|sprach|warte|afk|raum/, '🔊'], [/chat|general|allgemein|quatsch/, '💬'],
];

async function renameRun(i, buildName, title) {
  await i.deferReply(EPH);
  const target = i.options.getChannel('kanal');
  const apply = i.options.getBoolean('anwenden') ?? false;
  const temps = new Set(db.allTemps().map(t => t.channel_id));
  const list = target ? [target] : [...i.guild.channels.cache.values()];
  const changes = [];
  for (const c of list) {
    if (c.type === T.GuildCategory || temps.has(c.id) || !c.manageable) continue;
    const name = buildName(c.name, isVoice(c))?.slice(0, 100);
    if (name && name !== c.name) changes.push({ c, name });
  }
  if (!changes.length) return i.editReply('Nichts zu ändern – alle Namen passen schon.');
  if (!apply) {
    const lines = changes.slice(0, 25).map(x => `\`${x.c.name}\` → \`${x.name}\``).join('\n');
    return i.editReply({ embeds: [embed(`${title} – Vorschau (${changes.length} Kanäle)`, `${lines}${changes.length > 25 ? '\n…' : ''}\n\nZum Durchführen den Befehl mit **anwenden: True** wiederholen.`)] });
  }
  let ok = 0;
  for (const { c, name } of changes) { try { await c.setName(name, `AstraBot ${title}`); ok++; } catch {} }
  await i.editReply(`✅ ${ok}/${changes.length} Kanäle umbenannt.`);
  sendLog(i.guild, embed(title, `${i.user}: ${ok} Kanäle umbenannt.`));
}

module.exports = [
  {
    data: cmd('lock', 'Sperrt einen Kanal für @everyone', P.ManageChannels).addChannelOption(chanOpt).addStringOption(reasonOpt),
    async execute(i) {
      const ch = i.options.getChannel('kanal') ?? i.channel;
      const reason = i.options.getString('grund') ?? 'Kein Grund angegeben';
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false, SendMessagesInThreads: false, AddReactions: false }, { reason: `${reason} | ${i.user.tag}` });
      await i.reply({ embeds: [embed('🔒 Kanal gesperrt', `${ch} wurde gesperrt.\n**Grund:** ${reason}`)] });
      sendLog(i.guild, embed('🔒 Lock', `${ch} von ${i.user}\n**Grund:** ${reason}`));
    },
  },
  {
    data: cmd('unlock', 'Entsperrt einen Kanal für @everyone', P.ManageChannels).addChannelOption(chanOpt),
    async execute(i) {
      const ch = i.options.getChannel('kanal') ?? i.channel;
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: null, SendMessagesInThreads: null, AddReactions: null }, { reason: i.user.tag });
      await i.reply({ embeds: [embed('🔓 Kanal entsperrt', `${ch} ist wieder offen.`)] });
      sendLog(i.guild, embed('🔓 Unlock', `${ch} von ${i.user}`));
    },
  },
  {
    data: cmd('slowmode', 'Stellt den Slowmode eines Kanals ein', P.ManageChannels)
      .addIntegerOption(o => o.setName('sekunden').setDescription('0 = aus, max. 21600 (6 Std.)').setMinValue(0).setMaxValue(21600).setRequired(true))
      .addChannelOption(chanOpt),
    async execute(i) {
      const ch = i.options.getChannel('kanal') ?? i.channel;
      const s = i.options.getInteger('sekunden');
      await ch.setRateLimitPerUser(s, i.user.tag);
      await i.reply({ embeds: [embed('🐌 Slowmode', s ? `${ch}: **${s}s** zwischen Nachrichten.` : `Slowmode in ${ch} ausgeschaltet.`)] });
      sendLog(i.guild, embed('🐌 Slowmode', `${ch} → ${s}s von ${i.user}`));
    },
  },
  {
    data: cmd('format', 'Vereinheitlicht Kanalnamen mit einem Stil-Symbol', P.ManageChannels)
      .addStringOption(o => o.setName('stil').setDescription('Symbol vor dem Kanalnamen').setRequired(true).addChoices(
        { name: 'Punkt ・chat', value: '・' }, { name: 'Balken ┃chat', value: '┃' }, { name: 'Pfeil 》chat', value: '》' },
        { name: 'Stern ✦chat', value: '✦' }, { name: 'Dreieck ▸chat', value: '▸' }, { name: 'Ohne Symbol (entfernen)', value: 'none' }))
      .addChannelOption(o => o.setName('kanal').setDescription('Nur dieser Kanal (Standard: alle Kanäle)'))
      .addBooleanOption(o => o.setName('anwenden').setDescription('True = wirklich umbenennen, False = nur Vorschau')),
    async execute(i) {
      const stil = i.options.getString('stil');
      const prefix = stil === 'none' ? '' : stil;
      return renameRun(i, (name, voice) => { const b = clean(name); return b ? prefix + (voice ? b : slug(b)) : null; }, '🎨 Format');
    },
  },
  {
    data: cmd('glowup', 'Verpasst Kanälen passende Emojis (Glow-up)', P.ManageChannels)
      .addChannelOption(o => o.setName('kanal').setDescription('Nur dieser Kanal (Standard: alle Kanäle)'))
      .addBooleanOption(o => o.setName('anwenden').setDescription('True = wirklich umbenennen, False = nur Vorschau')),
    async execute(i) {
      return renameRun(i, (name, voice) => {
        const b = clean(name);
        if (!b) return null;
        const hit = EMOJI.find(([re]) => re.test(b.toLowerCase()));
        return `${hit ? hit[1] : voice ? '🔊' : '💬'}・${voice ? b : slug(b)}`;
      }, '✨ Glow-up');
    },
  },
];
