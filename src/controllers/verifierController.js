const {handlerSuccessRequest} = require("../responseHandlers/handlerSuccessRequest");
const {handlerErrorRequest} = require("../responseHandlers/handlerErrorRequest");
const appLogger = require("../services/loggers/applogger");
const {Verifier} = require("../services/transactions/verification/verifier");

class VerifierController {
    constructor() {
        this.verifier = new Verifier();
    }

    async verifyMerkleProof(req, res) {
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
        try{
            const result = await this.verifier.verifyMerkle(data, bcInfo);
            return res.status(200).json(handlerSuccessRequest({valid: result}));

        }catch (error) {
            appLogger.error({context:{bcInfo:bcInfo}, error:error}, "Error while verifying certification proof");
            return res.status(500).json(handlerErrorRequest({message: "Internal server error"}));
        }
    }




}
module.exports = {
    VerifierController
};