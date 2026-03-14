const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// অটোমেটিক ইউজার সেভ করার মিডলওয়্যার
bot.use(async (ctx, next) => {
  if (ctx.from) {
    try {
      await db.collection('users').doc(ctx.from.id.toString()).set({
        id: ctx.from.id,
        first_name: ctx.from.first_name || "Unknown",
        username: ctx.from.username || "none",
        last_seen: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("User save error:", e);
    }
  }
  return next();
});

// র‍্যান্ডম স্লাগ জেনারেটর
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// মিডিয়া হ্যান্ডলার
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে...");
  try {
    const originalCaption = ctx.message.caption || ""; 
    const slug = `file${generateRandomSlug(10)}`; 
    const botInfo = await ctx.telegram.getMe();
    const shareLink = `https://t.me/${botInfo.username}?start=${slug}`;
    
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID, 
      ctx.chat.id, 
      ctx.message.message_id, 
      { caption: originalCaption }
    );

    try {
      const userName = (ctx.from.first_name || "User").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const logMessage = `📥 <b>নতুন ফাইল আপলোড!</b>\n\n` +
                         `👤 নাম: ${userName}\n` +
                         `🆔 আইডি: <code>${ctx.from.id}</code>\n` +
                         `💌 ম্যানশন: <a href="tg://user?id=${ctx.from.id}">${userName}</a>\n` +
                         `🚀 লিঙ্ক: ${shareLink}`;
      await ctx.telegram.sendMessage(process.env.CHANNEL_ID, logMessage, { parse_mode: 'HTML' });
    } catch (e) { console.error("Info msg error:", e); }

    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: sentMsg.message_id,
      uploader_id: ctx.from.id,
      created_at: new Date().toISOString()
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ ফাইলটি সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`, Markup.inlineKeyboard([
        [Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${encodeURIComponent(shareLink)}`)]
    ]));
  } catch (error) {
    console.error("Main error:", error);
    ctx.reply("❌ এরর! বটের চ্যানেলে এডমিন পারমিশন আছে কি না চেক করুন।");
  }
});

// /start কমান্ড
bot.start(async (ctx) => {
  const startParam = ctx.startPayload;
  if (!startParam) {
    return ctx.reply(`স্বাগতম! ফাইল শেয়ার করতে এখানে ফাইল পাঠান।`, Markup.inlineKeyboard([
        [Markup.button.url("🎬 Movie Channel", "https://t.me/MovieFantasyLover")]
    ]));
  }

  const videoDoc = await db.collection('videos').doc(startParam).get();
  if (videoDoc.exists) {
    await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id, { caption: "" });
  } else {
    ctx.reply("❌ ফাইলটি খুঁজে পাওয়া যায়নি।");
  }
});

// /mydata কমান্ড
bot.command('mydata', async (ctx) => {
  const vids = await db.collection('videos').where('uploader_id', '==', ctx.from.id).get();
  if (vids.empty) return ctx.reply("❌ আপনি এখনও কোনো ফাইল আপলোড করেননি।");
  let list = `📂 আপনার মোট আপলোড করা ফাইল: ${vids.size}টি\n\n`;
  vids.forEach((doc, i) => list += `${i+1}. আইডি: <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

// টেক্সট হ্যান্ডলার
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('file')) {
    const videoDoc = await db.collection('videos').doc(text).get();
    if (videoDoc.exists) {
      await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id, { caption: "" });
    } else {
      ctx.reply("❌ দুঃখিত, এই আইডি দিয়ে কোনো ফাইল পাওয়া যায়নি।");
    }
  }
});

// এডমিন কমান্ড: /data
bot.command('data', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const userId = ctx.message.text.split(' ')[1];
  if (!userId) return ctx.reply("❌ নিয়ম: /data [userId]");
  const vids = await db.collection('videos').where('uploader_id', '==', parseInt(userId)).get();
  if (vids.empty) return ctx.reply("❌ কোনো ফাইল পাওয়া যায়নি।");
  let list = `👤 ইউজার: ${userId}\n📂 মোট ফাইল: ${vids.size}টি\n\n`;
  vids.forEach((doc, i) => list += `${i+1}. আইডি: <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

// এডমিন কমান্ড: /user
bot.command('user', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const usersSnapshot = await db.collection('users').get();
  await ctx.reply(`👥 মোট ইউজার: <b>${usersSnapshot.size}</b> জন।`, { parse_mode: 'HTML' });
});

// এডমিন কমান্ড: /broadcast (ফিক্সড লজিক)
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ নিয়ম: /broadcast [মেসেজ]");
  
  const users = await db.collection('users').get();
  let count = 0;
  for (const doc of users.docs) {
    try {
      await ctx.telegram.sendMessage(doc.id, msg);
      count++;
    } catch (e) { continue; }
  }
  ctx.reply(`✅ ব্রডকাস্ট সম্পন্ন! ${count} জনের কাছে মেসেজ পৌঁছেছে।`);
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
