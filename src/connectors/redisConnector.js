const Redis = require('ioredis');
const {getNonceFromBCForRedis} = require("../services/transactions/explorers/explorer");
const appLogger = require("../services/loggers/applogger");
const {configurator} = require("../config");
const {getEthEurFromCryptocompare} = require("../services/transactions/oracols/cryptocompare");


let redisClient;

async function connectToRedis() {
    if (!redisClient || ["connecting", "ready"].includes(redisClient.status) === false) {
        try {
            redisClient = new Redis({
                port: await configurator.getConfig('redisconf.port'),
                host: await configurator.getConfig('redisconf.host'),
                password: await configurator.getConfig('redisconf.password')
            });

            redisClient.on('connect', () => {
                appLogger.info(undefined, 'REDIS - Connected');
            });

            redisClient.on('error', (error) => {
                appLogger.error({error:error}, 'REDIS - Error while connecting');
            });

            const {eur, status} = await getEthEurFromCryptocompare()
            await redisClient.set('cryptocompare_STATUS', status.toString())
            if(status){
                await redisClient.set('from_ETH_to_EUR', eur)
            }

            const sender = await configurator.getConfig('blockchain.ethSender.address')
            const nonce = await getNonceFromBCForRedis(sender)
            await redisClient.set(`nextNonce-${sender}`, nonce);
            await redisClient.set(`effectiveNonce-${sender}`, nonce);
            await redisClient.set(`concurrentTransactions-${sender}`, 0);
        } catch (error) {
            appLogger.error({error:error},'REDIS - Error while establishing connection');
            throw error;
        }
    }
    return redisClient;
}

async function disconnectFromRedis() {
    if (redisClient && redisClient.status !== "end") {
        try {
            await redisClient.quit();
            appLogger.warn(undefined, 'REDIS - Disconnected');
        } catch (error) {
            appLogger.error({error:error}, 'REDIS - Error while disconnecting');
        }
    }
}

module.exports = {
    connectToRedis,
    disconnectFromRedis
};
