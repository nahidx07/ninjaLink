const { Markup } = require('telegraf');
const db = require('../lib/firebase');
module.exports = async (ctx) => {
  const param = ctx.startPayload;
  if (!param) return ctx.reply("স্বাগতম!", Markup.inlineKeyboard([[Markup.button.url("🎬 Channel", "https://t.me/MovieFantasyLover")]]));
  const doc = await db.collection('videos').doc(param).get();
  if (doc.exists) await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, doc.data().message_id);
  else ctx.reply("❌ ফাইলটি পাওয়া যায়নি।");
};
