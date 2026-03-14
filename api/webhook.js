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

// ২. ক্লাউড চ্যানেল লিস্ট ডাটাবেস থেকে আনা
async function getCloudChannels() {
  const settings = await db.collection('settings').doc('cloud_config').get();
  if (settings.exists) {
    const channels = settings.data().channels || [];
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

    for (const channelId of cloudChannels) {
      try {
        const sentMsg = await ctx.telegram.copyMessage(channelId, ctx.chat.id, ctx.message.message_id, { caption: "" });
        backupRecords.push({ channel_id: channelId, message_id: sentMsg.message_id });
        
        if (channelId === cloudChannels[0]) {
          const infoText = `📥 <b>নতুন ফাইল আপলোড!</b>\n\n👤 <b>নাম:</b> ${firstName}\n🆔 <b>আইডি:</b> <code>${user.id}</code>\n🚀 <b>লিঙ্ক:</b> ${shareLink}`;
          await ctx.telegram.sendMessage(channelId, infoText, { parse_mode: 'HTML' });
        }
      } catch (err) {
        console.error(`Backup failed for ${channelId}`);
      }
    }

    if (backupRecords.length === 0) throw new Error("No backups successful");

    await db.collection('videos').doc(slug).set({
      slug,
      backups: backupRecords,
      uploader_id: user.id,
      created_at: new Date().toISOString()
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ ফাইল সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`, Markup.inlineKeyboard([[Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]]));

  } catch (error) {
    ctx.reply("❌ আপলোড ব্যর্থ! ক্লাউড চ্যানেল চেক করুন।");
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
        
        for (const b of backups) {
          try {
            await ctx.telegram.copyMessage(ctx.chat.id, b.channel_id, b.message_id);
            success = true; 
            break; 
          } catch (e) { continue; }
        }
        if (!success) ctx.reply("❌ দুঃখিত, সব ব্যাকআপ সার্ভার থেকে ফাইলটি মুছে গেছে।");
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

// ৫. এডমিন কমান্ড: ক্লাউড ম্যানেজমেন্ট
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

// ৬. নতুন কমান্ড: /sentdata [OldChannelID] [NewChannelID]
bot.command('sentdata', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  const oldID = args[1];
  const newID = args[2];

  if (!oldID || !newID) return ctx.reply("❌ সঠিক ফরম্যাট: /sentdata [OldID] [NewID]");

  try {
    const vids = await db.collection('videos').get();
    if (vids.empty) return ctx.reply("❌ কোনো ফাইল নেই।");

    await ctx.reply(`🔄 ব্যাকআপ ট্রান্সফার শুরু হয়েছে... মোট ${vids.size}টি ফাইল।`);

    let s = 0; let f = 0;
    for (const doc of vids.docs) {
      const data = doc.data();
      const oldBackup = data.backups.find(b => b.channel_id === oldID);

      if (oldBackup) {
        try {
          const sent = await ctx.telegram.copyMessage(newID, oldID, oldBackup.message_id);
          const updated = [...data.backups, { channel_id: newID, message_id: sent.message_id }];
          await db.collection('videos').doc(doc.id).update({ backups: updated });
          s++;
        } catch (e) { f++; }
      } else { f++; }
      await new Promise(r => setTimeout(r, 500)); // Rate limit protection
    }
    ctx.reply(`✅ সম্পন্ন!\n🚀 সফল: ${s}\n❌ ব্যর্থ: ${f}`);
  } catch (err) { ctx.reply("ত্রুটি ঘটেছে।"); }
});

// ৭. অন্যান্য কমান্ডসমূহ (/mydata, /user, /broadcast)
bot.command('mydata', async (ctx) => {
  const vids = await db.collection('videos').where('uploader_id', '==', ctx.from.id).get();
  if (vids.empty) return ctx.reply("❌ কোনো ফাইল নেই।");
  let list = `📂 আপনার মোট ফাইল: ${vids.size}টি\n\n`;
  vids.forEach((doc, i) => list += `${i+1}. <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

bot.command('user', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const users = await db.collection('users').get();
  let list = `👥 মোট ইউজার: ${users.size}\n\n`;
  users.forEach(doc => list += `• ${doc.data().first_name} (<code>${doc.id}</code>)\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ মেসেজ দিন।");
  const users = await db.collection('users').get();
  users.docs.forEach(doc => ctx.telegram.sendMessage(doc.id, msg).catch(() => {}));
  ctx.reply("✅ ব্রডকাস্ট শুরু হয়েছে।");
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
