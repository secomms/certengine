const {connectToBlockchain, getReceiverAddress, getGas} = require("../../../connectors/blockchainConnector");


async function getSignedTransaction(data, nonce, price, sender){
    const web3 = await connectToBlockchain();
    const maxPriorityFeePerGas = price.maxPriorityFeePerGas
    const maxFeePerGas = price.maxFeePerGas

    const rawTx = {
        from: sender.address,
        to: await getReceiverAddress(),
        value: 0,
        gas: await getGas(),
        maxPriorityFeePerGas: web3.utils.toHex(maxPriorityFeePerGas),
        maxFeePerGas: web3.utils.toHex(maxFeePerGas),
        data: data,
        nonce : nonce,
        type: 2
    };
    return await web3.eth.accounts.signTransaction(rawTx, sender.privateKey);
}

module.exports = {
    getSignedTransaction,
}