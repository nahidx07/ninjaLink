const db = require('../lib/firebase');
module.exports = async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং...");
  const slug = `file${Math.random().toString(36).substring(2, 12)}`;
  const sent = await ctx.telegram.copyMessage(process.env.CHANNEL_ID, ctx.chat.id, ctx.message.message_id, { caption: ctx.message.caption || "" });
  await db.collection('videos').doc(slug).set({ slug, message_id: sent.message_id, uploader_id: ctx.from.id, created_at: new Date().toISOString() });
  await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
  ctx.reply(`✅ সেভ হয়েছে! আইডি: <code>${slug}</code>`, { parse_mode: 'HTML' });
};
