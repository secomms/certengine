const {MktreeManagement} = require("../../../models/mktreeManagement");
const {connectToBlockchain} = require("../../../connectors/blockchainConnector");
const appLogger = require("../../loggers/applogger");


class Verifier{
    constructor(){
        this.mktreeManagement = new MktreeManagement();
    }

    async #getWeb3(blockchainURL) {
        return await connectToBlockchain(blockchainURL);
    }

    computeRootHash(plainData, merkleProof, hashAlgo){
        let merkleTools = this.mktreeManagement.getMerkleTree([], false, hashAlgo)
        return merkleTools.computeHashRoot(plainData, merkleProof);
    }

    async #getTransactionDataFromBC(transactionHash, blockchainURL){
        let data = null;
        let web3 = await this.#getWeb3(blockchainURL);
        try{
            let transaction = await web3.eth.getTransaction(transactionHash);
            if (!transaction) {
                appLogger.error({context:{txHash: transactionHash}},`Verifier - Transaction not found`);
            } else{
                data = transaction.input;
            }
        } catch (error) {
            appLogger.error({context:{txHash: transactionHash}, error:error},`Verifier - Error while searching the transaction`);
            throw error;
        }
        return data;
    }


    async getAllProofs(queueDoc){
        const tree = await this.mktreeManagement.getTree(queueDoc.treeID);
        return this.mktreeManagement.getAllProofs(tree, queueDoc.hashAlgo);
    }

    async verifyMerkle(plainData, bcInfo){
        const computedHashRoot = this.computeRootHash(plainData, bcInfo.merkleproof, bcInfo.hashAlgo);
        let readHashRoot = await this.#getTransactionDataFromBC(bcInfo.transactionHash, bcInfo.blockchainURL)
        return "0x"+computedHashRoot === readHashRoot;
    }


}

module.exports = {Verifier};