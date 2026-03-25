const {connectToBlockchain, getBlockchainNameAndUrl} = require("../../../connectors/blockchainConnector");
const redisClient = require("../../redis/redisClient");
const {getSignedTransaction} = require("./transactionMaker");
const {dateFormatting} = require("../../../utils/common");
const {trasformInEur, fromWeiToGwei} = require("../oracols/common");
const appLogger = require("../../loggers/applogger");


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getNonceFromRedis(address){
    let actualNonce = await redisClient.getValue(`nextNonce-${address}`);
    await redisClient.setValue(`nextNonce-${address}`, Number(actualNonce)+1);
    return Number(actualNonce);
}


async function transact(data, nonce, price, sender){
    const web3 = await connectToBlockchain();
    const futureTransactionRetries = 5;

    const currentDate = new Date();
    let ts = dateFormatting(currentDate);
    const signedTx = await getSignedTransaction(data, nonce, price, sender)
    let retry = 0
    while(retry < futureTransactionRetries && retry !== -1){
        appLogger.debug(undefined,`nonce ${nonce} - retry ${retry}`)
        try{
            let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            const transactionHash = receipt.transactionHash
            const effectiveGasPrice = Number(receipt.effectiveGasPrice)
            const gasUsed = Number(receipt.gasUsed)
            const {name, url} = await getBlockchainNameAndUrl()
            let {eur: eur, status:status} = await redisClient.getEURfromRedis() //getEUR();
            return {
                blockchainURL: url,
                blockchainName: name,
                transactionHash: transactionHash,
                transactionTimestamp: ts,
                priceEUR: await trasformInEur(fromWeiToGwei(effectiveGasPrice), gasUsed, eur),
                wallet: sender.address
            }
        }catch (e) {
            appLogger.error({context:{nonce:nonce, price:price, reason: e.reason}, error:e},"Certifier - Error while transacting");
            if(e?.cause?.code === -32000){
                const errorMessage = e.cause.message;
                if (errorMessage === 'replacement transaction underpriced') {
                    await sleep(5000);
                    retry++;
                }
                if (errorMessage.startsWith('nonce too low')) {
                    await sleep(5000);
                    await redisClient.recoverNonce(sender.address);
                    nonce = await redisClient.getValue(`nextNonce-${sender.address}`);
                    retry++;
                }
                if (errorMessage === 'transaction underpriced') {
                    retry=-1;
                }
            }else{
                retry = -1
                throw e;
            }
        }
    }
}

async function transactOnBC(data, gasPrice, sender){
    let receipt = null;
    let nonce;
    try{
        await redisClient.blindIncrement(`concurrentTransactions-${sender.address}`);
        nonce = await getNonceFromRedis(sender.address)
        appLogger.debug(`nonce: ${nonce} - merkle root: ${data}`);
        receipt = await transact(data, nonce, gasPrice, sender)
        if(receipt){
            await redisClient.blindDecrement(`concurrentTransactions-${sender.address}`);
        }else{
            throw new Error("Transaction failed with nonce " + nonce);
        }

    } catch (error) {
        appLogger.error({context:{price:gasPrice}, error:error},'Certifier - Error while sending the transaction');
        await redisClient.blindDecrement(`concurrentTransactions-${sender.address}`);
        throw error;
    }

    return receipt;
}

module.exports = {transactOnBC}