const {connectToBlockchain} = require("../../../connectors/blockchainConnector");


async function getNonceFromBCForRedis(senderAddress){
    const web3 = await connectToBlockchain();
    let nonce = await web3.eth.getTransactionCount(senderAddress, 'latest')
    return Number(nonce)
}

module.exports = {
    getNonceFromBCForRedis
}