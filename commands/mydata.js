const db = require('../lib/firebase');

module.exports = async (ctx) => {
  try {
    const vids = await db.collection('videos').where('uploader_id', '==', ctx.from.id).get();
    
    if (vids.empty) {
      return ctx.reply("❌ আপনি এখনও কোনো ফাইল আপলোড করেননি।");
    }

    let list = `📂 আপনার মোট আপলোড করা ফাইল: ${vids.size}টি\n\n`;
    vids.forEach((doc, i) => {
      list += `${i + 1}. আইডি: <code>${doc.data().slug}</code>\n`;
    });
    
    ctx.reply(list, { parse_mode: 'HTML' });
  } catch (error) {
    console.error("Mydata error:", error);
    ctx.reply("❌ ডাটা লোড করতে সমস্যা হয়েছে।");
  }
};
