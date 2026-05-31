const mongoose = require('mongoose');
const neo4j = require('neo4j-driver');
const config = require('./config');

const Session = require('./models/session');
const Summary = require('./models/summary');
const Transcription = require('./models/transcription');
const Patient = require('./models/patient');

mongoose.connect(config.mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  await Session.deleteMany({});
  await Summary.deleteMany({});
  await Transcription.deleteMany({});
  await Patient.deleteMany({});
  console.log("All MongoDB sessions deleted");

  if (config.graphDb.uri) {
    const driver = neo4j.driver(
      config.graphDb.uri,
      neo4j.auth.basic(config.graphDb.user, config.graphDb.password)
    );
    try {
      const neoSession = driver.session();
      await neoSession.run('MATCH (n) DETACH DELETE n');
      console.log("All Neo4j nodes deleted");
      await neoSession.close();
    } catch(e) {
      console.error("Neo4j error:", e.message);
    }
  }

  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
