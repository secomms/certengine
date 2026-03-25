const axios = require("axios");
const {configurator} = require("../../../config");
const {getGas} = require("../../../connectors/blockchainConnector");


async function estimateTransactionTime(weiGasPrice) {
    const apiKey = await configurator.getConfig('etherscanKey')

    const response = await axios.get(`https://api.etherscan.io/v2/api?chainid=1&module=gastracker&action=gasestimate&gasprice=${weiGasPrice}&apikey=${apiKey}`)
    if(response.status === 200) {
        const secs = Number(response.data.result)
        const minutes = Math.floor(secs / 60);
        const remainingSeconds = secs % 60;
        return `${minutes} min : ${remainingSeconds} sec`;
    }else{
        return undefined
    }
}

async function trasformInEur(gweiPrice, effectiveGas, eur) {
    const gas = effectiveGas || await getGas()
    const etherPrice = (gweiPrice*gas)/1000000000;
    return etherPrice*eur;
}


function fromGweiToWei(Gwei){
    return Math.floor(Gwei*1000000000)
}
function fromWeiToGwei(wei){
    return wei/1000000000
}
function fromGweiToEth(gwei){
    return gwei/1000000000
}

module.exports = {
    trasformInEur,
    estimateTransactionTime,
    fromGweiToWei,
    fromWeiToGwei,
    fromGweiToEth
}