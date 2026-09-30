const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType: T, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits: P } = require('discord.js');
const db = require('./db');
const { embed, EPH, sendLog } = require('./utils');
 
async function handleComponent(i) {
  const [scope, action, ...rest] = i.customId.split(':');
  if (scope === 'ticket') return ticket(i, action);
  if (scope === 'voice') return voice(i, action);
  if (scope === 'reset') return reset(i, action, rest);
}
 
// ---------- Tickets ----------
async function ticket(i, action) {
  const g = i.guild;
  const cfg = db.getConfig(g.id);
  if (action === 'open') {
    const existing = g.channels.cache.find(c => c.topic === `ticket:${i.user.id}`);
    if (existing) return i.reply({ content: `Du hast bereits ein Ticket: ${existing}`, ...EPH });
    await i.deferReply(EPH);
    const overwrites = [
      { id: g.id, deny: [P.ViewChannel] },
      { id: i.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] },
      { id: g.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.EmbedLinks] },
    ];
    const role = cfg.ticket_role && g.roles.cache.get(cfg.ticket_role);
    if (role) overwrites.push({ id: role.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] });
    const ch = await g.channels.create({
      name: `ticket-${i.user.username}`.slice(0, 90),
      type: T.GuildText,
      parent: cfg.ticket_category && g.channels.cache.has(cfg.ticket_category) ? cfg.ticket_category : undefined,
      topic: `ticket:${i.user.id}`,
      permissionOverwrites: overwrites,
    });
    await ch.send({
      content: `${i.user}${role ? ` ${role}` : ''}`,
      embeds: [embed('🎫 Ticket geöffnet', 'Beschreibe dein Anliegen – das Team meldet sich bald.\nMit dem Button unten schließt du das Ticket.')],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel('Ticket schließen').setEmoji('🔒').setStyle(ButtonStyle.Danger))],
      allowedMentions: { users: [i.user.id], roles: role ? [role.id] : [] },
    });
    sendLog(g, embed('🎫 Ticket geöffnet', `${i.user} → ${ch}`));
    return i.editReply(`✅ Dein Ticket: ${ch}`);
  }
  if (action === 'close') {
    const topic = i.channel.topic || '';
    if (!topic.startsWith('ticket:')) return i.reply({ content: 'Das ist kein Ticket-Kanal.', ...EPH });
    const ownerId = topic.split(':')[1];
    const isSupport = cfg.ticket_role && i.member.roles.cache.has(cfg.ticket_role);
    if (i.user.id !== ownerId && !isSupport && !i.memberPermissions.has(P.ManageChannels)) return i.reply({ content: '❌ Du darfst dieses Ticket nicht schließen.', ...EPH });
    await i.reply('🔒 Ticket wird in 5 Sekunden geschlossen …');
    sendLog(g, embed('🔒 Ticket geschlossen', `#${i.channel.name} von <@${ownerId}> – geschlossen von ${i.user}`));
    setTimeout(() => i.channel.delete('Ticket geschlossen').catch(() => {}), 5000);
  }
}
 
// ---------- Voice-Panel ----------
function ownedTemp(i) {
  const vc = i.member?.voice?.channel;
  if (!vc) return { err: 'Du musst dazu in deinem Sprachraum sein.' };
  const row = db.getTemp(vc.id);
  if (!row) return { err: 'Das ist kein AstraBot-Raum.' };
  if (row.owner_id !== i.user.id) return { err: 'Nur der Besitzer des Raums darf das.' };
  return { vc };
}
 
const modal = (id, title, label, max) =>
  new ModalBuilder().setCustomId(id).setTitle(title).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(TextInputStyle.Short).setMaxLength(max).setRequired(true)),
  );
 
