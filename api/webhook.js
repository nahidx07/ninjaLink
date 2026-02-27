const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. /start কমান্ড: 'Video' + ID ফরম্যাট চেক করবে
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload; // উদাহরণ: Video1971

  try {
    // Firebase-এ ইউজার ডাটা সেভ (Nahid এর ডাটাবেজে ইউজার ট্র্যাকিং হবে)
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        user_id: userId,
        username: ctx.from.username || 'N/A',
        first_name: ctx.from.first_name,
        start_date: new Date().toISOString()
      });
    }

    if (startParam) {
      // ডাটাবেজ থেকে এই স্লাগটি (যেমন: Video1971) খুঁজবে
      const videoRef = db.collection('videos').doc(startParam);
      const videoDoc = await videoRef.get();

      if (videoDoc.exists) {
        const { message_id } = videoDoc.data();
        // স্টোরেজ চ্যানেল থেকে ভিডিওটি কপি করে পাঠানো হবে
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
      } else {
        ctx.reply("❌ দুঃখিত, এই লিংকে কোনো ভিডিও পাওয়া যায়নি। সঠিক লিঙ্ক ব্যবহার করুন।");
      }
    } else {
      ctx.reply("স্বাগতম! ভিডিও পেতে আমাদের জেনারেট করা লিঙ্ক ব্যবহার করুন।");
    }
  } catch (error) {
    console.error(error);
    ctx.reply("কিছু একটা সমস্যা হয়েছে। দয়া করে এডমিনের সাথে যোগাযোগ করুন।");
  }
});

// ২. /add কমান্ড: Video + ID ফরম্যাটে লিঙ্ক তৈরি করা
// ব্যবহার: /add Video1971 1971
bot.command('add', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Not Authorized!");

  const args = ctx.message.text.split(' ');
  if (args.length < 3) return ctx.reply("❌ ফরম্যাট: /add [লিঙ্ক_নাম] [মেসেজ_আইডি]\nউদাহরণ: /add Video1971 1971");

  const slug = args[1]; // Video1971
  const messageId = parseInt(args[2]); // 1971

  if (isNaN(messageId)) return ctx.reply("❌ মেসেজ আইডি অবশ্যই সংখ্যা হতে হবে।");

  try {
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: messageId,
      created_at: new Date().toISOString()
    });

    ctx.reply(`✅ লিঙ্ক তৈরি হয়েছে!\n\n🔗 লিঙ্ক: https://t.me/${ctx.botInfo.username}?start=${slug}`);
  } catch (error) {
    ctx.reply("❌ ডাটাবেজে সেভ করতে সমস্যা হয়েছে।");
  }
});

// ৩. /broadcast কমান্ড: সবাইকে মেসেজ পাঠানো
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Not Authorized!");
  
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("মেসেজ লিখুন।");

  const usersSnapshot = await db.collection('users').get();
  let count = 0;
  ctx.reply("ব্রডকাস্ট শুরু হয়েছে...");

  for (const doc of usersSnapshot.docs) {
    try {
      await ctx.telegram.sendMessage(doc.id, msg);
      count++;
    } catch (e) { continue; }
  }
  ctx.reply(`✅ ব্রডকাস্ট সফল! ${count} জনকে পাঠানো হয়েছে।`);
});

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) { res.status(500).send('Error'); }
};
