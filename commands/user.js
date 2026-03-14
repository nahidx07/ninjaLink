const db = require('../lib/firebase');

module.exports = async (ctx) => {
  // শুধুমাত্র এডমিনের জন্য
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

  try {
    const usersSnapshot = await db.collection('users').get();
    await ctx.reply(`👥 মোট ইউজার: <b>${usersSnapshot.size}</b> জন।`, { 
      parse_mode: 'HTML' 
    });
  } catch (error) {
    console.error("User count error:", error);
    ctx.reply("❌ ইউজার সংখ্যা বের করতে সমস্যা হয়েছে।");
  }
};
