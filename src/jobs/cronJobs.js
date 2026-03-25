const cron = require('node-cron');
const redisClient = require('../services/redis/redisClient');
const {cacheBCInfo} = require("./cachingBCJobs");


function startCronJob() {
    cron.schedule('0 * * * * *', async () => {
        await cacheBCInfo()
    });

    cron.schedule('0 */15 * * * *', async () => {
        await redisClient.saveOnRedisETHtoEUR();
    });
}


module.exports = { startCronJob };