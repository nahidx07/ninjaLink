const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম স্লাগ জেনারেটর (ইউনিক ফাইল আইডি)
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// ২. ক্লাউড চ্যানেল লিস্ট ডাটাবেস থেকে আনা
async function getCloudChannels() {
  const settings = await db.collection('settings').doc('cloud_config').get();
  if (settings.exists) {
    const channels = settings.data().channels || [];
    // যদি ডাটাবেস খালি থাকে তবে এনভায়রনমেন্ট ভেরিয়েবল থেকে মেইন চ্যানেল নিবে
    return channels.length > 0 ? channels : [process.env.CHANNEL_ID];
  }
  return [process.env.CHANNEL_ID]; 
}

// ৩. মিডিয়া হ্যান্ডলার (সব ক্লাউড চ্যানেলে ব্যাকআপসহ)
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ ক্লাউড সার্ভারে ব্যাকআপ নেওয়া হচ্ছে...");

  try {
    const user = ctx.from;
    const firstName = user.first_name ? user.first_name.replace(/[<>]/g, '') : "Unknown";
    const slug = `file${generateRandomSlug(10)}`;
    const botInfo = await ctx.telegram.getMe();
    const shareLink = `https://t.me/${botInfo.username}?start=${slug}`;
    
    const cloudChannels = await getCloudChannels();
    let backupRecords = [];

    // লুপ চালিয়ে সব অ্যাক্টিভ ক্লাউড চ্যানেলে ফাইল কপি করা
    for (const channelId of cloudChannels) {
      try {
        const sentMsg = await ctx.telegram.copyMessage(channelId, ctx.chat.id, ctx.message.message_id, { caption: "" });
        backupRecords.push({ channel_id: channelId, message_id: sentMsg.message_id });
        
        // মেইন চ্যানেলে নোটিফিকেশন (প্রথম চ্যানেলটি মেইন হিসেবে ধরা হবে)
        if (channelId === cloudChannels[0]) {
          const infoText = `📥 <b>নতুন ফাইল আপলোড!</b>\n\n👤 <b>নাম:</b> ${firstName}\n🆔 <b>আইডি:</b> <code>${user.id}</code>\n🚀 <b>লিঙ্ক:</b> ${shareLink}`;
          await ctx.telegram.sendMessage(channelId, infoText, { parse_mode: 'HTML' });
        }
      } catch (err) {
        console.error(`Backup failed for ${channelId}`);
      }
    }

    if (backupRecords.length === 0) throw new Error("No backups successful");

    // ডাটাবেসে ফাইল ডিটেইলস সেভ করা
    await db.collection('videos').doc(slug).set({
      slug,
      backups: backupRecords,
      uploader_id: user.id,
      created_at: new Date().toISOString()
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ ফাইল সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`, Markup.inlineKeyboard([[Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]]));

  } catch (error) {
    ctx.reply("❌ আপলোড ব্যর্থ! ক্লাউড চ্যানেল এবং বটের পারমিশন চেক করুন।");
  }
});

// ৪. /start কমান্ড (স্মার্ট রিকভারি লজিক)
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;

  try {
    const userRef = db.collection('users').doc(userId);
    if (!(await userRef.get()).exists) {
      await userRef.set({ user_id: userId, first_name: ctx.from.first_name || "Unknown", start_date: new Date().toISOString() });
    }

    if (startParam && startParam.startsWith('file')) {
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        const backups = videoDoc.data().backups;
        let success = false;
        
        // সিরিয়ালি চেক করবে কোন চ্যানেলটি লাইভ আছে, সেখান থেকে ফাইল দিবে
        for (const b of backups) {
          try {
            await ctx.telegram.copyMessage(ctx.chat.id, b.channel_id, b.message_id);
            success = true; 
            break; 
          } catch (e) { continue; }
        }
        if (!success) ctx.reply("❌ দুঃখিত, সব ব্যাকআপ সার্ভার থেকে ফাইলটি মুছে গেছে বা চ্যানেল সাসপেন্ড হয়েছে।");
      } else {
        ctx.reply("❌ ফাইল খুঁজে পাওয়া যায়নি।");
      }
    } else {
      ctx.reply(`স্বাগতম! আপনার ফাইল শেয়ার করতে এখানে সেন্ড করুন। ✔️\n\nআপনার আপলোড করা ফাইল দেখতে লিখুন: /mydata`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.url("🎬 Movie Channel", "https://t.me/MovieFantasyLover")]])
      });
    }
  } catch (error) { ctx.reply("ত্রুটি ঘটেছে।"); }
});

// ৫. ইউজার কমান্ড: /mydata
bot.command('mydata', async (ctx) => {
  const vids = await db.collection('videos').where('uploader_id', '==', ctx.from.id).get();
  if (vids.empty) return ctx.reply("❌ আপনি কোনো ফাইল আপলোড করেননি।");

  let list = `📂 আপনার মোট ফাইল: ${vids.size}টি\n\n` +
             `💡 <b>ফাইল পেতে এই লিঙ্কে ক্লিক করুন:</b>\n` +
             `https://t.me/NinjaLink_bot?start=<code>[ফাইল আইডি]</code>\n\n` +
             `আপনার আইডিগুলো:\n\n`;

  vids.forEach((doc, i) => list += `${i+1}. <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

// ৬. এডমিন কমান্ড: ক্লাউড ম্যানেজমেন্ট
bot.command('addcloud', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const channelId = ctx.message.text.split(' ')[1];
  if (!channelId || !channelId.startsWith('-100')) return ctx.reply("❌ উদাহরণ: /addcloud -100123456789");

  const docRef = db.collection('settings').doc('cloud_config');
  const doc = await docRef.get();
  let channels = doc.exists ? doc.data().channels : [];
  if (channels.includes(channelId)) return ctx.reply("⚠️ অলরেডি আছে।");
  
  channels.push(channelId);
  await docRef.set({ channels });
  ctx.reply(`✅ যুক্ত হয়েছে! মোট ক্লাউড: ${channels.length}`);
});

bot.command('removecloud', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const channelId = ctx.message.text.split(' ')[1];
  const docRef = db.collection('settings').doc('cloud_config');
  const doc = await docRef.get();
  if (!doc.exists) return ctx.reply("❌ লিস্ট খালি।");
  
  let channels = doc.data().channels;
  const index = channels.indexOf(channelId);
  if (index > -1) {
    channels.splice(index, 1);
    await docRef.set({ channels });
    ctx.reply(`✅ রিমুভ হয়েছে। বাকি: ${channels.length}`);
  } else { ctx.reply("❌ আইডি পাওয়া যায়নি।"); }
});

bot.command('listcloud', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const channels = await getCloudChannels();
  let list = `☁️ **অ্যাক্টিভ ক্লাউড চ্যানেল:**\n\n`;
  channels.forEach((id, i) => list += `${i+1}. <code>${id}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

// ৭. অন্যান্য এডমিন কমান্ড (/user, /data, /broadcast)
bot.command('user', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const users = await db.collection('users').get();
  let list = `👥 মোট ইউজার: ${users.size}\n\n`;
  users.forEach(doc => list += `• ${doc.data().first_name} (<code>${doc.id}</code>)\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

bot.command('data', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const userId = ctx.message.text.split(' ')[1];
  if (!userId) return ctx.reply("❌ /data [UserID]");
  const vids = await db.collection('videos').where('uploader_id', '==', parseInt(userId)).get();
  if (vids.empty) return ctx.reply("❌ ফাইল নেই।");
  let list = `👤 ইউজার: ${userId}\n📂 ফাইল: ${vids.size}\n\n`;
  vids.forEach((doc, i) => list += `${i+1}. <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ মেসেজ লিখুন।");
  const users = await db.collection('users').get();
  const promises = users.docs.map(doc => ctx.telegram.sendMessage(doc.id, msg).catch(() => {}));
  const results = await Promise.allSettled(promises);
  let s = 0; let f = 0;
  results.forEach(res => res.status === 'fulfilled' ? s++ : f++);
  ctx.reply(`✅ সম্পন্ন!\n🚀 সফল: ${s}\n❌ ব্যর্থ: ${f}`);
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
