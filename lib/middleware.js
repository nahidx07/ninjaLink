const db = require('./firebase');
module.exports = async (ctx, next) => {
  if (ctx.from) {
    try {
      await db.collection('users').doc(ctx.from.id.toString()).set({
        id: ctx.from.id, first_name: ctx.from.first_name || "Unknown",
        username: ctx.from.username || "none", last_seen: new Date().toISOString()
      }, { merge: true });
    } catch (e) { console.error(e); }
  }
  return next();
};
