const db = require('../lib/firebase');
module.exports = async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const id = ctx.message.text.split(' ')[1];
  if (!id) return ctx.reply("❌ নিয়ম: /data [userId]");
  const vids = await db.collection('videos').where('uploader_id', '==', parseInt(id)).get();
  if (vids.empty) return ctx.reply("❌ কোনো ফাইল নেই।");
  let list = `📂 ইউজার: ${id} এর ফাইল:\n\n`;
  vids.forEach((d, i) => list += `${i+1}. <code>${d.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
};
