const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম স্লাগ জেনারেটর
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// ২. মিডিয়া হ্যান্ডলার (ফাইল আপলোড, ক্যাপশনসহ সেভ ও নোটিফিকেশন)
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে...");
  try {
    const user = ctx.from;
    const firstName = user.first_name ? user.first_name.replace(/[<>]/g, '') : "Unknown";
    const mention = `<a href="tg://user?id=${user.id}">${firstName}</a>`;
    const originalCaption = ctx.message.caption || "";

    // চ্যানেলে ফাইল কপি করা (ক্যাপশনসহ)
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id,
      { caption: originalCaption } 
    );

    const slug = `file${generateRandomSlug(10)}`; 
    const botInfo = await ctx.telegram.getMe();
    const shareLink = `https://t.me/${botInfo.username}?start=${slug}`;

    // চ্যানেলে নোটিফিকেশন পাঠানো
    const infoText = `📥 <b>নতুন ফাইল আপলোড!</b>\n\n` +
                     `👤 <b>নাম:</b> ${firstName}\n` +
                     `🆔 <b>আইডি:</b> <code>${user.id}</code>\n` +
                     `💌 <b>ম্যানশন:</b> ${mention}\n` +
                     `🚀 <b>লিঙ্ক:</b> ${shareLink}`;

    await ctx.telegram.sendMessage(process.env.CHANNEL_ID, infoText, { parse_mode: 'HTML' });

    // ডাটাবেসে সেভ করা
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: sentMsg.message_id,
      uploader_id: user.id,
      created_at: new Date().toISOString()
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ ফাইলটি সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`, Markup.inlineKeyboard([[Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]]));

  } catch (error) {
    console.error(error);
    ctx.reply("❌ এরর! বট চ্যানেলে এডমিন আছে কি না চেক করুন।");
  }
});

// ৩. /start কমান্ড (ফাইল রিকভারি - ক্যাপশন ছাড়া)
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;

  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({ user_id: userId, first_name: ctx.from.first_name || "Unknown", start_date: new Date().toISOString() });
    }

    if (startParam && startParam.startsWith('file')) {
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id, { caption: "" });
      } else {
        ctx.reply("❌ ফাইলটি খুঁজে পাওয়া যায়নি।");
      }
    } else {
      await ctx.reply(`স্বাগতম! আপনার ফাইল শেয়ার করতে এখানে সেন্ড করুন। ✔️`, {
        ...Markup.inlineKeyboard([[Markup.button.url("Developer Ninja", "https://t.me/DeveloperNinja")]])
      });
    }
  } catch (error) { ctx.reply("ত্রুটি ঘটেছে।"); }
});

// ৪. ইউজার কমান্ড: /mydata
bot.command('mydata', async (ctx) => {
  const vids = await db.collection('videos').where('uploader_id', '==', ctx.from.id).get();
  if (vids.empty) return ctx.reply("❌ আপনি এখনও কোনো ফাইল আপলোড করেননি।");
  let list = `📂 আপনার মোট আপলোড করা ফাইল: ${vids.size}টি\n\n`;
  vids.forEach((doc, i) => list += `${i+1}. আইডি: <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

// ৫. টেক্সট হ্যান্ডলার (আইডি দিলে ফাইল ক্যাপশন ছাড়া যাবে)
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

// ৬. এডমিন কমান্ডসমূহ
bot.command('data', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const userId = ctx.message.text.split(' ')[1];
  const vids = await db.collection('videos').where('uploader_id', '==', parseInt(userId)).get();
  if (vids.empty) return ctx.reply("❌ ফাইল নেই।");
  let list = `👤 ইউজার: ${userId}\n📂 মোট ফাইল: ${vids.size}টি\n\n`;
  vids.forEach((doc, i) => list += `${i+1}. আইডি: <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

bot.command('user', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const usersSnapshot = await db.collection('users').get();
  await ctx.reply(`👥 মোট ইউজার: <b>${usersSnapshot.size}</b> জন।`, { parse_mode: 'HTML' });
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ নিয়ম: /broadcast [মেসেজ]");
  const users = await db.collection('users').get();
  const promises = users.docs.map(doc => ctx.telegram.sendMessage(doc.id, msg));
  await Promise.allSettled(promises);
  ctx.reply(`✅ ব্রডকাস্ট সম্পন্ন!`);
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
