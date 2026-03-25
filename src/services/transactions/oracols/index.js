const {getBlockchainNameAndUrl, getGas} = require("../../../connectors/blockchainConnector");
const {etherscanGasPriceOracol} = require("./etherscan");
const {owlracolGasPriceOracol} = require("./owlracol");
const {trasformInEur, estimateTransactionTime, fromGweiToWei} = require("./common");
const appLogger = require("../../loggers/applogger");
const redisClient = require("../../redis/redisClient");



async function getAdjustedGasPriceBasedOnTransactionsConcurrency(price, concurrentTransactions){
    let baseFee = price.baseFee
    let maxPriorityFeePerGas = price.maxPriorityFeePerGas;
    let maxFeePerGas = price.maxFeePerGas;
    let {eur: eur, status:status} = await redisClient.getEURfromRedis() //getEUR();
    if(!status){
        throw new Error('Problem with API Cryptocompare')
    }
    if(concurrentTransactions === 0){
        price['minPriceEUR'] = await trasformInEur(price.baseFee + price.maxPriorityFeePerGas, undefined, eur)
        price['maxPriceEUR'] = await trasformInEur(price.maxFeePerGas, undefined, eur)
        return price;
    }

    baseFee = baseFee + baseFee * concurrentTransactions * 0.10
    maxFeePerGas = baseFee + maxPriorityFeePerGas;


    return {
        baseFee: baseFee,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        maxFeePerGas: maxFeePerGas,
        minPriceEUR: await trasformInEur(baseFee + maxPriorityFeePerGas, undefined, eur),
        maxPriceEUR: trasformInEur(maxFeePerGas, undefined, eur),
        estimatedTime: await estimateTransactionTime(fromGweiToWei(baseFee+maxPriorityFeePerGas))
    }

}

async function predictGasPrice(){
    try{
        const blockchainNameAndUrl = await getBlockchainNameAndUrl();
        const gas = await getGas()

        if(blockchainNameAndUrl.blockchainName === "Ethereum Mainnet"){
            return await etherscanGasPriceOracol(gas)
        }else{
            return await owlracolGasPriceOracol(gas)
        }
    }catch (error) {
        appLogger.error({error:error}, "Oracols - Error while asking for gas price to the oracol");
    }

}

module.exports = {
    predictGasPrice,
    getAdjustedGasPriceBasedOnTransactionsConcurrency
}