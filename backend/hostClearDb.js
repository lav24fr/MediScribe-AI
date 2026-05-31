const mongoose = require('mongoose');

const mongoUri = 'mongodb://admin:password123@localhost:27017/mediscribe-ai?authSource=admin';

mongoose.connect(mongoUri).then(async () => {
  const db = mongoose.connection.db;
  await db.collection('sessions').deleteMany({});
  await db.collection('summaries').deleteMany({});
  await db.collection('transcriptions').deleteMany({});
  await db.collection('patients').deleteMany({});
  
  console.log("All MongoDB sessions deleted");
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
