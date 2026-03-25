const pino = require('pino');
const dotenv = require("dotenv");
const {resolve} = require("path");

const dotenvResult = dotenv.config({ path: resolve(__dirname, '..', '..',  process.env.NODE_ENV === 'prod' ? '.env' : '.env') });
if (dotenvResult.error) {
    throw dotenvResult.error;
}

const transport = pino.transport({
    targets: [
        {
            target: 'pino-pretty',
            options: {
                colorize: true,
                ignore: 'hostname,req,res,responseTime',
            }
        },
    ],
});

const appLogger = pino(
    {
        level: process.env.LOG_LEVEL,
        msgPrefix: '[CERTENGINE] ',
        timestamp: pino.stdTimeFunctions.isoTime,
        serializers: {
            error: (err) => ({
                message: err.message,
                stack: err.stack,
                name: err.name,
            }),
        },
    },
    transport
);

module.exports = appLogger;