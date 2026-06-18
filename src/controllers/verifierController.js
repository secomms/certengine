const {handlerSuccessRequest} = require("../responseHandlers/handlerSuccessRequest");
const {handlerErrorRequest} = require("../responseHandlers/handlerErrorRequest");
const appLogger = require("../services/loggers/applogger");
const {connectToBlockchain} = require("../connectors/blockchainConnector");
const {verifyMerkle} = require("../services/transactions/verification/integrityVerification");
const {verifyAuthCentralized} = require("../services/transactions/verification/authenticityVerification");

class VerifierController {


    async #getWeb3(blockchainURL) {
        return await connectToBlockchain(blockchainURL);
    }

    async #getTransactionDataFromBC(transactionHash, blockchainURL){
        let data = null;
        let web3 = await this.#getWeb3(blockchainURL)
        try{
            let transaction = await web3.eth.getTransaction(transactionHash);
            if (!transaction) {
                appLogger.error({context:{txHash: transactionHash}},`Verifier - Transaction not found`);
            } else{
                data = {
                    from: transaction.from,
                    merkleRoot:transaction.input
                };
            }
        } catch (error) {
            appLogger.error({context:{txHash: transactionHash}, error:error},`Verifier - Error while searching the transaction`);
            throw error;
        }
        return data;
    }

    async verify(req, res) {
        const proof = req.body.proof;
        const txHash = req.body.transactionHash;
        const data = req.body.data;
        const blockchainURL = req.body.blockchainURL;
        const hashAlgo = req.body.hashAlgorithm;

        const bcInfo = {
            merkleproof: proof,
            transactionHash: txHash,
            blockchainURL: blockchainURL,
            hashAlgo: hashAlgo
        }
        let result = {}

        try{
            const transactionData = await this.#getTransactionDataFromBC(txHash, blockchainURL);
            if (!transactionData) {
                return res.status(400).json(handlerErrorRequest({error: 'Transaction not found'}));
            }
            const integrity = verifyMerkle(data, transactionData.merkleRoot, bcInfo);
            result.integrity = { passed: integrity, reason: integrity ? "OK" : "TAMPERED DATA" };

            const authenticity = await verifyAuthCentralized(transactionData.from);
            result.authenticity = {passed: authenticity, reason: authenticity ? "OK" : "ISSUER NOT AUTHORIZED" };


            const virdict = integrity && authenticity
            return res.status(200).json(handlerSuccessRequest({valid: virdict, integrity: result.integrity, authenticity: result.authenticity}));

        }catch (error) {
            appLogger.error({context:{bcInfo:bcInfo}, error:error}, "Error while verifying certification proof");
            return res.status(500).json(handlerErrorRequest({message: "Internal server error"}));
        }
    }




}
module.exports = {
    VerifierController
};