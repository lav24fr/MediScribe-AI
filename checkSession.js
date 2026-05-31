const mongoose = require('mongoose');
const Session = require('./backend/models/session');

mongoose.connect('mongodb://localhost:27017/mediscribe', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  const session = await Session.findById('6a1a9c776b8d26c22c163331');
  console.log("Session status:", session.status);
  console.log("Session:", session);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