async function voice(i, action) {
  const { vc, err } = ownedTemp(i);
  if (err) return i.reply({ content: `❌ ${err}`, ...EPH });
 
  if (action === 'rename') return i.showModal(modal('voice:renamemodal', 'Raum umbenennen', 'Neuer Name', 90));
  if (action === 'limit') return i.showModal(modal('voice:limitmodal', 'Nutzerlimit', 'Limit (0 = unbegrenzt, max. 99)', 2));
 
  await i.deferReply(EPH);
  if (action === 'lock') {
    await vc.permissionOverwrites.edit(i.user.id, { Connect: true });
    await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: false });
    return i.editReply('🔒 Raum gesperrt – niemand Neues kann beitreten.');
  }
  if (action === 'unlock') {
    await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: null });
    return i.editReply('🔓 Raum wieder offen.');
  }
  if (action === 'renamemodal') {
    await vc.setName(i.fields.getTextInputValue('value').slice(0, 90));
    return i.editReply('✏️ Raum umbenannt.');
  }
  if (action === 'limitmodal') {
    const n = parseInt(i.fields.getTextInputValue('value'), 10);
    if (isNaN(n) || n < 0 || n > 99) return i.editReply('❌ Bitte eine Zahl von 0 bis 99 eingeben.');
    await vc.setUserLimit(n);
    return i.editReply(`👥 Limit: ${n === 0 ? 'unbegrenzt' : n}`);
  }
}
 
// ---------- Server-Reset ----------
async function reset(i, action, [uid, mode]) {
  if (i.user.id !== uid || i.user.id !== i.guild.ownerId) return i.reply({ content: '❌ Das darf nur der Serverinhaber.', ...EPH });
  if (action === 'cancel') return i.update({ content: 'Abgebrochen.', embeds: [], components: [] });
 
  // Bei „ALLES“: zweite Sicherheitsabfrage per Eingabefeld
  if (action === 'confirm' && mode === 'all') return i.showModal(modal(`reset:modal:${uid}:all`, 'Server komplett zurücksetzen', 'Tippe RESET zur Bestätigung', 5));
  if (action === 'modal' && i.fields.getTextInputValue('value').trim() !== 'RESET') return i.reply({ content: '❌ Falsche Eingabe – nichts wurde gelöscht.', ...EPH });
 
  if (action === 'confirm') await i.update({ content: '⏳ Setze zurück …', embeds: [], components: [] });
  else await i.deferReply(EPH);
 
  const g = i.guild;
  const reason = `AstraBot Reset von ${i.user.tag}`;
  let chDeleted = 0, roleDeleted = 0, fresh = null;
 
  if (mode === 'bot') {
    const cfg = db.getConfig(g.id);
    for (const id of [cfg.log_channel, cfg.level_channel, cfg.join_channel, cfg.join_category, cfg.ticket_category]) {
      const c = id && g.channels.cache.get(id);
      if (c && (await c.delete(reason).then(() => true).catch(() => false))) chDeleted++;
    }
  }
 
  if (mode === 'all') {
    // Erst einen neuen Kanal anlegen, damit der Server nie ohne Kanal dasteht
    fresh = await g.channels.create({ name: 'allgemein', type: T.GuildText, reason });
    for (const c of [...g.channels.cache.values()]) {
      if (c.id === fresh.id) continue;
      if (await c.delete(reason).then(() => true).catch(() => false)) chDeleted++;
    }
    const top = g.members.me.roles.highest.position;
    for (const r of [...g.roles.cache.values()]) {
      if (r.id === g.id || r.managed || r.position >= top) continue;
      if (await r.delete(reason).then(() => true).catch(() => false)) roleDeleted++;
    }
  }
 
  db.resetGuild(g.id);
  const info = mode === 'data' ? '' : `\n🗑️ ${chDeleted} Kanäle${mode === 'all' ? `, ${roleDeleted} Rollen` : ''} gelöscht.`;
  const done = `✅ AstraBot wurde auf diesem Server zurückgesetzt.${info}\nMit \`/setup\` startest du neu.`;
  await i.editReply(done).catch(() => {});
  if (fresh) fresh.send(done).catch(() => {});
}
 
module.exports = { handleComponent };
