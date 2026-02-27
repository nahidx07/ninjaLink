const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. যেকোনো সাইজের ভিডিও বা ফাইল হ্যান্ডলার
bot.on(['video', 'document', 'audio', 'video_note', 'animation'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ বড় ফাইল প্রসেসিং হচ্ছে... দয়া করে কয়েক সেকেন্ড অপেক্ষা করুন।");

  try {
    // ক) সরাসরি copyMessage ব্যবহার করা (এটি ফাইলের সাইজ যাই হোক না কেন কাজ করবে)
    // কারণ এটি ফাইল ডাউনলোড করে না, শুধু টেলিগ্রাম সার্ভার থেকে কপি করে।
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id
    );

    const messageId = sentMsg.message_id;
    const slug = `Video${messageId}`;

    // খ) Firebase-এ তথ্য সেভ করা
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: messageId,
      file_name: ctx.message.document?.file_name || 'Video File',
      uploader_id: ctx.from.id,
      created_at: new Date().toISOString()
    });

    // গ) শেয়ারিং লিঙ্ক তৈরি
    const shareLink = `https://t.me/${ctx.botInfo.username}?start=${slug}`;

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    
    await ctx.reply(
      `✅ আপনার বড় ফাইলটি সফলভাবে সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`,
      Markup.inlineKeyboard([
        [Markup.button.url("🚀 Share This File", `https://t.me/share/url?url=${shareLink}`)]
      ])
    );

  } catch (error) {
    console.error("Big File Error:", error);
    ctx.reply("❌ ফাইলটি সেভ করা যায়নি। নিশ্চিত করুন বট চ্যানেলে অ্যাডমিন এবং ফাইলটি এখনো টেলিগ্রাম সার্ভারে আছে।");
  }
});

// ২. /start কমান্ড এবং অন্যান্য লজিক আগের মতোই থাকবে...
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;

  try {
    // ইউজার ট্র্যাকিং (Nahid এর ডাটাবেজে)
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
      ctx.reply("স্বাগতম! যেকোনো সাইজের ফাইল পাঠান, আমি লিঙ্ক তৈরি করে দিব।");
    }
  } catch (error) {
    ctx.reply("কিছু একটা সমস্যা হয়েছে।");
  }
});

// ৩. অ্যাডমিন ব্রডকাস্ট সিস্টেম
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  const usersSnapshot = await db.collection('users').get();
  for (const doc of usersSnapshot.docs) {
    try { await ctx.telegram.sendMessage(doc.id, msg); } catch (e) {}
  }
  ctx.reply("ব্রডকাস্ট সম্পন্ন।");
});

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) { res.status(500).send('Error'); }
};
