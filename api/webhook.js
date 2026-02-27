const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. অটো ভিডিও আপলোড হ্যান্ডলার (User video পাঠালে)
bot.on(['video', 'document'], async (ctx) => {
  // শুধুমাত্র এডমিন ভিডিও আপলোড করে লিঙ্ক তৈরি করতে পারবে (সিকিউরিটির জন্য)
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return ctx.reply("দুঃখিত, শুধুমাত্র এডমিন ভিডিও আপলোড করতে পারবেন।");
  }

  const waitMsg = await ctx.reply("প্রসেসিং হচ্ছে, দয়া করে অপেক্ষা করুন...");

  try {
    // ক) ভিডিওটি আপনার স্টোরেজ চ্যানেলে ফরওয়ার্ড/কপি করা
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id
    );

    const messageId = sentMsg.message_id;
    const slug = `Video${messageId}`;

    // খ) Firebase ডাটাবেজে অটো সেভ করা
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: messageId,
      created_at: new Date().toISOString(),
      uploader_id: ctx.from.id
    });

    // গ) ইউজারকে অটো জেনারেটেড লিঙ্ক দেওয়া
    const botUser = await ctx.telegram.getMe();
    const shareLink = `https://t.me/${botUser.username}?start=${slug}`;

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ অটোমেটিক সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}\n📂 চ্যানেল মেসেজ আইডি: ${messageId}`);

  } catch (error) {
    console.error(error);
    ctx.reply("❌ আপলোড করতে সমস্যা হয়েছে। নিশ্চিত করুন বট চ্যানেলে এডমিন।");
  }
});

// ২. /start কমান্ড: Video+ID স্লাগ দিয়ে ভিডিও ডেলিভারি
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;

  try {
    // ইউজার ডাটা সেভ
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
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        const { message_id } = videoDoc.data();
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
      } else {
        ctx.reply("❌ এই লিংকে কোনো ভিডিও পাওয়া যায়নি।");
      }
    } else {
      ctx.reply("স্বাগতম! ভিডিও বা ফাইল শেয়ার করতে এটি ব্যবহার করুন।");
    }
  } catch (error) {
    ctx.reply("কিছু একটা সমস্যা হয়েছে।");
  }
});

// ৩. /broadcast কমান্ড (আগের মতোই)
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("মেসেজ লিখুন।");

  const usersSnapshot = await db.collection('users').get();
  ctx.reply("ব্রডকাস্ট শুরু হয়েছে...");
  let count = 0;
  for (const doc of usersSnapshot.docs) {
    try {
      await ctx.telegram.sendMessage(doc.id, msg);
      count++;
    } catch (e) { continue; }
  }
  ctx.reply(`✅ সফল! ${count} জনকে পাঠানো হয়েছে।`);
});

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) { res.status(500).send('Error'); }
};
