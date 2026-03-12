require('dotenv').config();
module.exports = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGO_URI,
    redisUrl: process.env.REDIS_URL,
    geminiApiKey: process.env.GEMINI_API_KEY,
    googleCloudProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    googleCloudKeyFile: process.env.GOOGLE_CLOUD_KEY_FILE,
    graphDb: {
        uri: process.env.NEO4J_URI,
        user: process.env.NEO4J_USER,
        password: process.env.NEO4J_PASSWORD
      },
};
