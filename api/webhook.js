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

// ২. মিডিয়া হ্যান্ডলার (ফাইল আপলোড)
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে... লিঙ্ক তৈরি করা হচ্ছে।");

  try {
    const user = ctx.from;
    const firstName = user.first_name.replace(/[<>]/g, ''); 
    const mention = `<a href="tg://user?id=${user.id}">${firstName}</a>`;

    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id,
      { caption: "" } 
    );

    const slug = `file${generateRandomSlug(10)}`; 
    const botInfo = await ctx.telegram.getMe();
    const shareLink = `https://t.me/${botInfo.username}?start=${slug}`;

    const infoText = `📥 <b>নতুন ফাইল আপলোড!</b>\n\n` +
                     `👤 <b>নাম:</b> ${firstName}\n` +
                     `🆔 <b>আইডি:</b> <code>${user.id}</code>\n` +
                     `💌 <b>ম্যানশন:</b> ${mention}\n` +
                     `🚀 <b>লিঙ্ক:</b> ${shareLink}`;

    await ctx.telegram.sendMessage(process.env.CHANNEL_ID, infoText, { parse_mode: 'HTML' });

    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: sentMsg.message_id,
      uploader_id: user.id,
      created_at: new Date().toISOString()
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ ফাইলটি সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`, Markup.inlineKeyboard([[Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]]));

  } catch (error) {
    ctx.reply("❌ এরর! বট চ্যানেলে এডমিন আছে কি না চেক করুন।");
  }
});

// ৩. /start কমান্ড
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;

  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        user_id: userId,
        first_name: ctx.from.first_name,
        start_date: new Date().toISOString()
      });
    }

    if (startParam) {
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id);
      } else {
        ctx.reply("❌ ফাইলটি খুঁজে পাওয়া যায়নি।");
      }
    } else {
      await ctx.reply(`স্বাগতম! আপনার ফাইল শেয়ার করতে এখানে সেন্ড করুন। ✔️`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.url("🎬 Movie Channel", "https://t.me/MovieFantasyLover")]])
      });
    }
  } catch (error) { ctx.reply("ত্রুটি ঘটেছে।"); }
});

// ৪. এডমিন কমান্ডসমূহ (/data, /user, /broadcast)
bot.command('data', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const userId = ctx.message.text.split(' ')[1];
  if (!userId) return ctx.reply("❌ নিয়ম: /data [UserID]");

  const vids = await db.collection('videos').where('uploader_id', '==', parseInt(userId)).get();
  if (vids.empty) return ctx.reply("❌ এই ইউজারের কোনো ফাইল নেই।");

  let list = `👤 ইউজার: ${userId}\n📂 মোট ফাইল: ${vids.size}টি\n\n`;
  vids.forEach((doc, i) => list += `${i+1}. <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

bot.command('user', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const users = await db.collection('users').get();
  let list = `👥 মোট ইউজার: ${users.size} জন\n\n`;
  users.forEach(doc => {
    const u = doc.data();
    list += `• <a href="tg://user?id=${u.user_id}">${u.first_name}</a> (ID: <code>${u.user_id}</code>)\n`;
  });
  ctx.reply(list, { parse_mode: 'HTML' });
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ মেসেজ লিখুন।");
  
  const users = await db.collection('users').get();
  users.forEach(doc => ctx.telegram.sendMessage(doc.id, msg).catch(() => {}));
  ctx.reply("✅ ব্রডকাস্ট সম্পন্ন।");
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
