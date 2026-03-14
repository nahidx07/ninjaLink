const db = require('../lib/firebase');
module.exports = async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ নিয়ম: /broadcast [মেসেজ]");
  const users = await db.collection('users').get();
  let count = 0;
  for (const doc of users.docs) {
    try { await ctx.telegram.sendMessage(doc.id, msg); count++; } catch (e) {}
  }
  ctx.reply(`✅ ব্রডকাস্ট সম্পন্ন! ${count} জনের কাছে পৌঁছেছে।`);
};
