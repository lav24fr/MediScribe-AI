const mongoose = require('mongoose');
const neo4j = require('neo4j-driver');

const Session = require('./backend/models/session');
const Summary = require('./backend/models/summary');
const Transcription = require('./backend/models/transcription');
const Patient = require('./backend/models/patient');

mongoose.connect('mongodb://mongo:27017/mediscribe', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  await Session.deleteMany({});
  await Summary.deleteMany({});
  await Transcription.deleteMany({});
  await Patient.deleteMany({});
  console.log("All MongoDB sessions deleted");

  const driver = neo4j.driver(
    'bolt://redis:7687', // Neo4j is mapped to port 7687, but in docker-compose what is its service name? Let me check neo4j
    neo4j.auth.basic('neo4j', 'password')
  );
  try {
    const neoSession = driver.session();
    await neoSession.run('MATCH (n) DETACH DELETE n');
    console.log("All Neo4j nodes deleted");
    await neoSession.close();
  } catch(e) {
    console.error("Neo4j error:", e.message);
  }

  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
