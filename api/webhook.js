const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. মাল্টি-মিডিয়া ও টেক্সট হ্যান্ডলার (ভিডিও, ফাইল, টেক্সট, লিংক ইত্যাদি)
bot.on(['video', 'document', 'audio', 'video_note', 'animation', 'text', 'photo'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে... দয়া করে অপেক্ষা করুন।");

  try {
    let messageId;

    // যদি ইউজার টেক্সট বা লিংক পাঠায়
    if (ctx.message.text) {
      const sentMsg = await ctx.telegram.sendMessage(process.env.CHANNEL_ID, ctx.message.text);
      messageId = sentMsg.message_id;
    } 
    // যদি ভিডিও, ফাইল বা অন্য মিডিয়া পাঠায়
    else {
      const sentMsg = await ctx.telegram.copyMessage(
        process.env.CHANNEL_ID,
        ctx.chat.id,
        ctx.message.message_id
      );
      messageId = sentMsg.message_id;
    }

    const slug = `Video${messageId}`;

    // Firebase-এ ডাটা সেভ করা
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: messageId,
      type: ctx.message.text ? 'text' : 'media',
      uploader_id: ctx.from.id,
      created_at: new Date().toISOString()
    });

    // শেয়ারিং লিঙ্ক তৈরি
    const shareLink = `https://t.me/${ctx.botInfo.username}?start=${slug}`;

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    
    await ctx.reply(
      `✅ আপনার আইটেমটি সফলভাবে সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`,
      Markup.inlineKeyboard([
        [Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]
      ])
    );

  } catch (error) {
    console.error("Processing Error:", error);
    ctx.reply("❌ এটি সেভ করা যায়নি। নিশ্চিত করুন বট চ্যানেলে অ্যাডমিন।");
  }
});

// ২. /start কমান্ড: লিঙ্ক থেকে ডাটা ডেলিভারি
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
        ctx.reply("❌ লিঙ্কটি সঠিক নয় বা ফাইলটি মুছে ফেলা হয়েছে।");
      }
    } else {
      ctx.reply(`স্বাগতম ${ctx.from.first_name}!\n\nযেকোনো ভিডিও, ফাইল বা টেক্সট এখানে পাঠান, আমি লিঙ্ক তৈরি করে দিব।`);
    }
  } catch (error) {
    ctx.reply("কিছু একটা সমস্যা হয়েছে।");
  }
});

// ৩. অ্যাডমিন ব্রডকাস্ট সিস্টেম
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
