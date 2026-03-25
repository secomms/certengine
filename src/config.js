const dotenv = require('dotenv');
const { resolve } = require("path");
const { Vault } = require("./services/vault/infisicalVault");

const dotenvResult = dotenv.config({ path: resolve(__dirname, '.env') });
if (dotenvResult.error) {
    throw dotenvResult.error;
}

class Configurator {
    constructor() {
        this.config = {
            node_environment: process.env.NODE_ENV,
            log_level: process.env.LOG_LEVEL || 'info',
            useVault: process.env.USE_VAULT === 'true',

            server: {
                port: process.env.CERT_ENGINE_PORT,
                main_server_url: process.env.MAIN_SERVER_URL,
            },
            projectName: process.env.PROJECT_NAME,
            databaseMongo: {
                connection_string: process.env.MONGO_DATABASE_CONNECTION_STRING,
            },
            redisconf: {
                host: process.env.REDIS_HOST,
                port: process.env.REDIS_PORT,
            },
            blockchain: {
                gas: Number(process.env.GAS),
                blockchainURL: process.env.BLOCKCHAIN_URL,
                blockchainName: process.env.BLOCKCHAIN_NAME,
                chainId: process.env.CHAIN_ID,
            }
        };
    }

    async #loadSecrets() {
        let secrets;

        if (this.config.useVault) {
            const v2 = new Vault(
                process.env.VAULT_CLIENT_ID,
                process.env.VAULT_CLIENT_SECRET,
                process.env.VAULT_PROJECT_ID,
                process.env.NODE_ENV
            );
            secrets = await v2.getSecrets();
        } else {
            secrets = {
                REDIS_PASSWORD: process.env.REDIS_PASSWORD,
                ETHERSCAN_KEY: process.env.ETHERSCAN_KEY,
                OWLRACLE_KEY: process.env.OWLRACLE_KEY,
                CRYPTOCOMPARE_KEY: process.env.CRYPTOCOMPARE_KEY,
                SENDER_ADDR: process.env.SENDER_ADDR,
                SENDER_PRIVKEY: process.env.SENDER_PRIVKEY,
                RECEIVER_ADDR: process.env.RECEIVER_ADDR,
            };
        }

        this.config.redisconf.password = secrets.REDIS_PASSWORD;
        this.config.etherscanKey = secrets.ETHERSCAN_KEY;
        this.config.owlracleKey = secrets.OWLRACLE_KEY;
        this.config.blockchain.cryptocompareKey = secrets.CRYPTOCOMPARE_KEY;
        this.config.blockchain.ethSender = {
            address: secrets.SENDER_ADDR,
            privateKey: secrets.SENDER_PRIVKEY
        };
        this.config.blockchain.ethReceiver = {
            address: secrets.RECEIVER_ADDR,
        };
    }

    #getNestedConfig(obj, key) {
        return key.split('.').reduce((acc, part) => acc?.[part], obj);
    }

    async getConfig(key) {
        let value = this.#getNestedConfig(this.config, key);

        if (value === undefined) {
            await this.#loadSecrets();
        }

        return this.#getNestedConfig(this.config, key);
    }
}

const configurator = new Configurator();

module.exports = {
    configurator
};